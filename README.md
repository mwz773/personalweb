# Personal Web

A semantic personal portfolio built with React, Supabase, FastAPI, and local sentence-transformer embeddings. It supports private authoring, public publishing, reviewed content relationships, semantic search, and an interactive knowledge graph.

## Features

- Public portfolio for reflections, projects, articles, books, and music.
- Private `/admin` dashboard for the single portfolio owner.
- Markdown authoring and publish/draft controls.
- Manual and semantic connection workflows with explicit review.
- Local `sentence-transformers/all-MiniLM-L6-v2` embeddings stored with pgvector.
- Public semantic search over published, embedded content only.
- Interactive `/graph` view of published nodes and accepted connections.

## Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Public and owner UI | React 19, TypeScript, Vite | Portfolio, authoring dashboard, search, and graph |
| Graph rendering | `react-force-graph-2d` | Interactive 2D knowledge graph |
| Hosted data and auth | Supabase Postgres + Auth + RLS | Content, connections, owner account, public-read rules |
| Semantic service | FastAPI, Psycopg, Sentence Transformers | Chunking, embedding, suggestion generation, semantic search |
| Vector search | pgvector | Similarity matching for blocks of content |

The frontend talks directly to Supabase for RLS-protected data. It calls FastAPI only for semantic work. FastAPI verifies the owner’s Supabase access token before allowing embedding or suggestion generation.

## Repository layout

```text
frontend/   React/Vite application
backend/    FastAPI semantic service
supabase/   SQL schema and owner-auth SQL
docs/       Planning, setup, semantic-stage, and delivery documentation
```

## Prerequisites

- Node.js 22+ (the project is currently developed with Node 24).
- Python 3.12+.
- A Supabase project with email/password authentication enabled.
- A PostgreSQL connection string for that Supabase project, used only by the backend service.

## First-time setup

### 1. Configure Supabase

Follow the [Supabase setup guide](docs/supabase/README.md), then apply the additional owner, content-type, manual-connection, and semantic SQL guides in [docs/supabase](docs/supabase/README.md).

The core database tables are:

- `nodes` — portfolio items and publication state.
- `node_links` — manually curated connections.
- `blocks` — paragraph-sized embedding units.
- `edges` — semantic suggestions and reviewed semantic connections.

### 2. Configure the frontend

Copy the example file:

```sh
cp frontend/.env.example frontend/.env
```

Set the browser-safe values from **Supabase → Connect** or **Project Settings → API**:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SEMANTIC_API_URL=http://localhost:8000
```

`VITE_*` values are sent to the browser. Never place a Supabase `service_role`, secret key, database password, or connection string in this file.

### 3. Configure the semantic backend

Create `backend/.env` locally. It is intentionally ignored by Git.

```dotenv
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key

# Optional local defaults
SEMANTIC_ALLOWED_ORIGIN=http://localhost:5173
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
SUGGESTION_THRESHOLD=0.35
SUGGESTION_LIMIT=8
PUBLIC_SEARCH_LIMIT=12
```

`DATABASE_URL` is backend-only. Keep it and all other server credentials out of the frontend and Git.

## Run locally

Use two terminals.

### Terminal 1: frontend

```sh
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, normally [http://localhost:5173](http://localhost:5173).

### Terminal 2: semantic service

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Confirm the service is running at [http://localhost:8000/health](http://localhost:8000/health).

The first backend start downloads the embedding model, so it can take longer than later starts.

## Main routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/` | Public | Portfolio index, type filtering, and semantic search |
| `/<type>/<slug>` | Public | Published item with accepted related content |
| `/graph` | Public | Interactive knowledge graph |
| `/admin` | Owner only | Sign in, author content, embed, review, and publish |

The supported public type paths are `/reflections`, `/projects`, `/articles`, `/books`, and `/music`.

## Semantic workflow

1. Write and save a content item in `/admin`.
2. Add at least one paragraph of 40 or more characters, then choose **Embed this item**.
3. Embed at least one other related item.
4. Choose **Generate suggestions** for an embedded item.
5. Review the evidence excerpts and accept or dismiss each suggestion.
6. Publish both items. Accepted connections appear on item pages and in `/graph`; only published, embedded items appear in public semantic search.

Suggestion generation starts every relationship as `related_to`. The owner chooses a final relationship type when accepting it.

## Semantic API

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Service health and configured model name |
| `POST` | `/admin/nodes/{node_id}/embed` | Owner token | Chunk and embed one owned item |
| `POST` | `/admin/nodes/{node_id}/suggestions` | Owner token | Store suggested semantic edges for review |
| `POST` | `/public/search` | Public | Search published, embedded content |

The public search response intentionally excludes embeddings, raw similarity scores, drafts, suggestion status, and owner data.

## Security model

- Supabase Row Level Security is enabled on the public data tables.
- Public readers can access only published nodes and accepted connections whose endpoints are also published.
- Drafts, semantic suggestions, blocks, model metadata, and raw scores are not shown publicly.
- Owner-only FastAPI endpoints validate a Supabase bearer token and confirm the requested node belongs to that owner.
- The frontend uses only the Supabase publishable key; server-only credentials stay in `backend/.env`.

## Useful commands

Run frontend commands from `frontend/`:

```sh
npm run dev      # Start Vite
npm run lint     # Run Oxlint
npm run build    # Type-check and create a production build
npm run preview  # Serve the production build locally
```

Run backend commands from `backend/` with the virtual environment activated:

```sh
python -m uvicorn main:app --reload --port 8000
```

## Documentation

The [documentation index](docs/README.md) contains all planning and implementation material.

- [Active beginner prototype scope](docs/planning/beginner-hosted-prototype-scope.md)
- [Long-term semantic portfolio scope](docs/planning/semantic-portfolio-scope.md)
- [Semantic upgrade plan](docs/planning/semantic-upgrade-plan.md)
- [Delivery phases](docs/planning/phases/README.md)
- [Semantic stage guides](docs/semantic/semantic-stage-0-readiness.md)
- [Supabase setup and SQL guides](docs/supabase/README.md)

## Current status and next step

The application works locally with Supabase and a locally running semantic service. Production deployment, operational monitoring, backups, and a production-safe hosted semantic service are the remaining work in [Phase 5](docs/planning/phases/phase-5-production-release.md).
