# Semantic Stage 2: FastAPI embedding service

You will type the backend files in this guide yourself. The service runs locally at first; it securely accepts an owner request from the existing dashboard, verifies the Supabase session, chunks one node’s Markdown, generates local MiniLM embeddings, and writes private `blocks` rows.

## 1. Create these folders and files

```text
backend/
├── .env
├── .env.example
├── requirements.txt
└── main.py
```

Do not put `backend/.env` in Git. It contains your database password.

## 2. Type `backend/requirements.txt`

```text
fastapi
uvicorn[standard]
psycopg[binary]
sentence-transformers
httpx
python-dotenv
```

## 3. Type `backend/.env.example`

```dotenv
# Use Supabase's Session Pooler connection string for local development if
# your network cannot reach the direct IPv6 database endpoint.
DATABASE_URL=

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SEMANTIC_ALLOWED_ORIGIN=http://localhost:5173
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

Copy this to `backend/.env` and fill it in:

- `DATABASE_URL`: Supabase dashboard → **Connect** → **Session pooler** connection string. It includes the database password; do not send it to me or put it in frontend files.
- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`: use the same values already in `frontend/.env`, but without the `VITE_` prefix.

Supabase recommends a direct connection for long-lived persistent backends when IPv6 is available; otherwise its Session Pooler is the practical IPv4-compatible alternative. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)

## 4. Type `backend/main.py`

```python
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
```

## 5. Install and run it locally

From `backend/`:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Then open `http://localhost:8000/health`. It should return JSON with `"status": "ok"` and the MiniLM model name. The first start downloads the model, so it can take a little longer.

## 6. Enable the dashboard button

Add this line to `frontend/.env`, then restart Vite:

```dotenv
VITE_SEMANTIC_API_URL=http://localhost:8000
```

## Safety notes

- `DATABASE_URL` is a backend secret. Never prefix it with `VITE_`, add it to frontend files, commit it, or send it in chat.
- The service calls Supabase Auth’s `/auth/v1/user` endpoint to validate the dashboard’s current bearer token, then verifies that the requested node belongs to that user before it can write blocks.
- This endpoint is intentionally synchronous for one node at a time. We will add background processing only if measured save/embedding latency makes it necessary.
- If your local network cannot reach the direct Supabase database endpoint, use the dashboard’s **Session Pooler** string as described above.

## Stage 2 test

1. Keep FastAPI running locally.
2. Sign in at `/admin` and open a content item with a real paragraph.
3. Click **Embed this item**.
4. Confirm its dashboard status changes to **Semantic: ready**.
5. In Supabase Table Editor, verify that `blocks` has paragraph-level rows for that node.
6. Sign out and try the public site: it must still work and cannot invoke the owner embedding action.

If any step fails, send the exact terminal or dashboard error. Do not put database credentials into the frontend to work around it.
