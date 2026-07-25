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
from pydantic import BaseModel, Field


load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
ALLOWED_ORIGIN = os.getenv("SEMANTIC_ALLOWED_ORIGIN", "http://localhost:5173")
EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
)
SUGGESTION_THRESHOLD = float(os.getenv("SUGGESTION_THRESHOLD", "0.35"))
SUGGESTION_LIMIT = int(os.getenv("SUGGESTION_LIMIT", "8"))

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

@app.post("/admin/nodes/{node_id}/suggestions")
async def generate_suggestions(
    node_id: str,
    owner_id: str = Depends(verify_owner),
) -> dict[str, int]:
    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select exists (
                  select 1
                  from public.nodes
                  where id = %s and owner_id = %s
                )
                """,
                (node_id, owner_id),
            )
            if not cursor.fetchone()[0]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Content not found",
                )

            cursor.execute(
                """
                select exists (
                  select 1
                  from public.blocks
                  where node_id = %s and embedding is not null
                )
                """,
                (node_id,),
            )
            if not cursor.fetchone()[0]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Embed this item before generating suggestions",
                )

            cursor.execute(
                """
                with scored_matches as (
                  select
                    source_block.id as source_block_id,
                    target_block.id as target_block_id,
                    target_block.node_id as target_node_id,
                    greatest(
                      0::real,
                      least(
                        1::real,
                        1 - (source_block.embedding <=> target_block.embedding)
                      )
                    )::real as confidence_score
                  from public.blocks as source_block
                  join public.blocks as target_block
                    on target_block.node_id <> source_block.node_id
                    and target_block.embedding is not null
                  join public.nodes as target_node
                    on target_node.id = target_block.node_id
                  where source_block.node_id = %s
                    and source_block.embedding is not null
                    and target_node.owner_id = %s
                ),
                best_match_per_node as (
                  select distinct on (target_node_id)
                    source_block_id,
                    target_block_id,
                    target_node_id,
                    confidence_score
                  from scored_matches
                  where confidence_score >= %s
                  order by target_node_id, confidence_score desc
                ),
                limited_matches as (
                  select *
                  from best_match_per_node
                  order by confidence_score desc
                  limit %s
                ),
                upserted_edges as (
                  insert into public.edges (
                    source_node_id,
                    target_node_id,
                    source_block_id,
                    target_block_id,
                    relationship_type,
                    confidence_score,
                    status,
                    origin
                  )
                  select
                    %s,
                    target_node_id,
                    source_block_id,
                    target_block_id,
                    'related_to',
                    confidence_score,
                    'suggested',
                    'semantic_suggestion'
                  from limited_matches
                  on conflict (source_node_id, target_node_id)
                  do update set
                    source_block_id = excluded.source_block_id,
                    target_block_id = excluded.target_block_id,
                    confidence_score = excluded.confidence_score,
                    created_at = now()
                  where public.edges.status = 'suggested'
                  returning id
                )
                select count(*) from upserted_edges
                """,
                (node_id, owner_id, SUGGESTION_THRESHOLD, SUGGESTION_LIMIT, node_id),
            )
            suggestion_count = cursor.fetchone()[0]
        connection.commit()

    return {"suggestion_count": suggestion_count}


PUBLIC_SEARCH_LIMIT = int(os.getenv("PUBLIC_SEARCH_LIMIT", "12"))


class PublicSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=240)
    types: list[str] = []


@app.post("/public/search")
async def public_semantic_search(request: PublicSearchRequest) -> dict[str, object]:
    query = re.sub(r"\s+", " ", request.query).strip()
    allowed_types = {"reflection", "project", "article", "book", "music"}
    selected_types = [content_type for content_type in request.types if content_type in allowed_types]

    if len(query) < 2:
        raise HTTPException(status_code=400, detail="Enter at least two characters to search")

    vector = await run_in_threadpool(
        model.encode,
        [query],
        normalize_embeddings=True,
        convert_to_numpy=False,
    )

    with database_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                with block_matches as (
                  select
                    node.id as node_id,
                    node.slug,
                    node.type,
                    node.title,
                    node.summary,
                    block.content as excerpt,
                    greatest(
                      0::real,
                      least(1::real, 1 - (block.embedding <=> %s::extensions.vector))
                    )::real as similarity
                  from public.blocks as block
                  join public.nodes as node on node.id = block.node_id
                  where node.status = 'published'
                    and block.embedding is not null
                    and (
                      cardinality(%s::text[]) = 0
                      or node.type = any(%s::text[])
                    )
                ),
                best_block_per_node as (
                  select distinct on (node_id)
                    node_id, slug, type, title, summary, excerpt, similarity
                  from block_matches
                  order by node_id, similarity desc
                )
                select node_id, slug, type, title, summary, excerpt
                from best_block_per_node
                order by similarity desc
                limit %s
                """,
                (
                    vector_literal(vector[0].tolist()),
                    selected_types,
                    selected_types,
                    PUBLIC_SEARCH_LIMIT,
                ),
            )
            rows = cursor.fetchall()

    return {
        "results": [
            {
                "id": row[0],
                "slug": row[1],
                "type": row[2],
                "title": row[3],
                "summary": row[4],
                "excerpt": row[5][:420],
            }
            for row in rows
        ]
    }