# Phase Build Briefs

These documents turn the delivery phases in the [main project scope](../planning/semantic-portfolio-scope.md) into build-ready instructions. Work through them in order. A phase may be revisited for small bug fixes, but do not begin its optional work—or pull features from a later phase forward—until its acceptance checks pass.

| Phase | Brief | Deliverable |
|---|---|---|
| 0 | [Foundation](phase-0-foundation.md) | Repeatable local stack, schema, and CI |
| 1 | [Content vertical slice](phase-1-content-vertical-slice.md) | Protected reflection authoring and public publishing |
| 2 | [Portfolio structure](phase-2-portfolio-structure.md) | Articles, projects, experience, and seeded portfolio |
| 3 | [Semantic foundation](phase-3-semantic-foundation.md) | Chunking, embeddings, pgvector retrieval, suggestions |
| 4 | [Reviewed connections and discovery](phase-4-reviewed-connections.md) | Public semantic exploration and reviewed edges |
| 5 | [Production release](phase-5-production-release.md) | Secure, operated public deployment |

## Working rules

- Keep every change small and reviewable. Run the phase’s verification commands before calling it complete.
- Use real, public-appropriate content while building. Seed data is for local development and tests; production-authored content belongs in Postgres.
- Keep secrets out of source control. Update `.env.example` whenever a new required variable is introduced.
- Record any deliberate implementation deviation in the relevant brief’s **Decisions made** section.
- If an acceptance check exposes a problem, fix it in the current phase rather than carrying known defects forward.
