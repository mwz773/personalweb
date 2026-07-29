# Final Project Scope: Semantic "Get to Know Me" Portfolio

## 1. Product Definition

A public, read-only portfolio that lets a visitor explore how my work, influences, and experience connect. Instead of presenting isolated resume entries and project cards, the site surfaces meaningful, reviewed connections: a project can lead to the article that informed it, then to an earlier assignment that developed the same idea.

The core interaction is inspired by Obsidian Smart Connections: content is embedded, semantically similar content is suggested, and I explicitly review the suggestions before a connection appears publicly. The result should feel like a small, navigable knowledge graph—not a file cabinet or an automatically generated recommendation feed.

### Primary audiences

- Recruiters and collaborators who want to understand my experience and how I think.
- Me, as the sole author and curator using a private dashboard.

### v1 success criteria

- A visitor can browse published work, experience, reflections, and source influences without an account.
- A visitor viewing a node can follow accepted, meaningful connections to related content.
- I can create and edit Markdown-based content in a protected dashboard, publish it, and review suggested links.
- Semantic lookup returns relevant published content for a topic or natural-language question.
- The deployed app is reliable, accessible, and explainable as a portfolio project.

### Explicit non-goals for v1

- Visitor accounts, comments, submissions, saves, or collaborative editing.
- A separate graph database, message queue, cache, or Kubernetes deployment.
- Automatic ingestion or storage of copyrighted article, video, podcast, or social-post bodies/transcripts.
- Multimodal/image embeddings, live-as-you-type embedding, and fully automatic public links.
- GitHub synchronization; projects are entered manually with repository links.

---

## 2. Product Boundaries and Access

### Public site

- Fully read-only; no account is required.
- Shows only nodes and edges whose status is `published` / `accepted`.
- Supports browsing by content type, direct links, semantic lookup, and related-content navigation.
- Includes an experience/resume view generated from structured experience data.

### Private owner dashboard

- Protected by single-owner authentication.
- Lets me create, edit, preview, publish, unpublish, and delete nodes.
- Provides Markdown authoring with rendered preview and type-specific metadata fields.
- Displays link suggestions, supports accepting, dismissing, manually creating, editing, or removing edges, and records the decision.
- Is deliberately single-user: no roles, invitations, or organization management.

Authentication should use a small, conventional implementation (a single configured owner identity and secure session/cookie handling). It protects authoring routes; it is not a feature area to expand in v1.

---

## 3. Content Model

Every item is a **node**. Nodes have a common shell plus type-specific metadata.

### v1 node types

| Type | Purpose | Primary content |
|---|---|---|
| `reflection` | Short original writing that connects ideas and work | Markdown body |
| `article` | An external article or essay that influenced my thinking | URL, source metadata, my reflection |
| `project` | A project or code sample | Description, Markdown write-up, repository/demo links |
| `experience` | A role, organization, or internship | Structured dates, role, bullets, Markdown context |

### Later node types

`book`, `talk`, `podcast`, `assignment`, `photo`, `achievement`, `goal`, and `meta` are supported by the model’s extensibility but are deferred until the v1 semantic loop is solid. Add one type at a time, only when there is real content ready to publish.

### Node fields

```text
Node
├── id (UUID)
├── slug (stable public URL)
├── type
├── title
├── summary (short public preview)
├── markdown_content
├── status (draft | published)
├── authored_by (self | external)
├── source_url (nullable)
├── source_metadata (JSON: author, publication, date, thumbnail, etc.)
├── type_metadata (JSON: role/dates/skills, repo URL, etc.)
├── created_at, updated_at, published_at
└── embedding_state (model/version, last_embedded_at, error state)

Block
├── id, node_id, ordinal
├── content (a paragraph-level Markdown-to-text segment)
├── token_count
├── embedding (pgvector)
└── embedding_model, embedded_at

Edge
├── id, source_id, target_id
├── relationship_type
│   (related_to | inspired_by | cites | extends | contrasts_with)
├── confidence_score (nullable for manually created edges)
├── status (suggested | accepted | dismissed)
├── origin (semantic_suggestion | manual)
├── source_block_id, target_block_id (nullable evidence)
└── created_at, reviewed_at
```

Use relational columns for fields that are queried or rendered often (`type`, status, dates, title); use JSON only for genuinely type-specific metadata. The database must enforce that public edges connect published nodes and that duplicate directional edge records are not created.

### Copyright and source-content rule

For external sources, store the URL, permitted lightweight metadata, and my own reflection. Do not fetch, persist, chunk, or embed full source bodies or transcripts. This keeps the site personal, legally cautious, and centered on my thinking.

---

## 4. Semantic Linking System

### Authoring and chunking

- Author original content and external-source reflections in Markdown.
- On save, render Markdown to plain text and split it into paragraph-level blocks.
- Ignore headings-only, empty, and extremely short blocks; initially use no overlap.
- Preserve block order and the link back to the source node so UI previews can show evidence for a suggestion.

### Embeddings

- Use a local `sentence-transformers` model in the FastAPI service, behind an `EmbeddingProvider` interface.
- Record model name/version on every embedding so existing content can be re-embedded later without ambiguity.
- Use one text embedding space for all node types. Images, when added, are represented by their captions/reflections rather than image embeddings.
- Re-embed only changed blocks after a save; support an owner-only batch re-embed command for model upgrades.

Local embeddings avoid per-request API cost and keep content processing under the project’s control. The trade-off is a heavier service image and memory footprint; choose a compact, well-supported model and verify the intended host can run it.

### Candidate generation and review

1. A saved, published or draft node has its changed blocks embedded.
2. Each changed block queries nearest neighbor blocks in pgvector, excluding itself and nodes with no eligible content.
3. Block scores are aggregated into one node-to-node score using the strongest matching evidence, with light weighting for multiple strong matches.
4. Candidates below a configured threshold or already reviewed for the same node pair are omitted.
5. The dashboard shows ranked suggestions with score, source/target previews, and a proposed relationship type.
6. I accept, dismiss, or adjust the relationship type. Only accepted edges appear publicly.

Start with a transparent heuristic for the proposed type: default to `related_to`, and offer the more narrative types as an owner choice. Do not claim that the model reliably infers nuanced relationship labels before enough real content proves it can.

### Quality safeguards

- Prompt for a two-to-three-sentence reflection on external sources; do not block saves, but warn when there is too little text to generate useful links.
- Provide a dismiss action so rejected pairs do not recur until material content changes.
- Let me manually add edges when semantic similarity misses an important narrative relationship.
- Treat confidence as a ranking aid, not an assertion of truth; show a human-friendly relevance label rather than raw precision to visitors.
- Do not suggest or expose unpublished content on the public site.

### Semantic lookup

A public search field embeds the query through the same provider and ranks published nodes using their best matching blocks. Results show title, type, summary, and a relevant excerpt. It is separate from the Connections panel and requires no external search service.

---

## 5. Content Ingestion and Media

The always-available path is manual entry: paste a URL when relevant, add lightweight metadata, and write a reflection. Any automatic metadata fetch is progressive enhancement, never a publishing dependency.

| Source | v1 handling | Stored/embedded content |
|---|---|---|
| General article or essay | Manual URL, title, author/publication where available | My reflection only |
| Project | Manual entry with repository/demo URLs | My Markdown write-up |
| Experience | Structured entry form | My bullets and context |
| YouTube/Substack/X and similar platforms | Deferred adapters; use manual URL + reflection until a stable, compliant metadata path is justified | My reflection only |
| Photos | Deferred until the core loop works | Later: caption/reflection and optional EXIF metadata |

Media uploads are deferred from the first vertical slice. When photos are introduced, store files in S3-compatible object storage and retain only object keys/metadata in Postgres.

---

## 6. User Experience

### Public pages

- **Home:** an inviting introduction, selected nodes, current themes, and clear paths into projects, experience, and explorations.
- **Node detail:** title, type, metadata, rendered Markdown, source/repository links, and accepted connections with a preview of why they relate.
- **Explore/search:** semantic lookup plus basic filters for node type and theme/tag if tags are added later.
- **Experience:** timeline/resume view driven by `experience` nodes, with links into connected projects and reflections.

Avoid making an interactive graph visualization a v1 dependency. A well-designed related-content list is more accessible, legible, and useful at this content volume. A lightweight graph or growth-arc view is a later enhancement once accepted edges are plentiful.

### Dashboard pages

- **Content list:** filters by type/status and clear publishing state.
- **Editor:** title, summary, type metadata, Markdown editor/preview, source URL, and save/publish controls.
- **Connections panel:** evidence-backed suggestions; accept, dismiss, create, edit, and remove relationships.
- **Operations:** embedding status/errors and a guarded re-embed action.

### Baseline quality bar

- Responsive layout, keyboard navigation, visible focus states, semantic landmarks, sufficient contrast, and meaningful image alt text.
- Stable public slugs and shareable URLs.
- Clear empty states: no search matches, no connections yet, and draft-only content.

---

## 7. Technical Architecture

| Layer | Choice | Responsibility |
|---|---|---|
| Frontend | React + Vite + TypeScript | Public site and protected dashboard |
| Backend | FastAPI + Python | REST API, auth boundary, content/edge logic, embedding orchestration |
| Database | Managed Postgres + pgvector | Nodes, blocks, edges, vector similarity, migrations |
| Embeddings | `sentence-transformers` | Local text embedding through a provider abstraction |
| Media | S3-compatible object storage (later) | Photo binaries and future assets |
| Deployment | Docker, GitHub Actions, managed application host | One app container; managed database and object storage remain external |

Use synchronous embedding in the first implementation if save latency is acceptable; otherwise move the embedding call to FastAPI `BackgroundTasks` while retaining an observable `embedding_state`. Do not add Redis/Celery unless measured workload makes retries or throughput a real problem.

### API outline

```text
Public
GET  /api/nodes
GET  /api/nodes/{slug}
GET  /api/nodes/{slug}/connections
POST /api/search
GET  /api/experience

Owner-only
POST/PATCH/DELETE /api/admin/nodes
POST /api/admin/nodes/{id}/publish
GET  /api/admin/nodes/{id}/suggestions
POST /api/admin/edges
PATCH /api/admin/edges/{id}
POST /api/admin/embeddings/reindex
```

The exact authentication endpoints and token/session mechanism can be chosen during implementation, but authorization must be enforced in the backend—not only by hiding frontend routes.

---

## 8. Delivery Phases

Each phase ends with a usable, reviewable increment. Content entry should happen continuously, not as a final data-loading task.

Detailed, step-by-step build briefs live in [`docs/phases/`](../phases/README.md). Complete each brief's acceptance checklist before beginning the next phase.

### Phase 0 — Project foundation

**Outcome:** local development environment and deployable skeleton.

- Initialize React/Vite frontend and FastAPI backend with TypeScript/Python formatting, linting, and test setup.
- Create Docker configuration, environment-variable conventions, and local Postgres + pgvector development setup.
- Establish database migrations and the common node/block/edge schema.
- Create the public shell and protected dashboard route shell.
- Add a minimal GitHub Actions pipeline for linting and tests.

**Exit check:** a new contributor can start the stack locally, run migrations/tests, and see public and admin shells.

### Phase 1 — Content vertical slice

**Outcome:** real authored content can be safely created and published.

- Implement single-owner authentication and backend route protection.
- Build node CRUD for `reflection` only, including Markdown editor/preview, draft/publish status, and public detail page.
- Render only published content publicly and create stable slugs.
- Seed 5–8 high-quality reflections while testing the authoring flow.
- Add unit tests for authorization, publishing visibility, and Markdown/content validation.

**Exit check:** I can author a reflection privately, preview it, publish it, and browse it publicly.

### Phase 2 — Portfolio structure

**Outcome:** the site represents the essential portfolio content before semantic features are added.

- Add `article`, `project`, and `experience` forms and metadata rendering.
- Implement manual source URL/repository links and reflection prompts.
- Build the public experience timeline and content index/filtering.
- Add basic source-metadata validation; do not block on platform adapters.
- Seed at least 15–20 nodes across the four v1 types.

**Exit check:** the site functions as a coherent public portfolio without semantic links.

### Phase 3 — Semantic foundation

**Outcome:** content is chunked, embedded, and searchable internally.

- Implement Markdown-to-text chunking and `sentence-transformers` provider.
- Save block embeddings to pgvector and track model/version/state.
- Add nearest-neighbor queries, candidate aggregation, thresholds, and duplicate/review suppression.
- Build owner-facing embedding status and a batch re-embed path.
- Add tests for chunking, filtering, and similarity-query behavior.

**Exit check:** editing a node reliably produces searchable block embeddings and candidate node pairs.

### Phase 4 — Reviewed connections and public discovery

**Outcome:** the signature experience is demoable end to end.

- Build the dashboard Connections panel with evidence previews and accept/dismiss/manual edge actions.
- Add typed accepted edges to public node pages.
- Implement public semantic lookup over published content.
- Tune thresholds with seeded content; review and accept enough links to form useful paths.
- Add empty/error states and accessibility passes for the main flows.

**Exit check:** a visitor can search a topic, open a result, and follow curated semantic connections through the portfolio.

### Phase 5 — Production release and refinement

**Outcome:** a dependable public launch with a clear maintenance path.

- Deploy the app container to a host that supports the selected local embedding model; provision managed Postgres with pgvector.
- Configure production secrets, custom domain, HTTPS, database backups, and object storage only if media is now needed.
- Expand CI to build the container and run migrations/deployment safely.
- Add a basic health endpoint, structured logs, and a content/database export procedure.
- Perform cross-device, accessibility, and public-content review.

**Exit check:** the site is publicly available, authoring remains protected, and recovery/re-deployment steps are documented.

### Post-v1 options

- Additional node types, photos, and S3 media uploads.
- Stable, compliant metadata adapters for selected platforms.
- Theme/tag curation and a chronological growth-arc view based on `extends` and `contrasts_with` edges.
- Lightweight graph visualization, only after there are enough accepted edges to make it useful.
- GitHub project synchronization if manual entry becomes repetitive.

### Future plugin — curated source discovery

An owner-only GenAI-assisted discovery plugin may suggest new articles, talks, books, podcasts, or datasets based on a selected **relational group**: a node plus its accepted one- or multi-hop connections. It is a research aid, not an automated publishing or ingestion system.

```text
Selected relational group
  → compact graph summary (themes, node titles, my reflections, accepted edge types)
  → GenAI generates a search brief and diverse search queries
  → approved search/RSS/API sources return candidate links and metadata
  → optional GenAI ranks candidates and explains the relevance to the group
  → owner reviews, saves a candidate, and writes their own reflection
  → normal embedding and link-review workflow applies
```

**Plugin requirements:**

- It is available only in the private dashboard and never changes public content by itself.
- It must show the selected group, source URL, publisher/author when available, retrieval date, and a concise explanation tied to specific nodes/edges—not unsupported recommendations.
- It must prioritize diversity and novelty, avoid repeatedly suggesting the same publisher/topic, and allow dismissing/saving candidates.
- It must use compliant, configured source adapters (for example, selected RSS feeds or approved search APIs). A model must not fabricate citations, URLs, publication metadata, or source text.
- Saving a candidate creates a **draft** external-source node only. I remain responsible for checking the source, writing the reflection, and publishing it.
- Keep generated search briefs, provider/model identifiers, and recommendation decisions as operational metadata for debugging; do not expose them publicly by default.

**Why it is deferred:** it becomes useful only after the graph has enough accepted, high-quality relationships to express real themes. Implement it after Phase 5, with a small source set and a manual evaluation rubric (relevance, novelty, diversity, and factual source metadata) before expanding providers.

---

## 9. Proposed Directory Structure

```text
personalweb/
├── README.md
├── .env.example
├── compose.yaml                    # Local app/database development stack
├── Dockerfile                      # Production application image
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
│   ├── architecture.md
│   ├── deployment.md
│   └── content-guide.md
├── backend/
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/                   # Settings, security, logging
│   │   ├── db/                     # Engine, base models, migrations helpers
│   │   ├── models/                 # SQLAlchemy Node, Block, Edge models
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   ├── api/
│   │   │   ├── public.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── content.py
│   │   │   ├── connections.py
│   │   │   ├── search.py
│   │   │   └── embeddings/
│   │   │       ├── provider.py
│   │   │       ├── sentence_transformers.py
│   │   │       └── chunking.py
│   │   └── tests/
│   └── scripts/
│       └── reembed.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── app/
│       │   ├── router.tsx
│       │   └── providers.tsx
│       ├── api/                    # Typed API client and query hooks
│       ├── components/             # Shared UI primitives
│       ├── features/
│       │   ├── content/
│       │   ├── connections/
│       │   ├── search/
│       │   ├── experience/
│       │   └── admin/
│       ├── pages/
│       │   ├── public/
│       │   └── admin/
│       ├── styles/
│       └── tests/
└── seed/
    ├── nodes/                      # Versioned development seed fixtures only
    └── import_seed.py
```

Keep production-authored content in Postgres, not in `seed/` or the frontend bundle. The seed directory exists only to make local development, tests, and demos repeatable.

---

## 10. Decisions Locked for v1

| Decision | Choice |
|---|---|
| Authoring access | Private, single-owner dashboard |
| Visitor access | Public and read-only |
| Content editor | In-site Markdown authoring with preview |
| Embeddings | Local `sentence-transformers` model |
| Frontend | React + Vite + TypeScript |
| Project data | Manual entry with links; no GitHub sync |
| Data store | Managed Postgres + pgvector |
| Link publication | Explicit owner review; only accepted edges are public |
| Initial content types | Reflection, article, project, experience |
| Ingestion | Manual-first; metadata automation is optional and deferred |

This scope prioritizes the portfolio’s distinctive idea—human-reviewed semantic connections—while keeping the first release small enough to complete, deploy, and explain with confidence.
