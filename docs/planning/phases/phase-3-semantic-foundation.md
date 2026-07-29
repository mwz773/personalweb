# Phase 3 — Semantic Foundation
## Outcome

Saving a content node produces paragraph-level embeddings stored in pgvector. The owner can inspect embedding state and the backend can generate reliable internal candidate pairs without exposing them publicly yet.

## Prerequisites

- Phase 2 is complete with 15–20 high-quality nodes and meaningful written reflections.
- Confirm the deployment target being considered can run the selected local `sentence-transformers` model within its memory/CPU limits.
- Choose a compact text embedding model and record its exact identifier, embedding dimension, license, and query/document encoding behavior below.

## Scope

Implement retrieval infrastructure, not the public connection experience. Preserve the `EmbeddingProvider` boundary so a future provider can be substituted, but use local `sentence-transformers` now.

## Steps

1. **Select and document the embedding model.**
   - Evaluate a small shortlist on representative portfolio text: short reflections, project write-ups, and experience bullets.
   - Prefer a model intended for semantic similarity/information retrieval and compatible with the planned host.
   - Record model ID, vector dimension, normalization/cosine policy, license, and whether `encode_query` / `encode_document` are used.
   - Do not change models silently after embeddings exist; a model change requires a batch re-embed.

2. **Implement Markdown-to-text chunking.**
   - Render Markdown to plain text while preserving useful paragraph boundaries.
   - Split long content at paragraph boundaries; initially use no overlap.
   - Exclude headings-only, empty, boilerplate, and extremely short chunks. Keep block ordinal and source-node association.
   - Write deterministic unit tests for headings, lists, links, code blocks, empty input, and long paragraphs.

3. **Add storage migrations.**
   - Add the pgvector extension if not already installed.
   - Add `blocks.embedding` using the selected model dimension, plus `embedding_model`, `embedded_at`, and node-level embedding status/error fields.
   - Add indexes only after measuring with representative data; exact search is sufficient at this portfolio’s early scale.
   - Ensure deleting/replacing content removes stale blocks and their embeddings transactionally or leaves an explicit recoverable state.

4. **Build the embedding provider and save pipeline.**
   - Define an `EmbeddingProvider` interface with document and query encoding operations.
   - Implement the `sentence-transformers` provider, loading the model predictably and logging initialization failures without content leakage.
   - On node save, determine changed content, replace/re-embed affected blocks, and update node state to `ready` or `failed`.
   - Start synchronously and measure save latency. Move only the embedding call to `BackgroundTasks` if the measured authoring experience is poor.
   - Ensure an embedding failure never destroys the saved Markdown content or changes publication status.

5. **Implement internal retrieval and candidate aggregation.**
   - Query nearest blocks with cosine similarity, excluding blocks from the same node and invalid/deleted nodes.
   - Aggregate block matches to node-level candidates using strongest evidence plus a small bonus for multiple independent strong matches.
   - Exclude pairs already accepted or dismissed unless either node has materially changed since review.
   - Store suggested edges with source/target evidence blocks, score, model metadata if useful, and `suggested` status.
   - Default every suggested relationship type to `related_to`; do not let a model invent narrative types yet.

6. **Add owner operations.**
   - Show each node’s embedding state, model/version, last successful embedding time, and a non-sensitive error message in the dashboard.
   - Add a guarded owner-only batch re-embed command/endpoint. Require explicit confirmation and make it resumable or at least safely repeatable.
   - Add an internal endpoint/page for inspecting candidate pairs while developing; keep it private.

7. **Evaluate before tuning.**
   - Pick 10 representative nodes and manually label several expected-related and clearly-unrelated pairs.
   - Inspect the top candidates, including evidence paragraphs. Adjust only documented levers: chunk rules, minimum reflection length warning, threshold, and aggregation formula.
   - Prefer transparent rules over premature complex rerankers. Record observed quality and chosen threshold below.

## Decisions made

- Embedding model/version/dimension: _Pending implementation._
- Similarity metric and normalization policy: _Pending implementation._
- Minimum block length and candidate threshold: _Pending implementation._
- Synchronous vs. background embedding decision with measured save latency: _Pending implementation._

## Verification

- Saving or editing a node creates only the expected current blocks and embeddings.
- A failed model invocation leaves the node’s authored content intact and reports recoverable state.
- Query embeddings and document embeddings use the same compatible model/version.
- Candidate generation excludes self-links, stale/deleted content, and previously dismissed/accepted unchanged pairs.
- At least ten manual spot checks show evidence paragraphs that make intuitive sense.
- Batch re-embed can be safely run twice without duplicate blocks or edges.

## Exit checklist

- [ ] The selected model and all quality parameters are documented.
- [ ] Blocks and embeddings are persisted in pgvector with version metadata.
- [ ] Internal candidate pairs can be produced and inspected by the owner.
- [ ] No suggested edge is public yet.
- [ ] Tests cover chunking, embedding-state transitions, and candidate exclusions.

## Do not add yet

- Public Connections panel or semantic search UI
- LLM-generated relationship labels/explanations
- Cross-encoder reranking, Redis/Celery, or a graph database
- Photo/image embeddings or automatic external-source ingestion
