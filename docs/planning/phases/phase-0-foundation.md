# Phase 0 — Foundation
## Outcome

A contributor can start the frontend, backend, and Postgres/pgvector stack locally; apply database migrations; run automated checks; and view public and admin application shells.

## Prerequisites

- The repository is available locally and Git is configured.
- Docker Desktop (or a compatible container runtime), Node.js LTS, and a Python version supported by the chosen FastAPI tooling are installed.
- No production credentials are needed in this phase.

## Scope

Build the application skeleton and shared data foundation. Do not build real authentication, authoring, embeddings, media uploads, or deployment automation beyond CI validation.

## Steps

1. **Create the repository layout.**
   - Add `frontend/`, `backend/`, `docs/`, and `seed/` using the directory structure in the main scope.
   - Add a root `README.md` with prerequisites, local start commands, test commands, and a one-paragraph architecture overview.
   - Add `.gitignore` entries for environment files, Python virtual environments, Node dependencies, build output, test coverage, and local database volumes.

2. **Initialize the frontend.**
   - Create a React + Vite + TypeScript application in `frontend/`.
   - Add a router with placeholder public routes (`/`, `/explore`, `/experience`, `/nodes/:slug`) and an `/admin` route.
   - Build a small shared layout with a header, main landmark, and accessible navigation. The admin page may state that authentication is coming in Phase 1.
   - Configure linting, formatting, and a minimal component/unit-test setup.

3. **Initialize the backend.**
   - Create a FastAPI application in `backend/app/main.py`.
   - Add `/health` returning a simple JSON success response and an API router prefix such as `/api`.
   - Establish settings loading from environment variables. Fail clearly when a required runtime value is absent; never hard-code secrets.
   - Configure Python linting, formatting, type checking if used, and a minimal test runner.

4. **Create local infrastructure.**
   - Add `compose.yaml` for a local Postgres image with the pgvector extension available and named persistent volume(s).
   - Put host, port, database name, user, and password behind environment variables with safe local defaults only where appropriate.
   - Create `.env.example` documenting every variable needed by the frontend, backend, and local database. Do not commit a real `.env`.
   - Verify the backend can connect to the database from the local development setup.

5. **Establish schema and migrations.**
   - Configure Alembic (or an equivalent migration system) before creating application tables.
   - Create initial `nodes`, `blocks`, and `edges` tables with UUID primary keys, timestamps, status fields, and foreign keys as defined in the main scope.
   - Enable the `vector` extension in a migration and add the embedding column with a dimension to be finalized when the embedding model is selected in Phase 3. If the dimension is not yet known, defer the vector column to the Phase 3 migration rather than guessing.
   - Add database constraints for valid node/edge statuses and non-self-referential edges. Do not add semantic-query indexes yet.
   - Write one test that applies migrations to a clean test database.

6. **Connect the shells.**
   - Add a small backend endpoint that confirms database connectivity or returns a controlled unavailable response.
   - Have the frontend call `/health` in development or otherwise document the local proxy/API base URL convention.
   - Confirm browser routing works for deep links in development.

7. **Add CI.**
   - Add a GitHub Actions workflow triggered by pull requests and pushes.
   - Run frontend lint/test/build and backend lint/test in separate, readable steps.
   - Add a migration validation step if the CI environment can run Postgres; otherwise document that limitation and add it in Phase 5.

## Decisions made

Record the chosen Node/Python versions, package managers, ORM, migration tool, test tools, and route library here:

- _Pending implementation._

## Verification

- `docker compose up` starts Postgres without manual database setup.
- The backend starts, `/health` returns success, and a database connection can be checked.
- Migrations apply cleanly to an empty local database and can be rolled back in development.
- The frontend starts and the public shell plus `/admin` shell render without console errors.
- Frontend and backend lint/tests pass locally.
- The CI workflow runs the same core checks from a clean checkout.

## Exit checklist

- [ ] Directory structure matches the main scope closely enough to support later phases.
- [ ] Local setup and environment variables are documented.
- [ ] Schema changes are migration-managed, not created manually.
- [ ] No secrets or generated dependencies are committed.
- [ ] A new contributor can follow the README and reach both application shells.

## Do not add yet

- Login/session implementation
- Content editor or public content pages
- `sentence-transformers`, pgvector similarity queries, queues, or background workers
- S3/object storage, source ingestion, graph visualization, or a production host
