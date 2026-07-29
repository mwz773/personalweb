# Semantic Stage 3: candidate generation endpoint

Type the following changes into your existing `backend/main.py`. This stage does not add database tables—the Stage 1 `blocks` and `edges` tables already contain everything it needs.

The endpoint finds the most similar blocks belonging to your other nodes, aggregates to the best match per target node, and stores only `suggested` edges. It will never overwrite an `accepted` or `dismissed` review decision.

## 1. Add settings below `EMBEDDING_MODEL`

```python
SUGGESTION_THRESHOLD = float(os.getenv("SUGGESTION_THRESHOLD", "0.35"))
SUGGESTION_LIMIT = int(os.getenv("SUGGESTION_LIMIT", "8"))
```

## 2. Add this endpoint below `embed_node`

```python
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
```

## 3. Add optional values to `backend/.env`

```dotenv
SUGGESTION_THRESHOLD=0.35
SUGGESTION_LIMIT=8
```

The threshold is a starting point, not a claim that `0.35` is universally correct. We will tune it after reviewing your actual matches.

## 4. Restart FastAPI

```sh
cd backend
source .venv/bin/activate
python -m uvicorn main:app --reload --port 8000
```

## What the endpoint protects

- Requires the existing valid Supabase owner session.
- Checks that the requested node belongs to the signed-in owner.
- Considers only other nodes that belong to that owner.
- Stores the source and target block that provide evidence for the suggestion.
- Preserves accepted/dismissed relationships; only still-suggested relationships may be refreshed.

## Test

1. Embed at least two content items with substantive text.
2. In `/admin`, open one embedded item and choose **Generate suggestions**.
3. The private panel should list candidate items, their matching paragraph excerpts, and a relevance percentage.
4. Accept one, dismiss one, then run suggestion generation again. The dismissed suggestion must not return.

If the server reports a SQL error, copy its exact terminal error message. Do not lower Row Level Security or delete the unique constraint to bypass it.
