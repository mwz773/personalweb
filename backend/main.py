import os
import re
from collections.abc import Generator
from contextlib import contextmanager
from typing import Annotated

import httpx
import psycopg
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer


load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
ALLOWED_ORIGIN = os.getenv("SEMANTIC_ALLOWED_ORIGIN", "http://localhost:5173")
EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
)

app = FastAPI(title="Personal Web Semantic Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization", "Content-Type"],
)

model = SentenceTransformer(EMBEDDING_MODEL)


@contextmanager
def database_connection() -> Generator[psycopg.Connection, None, None]:
    with psycopg.connect(DATABASE_URL) as connection:
        yield connection


def chunk_markdown(markdown: str) -> list[str]:
    """Create paragraph-level blocks; no overlap in the first version."""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", markdown)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_`~]", "", text)

    paragraphs = re.split(r"\n\s*\n", text)
    blocks = []
    for paragraph in paragraphs:
        cleaned = re.sub(r"\s+", " ", paragraph).strip()
        if len(cleaned) >= 40:
            blocks.append(cleaned)

    return blocks


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(str(value) for value in values) + "]"


async def verify_owner(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token")

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": authorization,
            },
        )

    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")

    return response.json()["id"]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": EMBEDDING_MODEL}


@app.post("/admin/nodes/{node_id}/embed")
async def embed_node(node_id: str, owner_id: str = Depends(verify_owner)) -> dict[str, object]:
    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select markdown_content
                from public.nodes
                where id = %s and owner_id = %s
                """,
                (node_id, owner_id),
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found")

            cursor.execute(
                """
                update public.nodes
                set embedding_status = 'processing', embedding_error = null
                where id = %s
                """,
                (node_id,),
            )
        connection.commit()

    try:
        blocks = chunk_markdown(row[0])
        if not blocks:
            raise ValueError("Add at least one paragraph with 40 or more characters before embedding.")

        vectors = await run_in_threadpool(
            model.encode,
            blocks,
            normalize_embeddings=True,
            convert_to_numpy=False,
        )

        with database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("delete from public.blocks where node_id = %s", (node_id,))
                for ordinal, (block, vector) in enumerate(zip(blocks, vectors, strict=True)):
                    cursor.execute(
                        """
                        insert into public.blocks
                          (node_id, ordinal, content, embedding, embedding_model, embedded_at)
                        values (%s, %s, %s, %s::extensions.vector, %s, now())
                        """,
                        (node_id, ordinal, block, vector_literal(vector.tolist()), EMBEDDING_MODEL),
                    )
                cursor.execute(
                    """
                    update public.nodes
                    set embedding_status = 'ready',
                        embedding_model = %s,
                        last_embedded_at = now(),
                        embedding_error = null
                    where id = %s
                    """,
                    (EMBEDDING_MODEL, node_id),
                )
            connection.commit()
    except Exception as error:
        with database_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update public.nodes
                    set embedding_status = 'failed', embedding_error = %s
                    where id = %s
                    """,
                    (str(error)[:500], node_id),
                )
            connection.commit()
        raise HTTPException(status_code=500, detail="Embedding failed") from error

    return {"node_id": node_id, "block_count": len(blocks), "model": EMBEDDING_MODEL}