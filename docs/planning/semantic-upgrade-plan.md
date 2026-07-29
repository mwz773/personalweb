# Semantic Portfolio Upgrade Plan

## Purpose

This plan evolves the working Supabase portfolio into the semantic portfolio originally scoped in [`semantic-portfolio-scope.md`](semantic-portfolio-scope.md). It preserves the current React frontend, Supabase Auth, Postgres database, RLS policies, published content, projects, and manual connections.

There will be **no rewrite**. Manual connections remain valid, first-class editorial choices even after automatic suggestions exist.

## Working agreement

- I will implement frontend changes.
- For backend work—FastAPI/Python, database migrations, pgvector SQL, deployment configuration, and secrets—I will provide exact code and explain where it goes. You will type and run it yourself.
- We complete and test one stage before starting the next. A semantic feature is never exposed publicly until you have reviewed it.

## Target architecture

```text
Public visitor
  → React + Vite frontend
  → Supabase public read policies for published nodes and accepted edges

Owner dashboard
  → React + Vite frontend + Supabase Auth session
  → FastAPI semantic service (owner JWT required)
  → Supabase Postgres + pgvector
       nodes        existing authored content
       node_links   existing manual connections
       blocks       paragraph-level content + embeddings
       edges        suggested/accepted/dismissed semantic connections
```

Supabase Postgres stays the source of truth. It supports `pgvector` vector columns and similarity search, so there is no need to introduce a second database or migrate your existing content. [Supabase vector columns](https://supabase.com/docs/guides/ai/vector-columns)

## Guiding rules

1. **Retrieve first, generate never by default.** Local text embeddings and pgvector find candidate content. An LLM is optional later for private explanations/label suggestions—not for automatically publishing relationships.
2. **Published content remains protected.** The public frontend reads only published nodes and accepted edges. Drafts, blocks, embeddings, scores, and suggestions never become public data.
3. **Keep the database understandable.** `nodes` stays the content table; `blocks` stores chunked text; `edges` stores semantic-review state. Manual `node_links` stays separate.
4. **Measure before scaling.** With dozens or low hundreds of items, simple exact similarity search is enough. Do not add queues, Redis, graph databases, or approximate indexes until a real bottleneck appears.
5. **Make every model change reversible.** Store model name/version with embeddings and support re-embedding all blocks when the model changes.

---

## Stage 0 — Readiness and model choice

**Goal:** decide the smallest viable embedding model and prepare good source material.

Use [`semantic-stage-0-readiness.md`](../semantic/semantic-stage-0-readiness.md) as the working checklist and evaluation worksheet.

### Work

- Build the portfolio to at least 15–20 public-appropriate reflections, projects, articles, books, or music entries with substantive summaries and body text/reflections.
- Select a compact `sentence-transformers` retrieval model. Compare two candidates using 8–10 of your own items, not generic benchmark claims.
- Record the model identifier, embedding dimension, license, approximate memory use, and whether it uses `encode_query` / `encode_document`.
- Define the initial quality rubric: for each test item, list 2–3 expected related pieces and several clearly unrelated ones.
- Create a database backup/export before adding semantic tables.

### Exit check

You can explain why the chosen model fits your content and hosting constraints, and you have enough real writing to judge whether semantic similarity is useful.

### Do not add yet

FastAPI routes, vector tables, a public search box, background queues, or LLM features.

---

## Stage 1 — Semantic database foundation

**Goal:** add the data structures without changing public behavior.

**Selected embedding model:** `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions).

Use [`semantic-stage-1-manual-backend.md`](../supabase/semantic-stage-1-manual-backend.md) for the SQL you will type and run manually.

### Backend code you will type

I will provide a manually applied SQL migration that:

- Enables the `vector`/pgvector extension in Supabase.
- Creates `blocks`: `node_id`, ordinal, plain-text paragraph, vector embedding, model/version, timestamps.
- Creates `edges`: source/target node IDs, optional evidence-block IDs, relationship type, score, `suggested | accepted | dismissed` status, origin, and review metadata.
- Adds constraints for valid status, no self-links, and duplicate-pair prevention.
- Enables RLS on both tables. The owner can review suggestions; the public can read only accepted edges whose endpoint nodes are published.
- Adds a SQL function/RPC for vector nearest-neighbor matching, because browser/PostgREST requests cannot use pgvector’s distance operators directly. [Supabase’s pgvector guide](https://supabase.com/docs/guides/ai/vector-columns)

### Frontend work I will do

- Add non-public semantic status indicators in the dashboard: “not embedded,” “up to date,” “processing,” or “failed.”
- Preserve the existing manual-links interface unchanged.

### Exit check

The new tables exist and are RLS-protected, but nothing semantic is visible publicly and no embedding job has run.

---

## Stage 2 — FastAPI semantic-service foundation

**Goal:** run a small local Python service that can safely chunk and embed one owner-selected node.

Use [`semantic-stage-2-fastapi-manual-backend.md`](../semantic/semantic-stage-2-fastapi-manual-backend.md) for the backend files you will type manually.

### Backend code you will type

I will provide the Python project files and setup commands for:

- FastAPI application with `/health`.
- `sentence-transformers` embedding-provider interface and the selected local model implementation.
- Deterministic Markdown-to-plain-text paragraph chunking.
- A direct, server-only connection to Supabase Postgres using `DATABASE_URL`; database credentials never enter the frontend.
- An owner-only endpoint such as `POST /admin/nodes/{id}/embed`.
- JWT verification for requests from your existing Supabase-authenticated frontend. The frontend sends the current user session token; FastAPI verifies it against Supabase’s JWKS/Auth service and checks that it is the owner before doing work. Do not implement JWT signature verification manually. [Supabase JWT guidance](https://supabase.com/docs/guides/auth/jwts)

### Frontend work I will do

- Add a private **Embed this item** button to the dashboard.
- Read the current Supabase session token and send it as `Authorization: Bearer …` only to the FastAPI service.
- Show progress, success, and safe error messages.

### Exit check

You can select one draft or published node, embed its paragraph blocks, and see model/version/timestamp metadata in the owner dashboard. A public visitor cannot call the endpoint successfully.

### Scope boundary

Start synchronous. If embedding a single item makes saving awkward, use FastAPI `BackgroundTasks` next; do not add Redis/Celery. FastAPI documents background tasks as suitable for small work after the response, while heavier distributed work is a different problem. [FastAPI background tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)

---

## Stage 3 — Candidate generation and private review

**Goal:** convert embedded blocks into reviewable semantic suggestions.

Use [`semantic-stage-3-fastapi-manual-backend.md`](../semantic/semantic-stage-3-fastapi-manual-backend.md) for the FastAPI code you will type manually.

### Backend code you will type

- A nearest-neighbor query over blocks using cosine similarity.
- Candidate aggregation from paragraph matches to node-pair scores.
- Exclusions for self-links, already-reviewed unchanged pairs, and unusably short content.
- Suggested-edge upsert logic with evidence blocks and score.
- Owner-only actions to re-embed a node and batch re-embed after a model upgrade.

Start every automatically proposed relationship as `related_to`. Do not infer `inspired_by`, `extends`, or `contrasts_with` automatically yet.

### Frontend work I will do

- Add a private **Suggested connections** panel.
- Show source and target excerpts, a clear relevance label, and accept/dismiss buttons.
- Let you choose the final relationship type when accepting.
- Let you create a manual semantic edge if the model misses an important connection.

### Exit check

For 10 representative items, suggestions have understandable evidence. You can accept/dismiss them, and dismissed pairs do not immediately reappear.

---

## Stage 4 — Public semantic experience

**Goal:** expose only your curated results to visitors.

### Backend code you will type

- A public semantic-search endpoint that embeds a query and returns ranked **published** nodes only.
- A safe read path for accepted semantic edges, filtered by published endpoint nodes.
- Optional hybrid ranking only if testing shows keyword/name queries are weak; keep the algorithm documented.

### Frontend work I will do

- Add a semantic search field and results page with type filters, excerpts, loading, empty, and error states.
- Show accepted semantic connections beside existing manual connections, visibly labeled by their relationship type.
- Keep raw scores, model names, blocks, drafts, and suggestions out of the public UI.

### Exit check

A visitor can search a concept, open a result, and follow several reviewed connections. All public checks pass in an incognito window.

---

## Stage 5 — Deploy and operate the semantic service

**Goal:** make the semantic feature dependable in production.

### Backend code you will type

- Dockerfile and pinned Python dependencies for FastAPI plus the selected embedding model.
- Environment configuration for database connection, Supabase project/JWKS URL, allowed frontend origin, and owner authorization.
- Deployment configuration for a host with enough memory for the local model.
- Health endpoint, structured error logging that excludes content/tokens, and a batch re-embed command.

### Frontend work I will do

- Configure the production API base URL through a Vite environment variable.
- Add user-facing service-unavailable states that leave ordinary portfolio browsing functional.

### Exit check

The public portfolio remains usable if the semantic service is down; owner-only endpoints reject invalid tokens; a model upgrade/re-embed procedure is documented and tested.

---

## Stage 6 — Optional GenAI source-discovery plugin

Only consider this after the graph has enough reviewed connections to express actual themes.

1. Select a reviewed relational group.
2. Generate a private search brief and diverse queries.
3. Retrieve candidates from approved RSS/search/API sources.
4. Optionally use an LLM to rank candidates and explain relevance to specific graph evidence.
5. Save only a draft source node; you verify the source and write the reflection before publishing.

The model must never invent citations, URLs, or source metadata, and it must never publish content or edges automatically.

---

## Recommended first move

Do **Stage 0** next, not FastAPI. Add enough real content and choose the embedding model using your own material. When you are ready, I will give you the Stage 1 SQL to type manually and will implement the small dashboard status UI around it.
