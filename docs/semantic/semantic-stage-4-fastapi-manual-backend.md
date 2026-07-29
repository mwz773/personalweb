# Semantic Stage 4: public semantic-search endpoint

Type these additions into `backend/main.py`. This endpoint is deliberately public, but its SQL returns only **published** nodes and never returns drafts, suggested edges, owner data, or raw vectors.

## 1. Add this import

Add this beneath the existing FastAPI imports:

```python
from pydantic import BaseModel, Field
```

## 2. Add settings and request model

Add this below the Stage 3 suggestion settings:

```python
PUBLIC_SEARCH_LIMIT = int(os.getenv("PUBLIC_SEARCH_LIMIT", "12"))


class PublicSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=240)
    types: list[str] = []
```

## 3. Add this endpoint below the Stage 3 endpoint

```python
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
```

## 4. Optional setting

Add this to `backend/.env` if you want to set a different result cap:

```dotenv
PUBLIC_SEARCH_LIMIT=12
```

## 5. Restart and test

Restart FastAPI:

```sh
cd /Users/zhangmandy/personalweb/backend
source .venv/bin/activate
python -m uvicorn main:app --reload --port 8000
```

Then, after the frontend update, use the public search field. Search only returns published items that have been embedded. For the first test, publish and embed two related items, then search for the shared concept.

Do not add authentication to this endpoint: its protection is the explicit `node.status = 'published'` filter and its deliberately small, public-only response shape. Do not return similarity scores or embeddings to visitors.
