# Phase 5 — Production Release and Refinement
## Outcome

The portfolio is publicly deployed with a protected owner dashboard, managed Postgres/pgvector, repeatable deployment, backups/export, and enough operational visibility to maintain it confidently.

## Prerequisites

- Phase 4 acceptance checklist is complete.
- A hosting provider has been selected that can run the application image and selected local embedding model.
- A managed Postgres provider supports the required pgvector version.
- Domain/DNS access is available if a custom domain will be used.

## Scope

Productionize the existing application. This phase is not an excuse to add product features. Keep the application as one container plus managed services.

## Steps

1. **Choose and document production services.**
   - Select application host, managed Postgres + pgvector provider, secret store/environment mechanism, and optional S3-compatible media provider.
   - Confirm the application host’s CPU architecture, memory, disk, cold-start behavior, and image-size limits work with `sentence-transformers`.
   - Record pricing/free-tier constraints, region, database backup retention, and recovery procedures in `docs/deployment.md`.

2. **Produce a secure application image.**
   - Create a multi-stage Dockerfile where practical; pin base images and dependency lockfiles.
   - Run the application as a non-root user and expose only the required port.
   - Configure production settings for allowed origins, secure cookies, trusted hosts, logging level, and proxy/HTTPS behavior.
   - Confirm model files are available predictably in the image or through a documented build-time/runtime cache strategy. Do not rely on an uncontrolled first-request download.

3. **Provision and migrate production data.**
   - Create the production database, enable pgvector, and configure encrypted connection credentials.
   - Run migration commands through an explicit release step, not ad hoc shell access.
   - Create/provision the owner account using the documented secure mechanism.
   - Seed only deliberately public starter content; never copy development secrets or test data blindly.

4. **Configure CI/CD.**
   - Keep pull-request CI for linting, tests, builds, and dependency checks.
   - Add a protected deployment workflow that builds and tags the container, deploys the approved revision, runs migrations exactly once, and verifies `/health`.
   - Separate staging and production if practical; if not, require a manual approval gate for production deployment.
   - Ensure rollback is documented: deploy the prior image, and use backward-compatible migrations or a planned recovery path.

5. **Set up domain, HTTPS, and access controls.**
   - Configure the custom domain and redirect the canonical hostname consistently.
   - Verify HTTPS, HSTS if appropriate, secure session cookies, logout behavior, and admin route protection in the real deployment.
   - Configure CORS narrowly to the deployed frontend origin(s).

6. **Add minimum operations and recovery.**
   - Keep `/health` lightweight and unauthenticated; do not include secrets or internal dependency details in its response.
   - Emit structured application logs with request failures, embedding failures, and authorization events while excluding Markdown bodies, cookies, tokens, and secrets.
   - Configure database backups and document how to test restoration.
   - Add an owner-accessible content/database export procedure. Test importing/restoring in a non-production environment before relying on it.

7. **Perform release validation.**
   - Test the full authoring flow over HTTPS: login, create draft, embed, review edge, publish, search, unpublish, logout.
   - Check public pages on current mobile and desktop browsers, including direct deep links and a slow connection.
   - Run an accessibility audit and manually test keyboard navigation, focus, contrast, form labels, and screen-reader-relevant state changes.
   - Review every initially public node for content quality, source attribution, and unintended personal information.

8. **Document handoff and maintenance.**
   - Update `README.md` and `docs/deployment.md` with deploy, rollback, migration, re-embed, backup/export, and incident steps.
   - Write a short maintenance checklist: dependency updates, backup restore test cadence, content review, and embedding-model upgrade procedure.

## Decisions made

- Application host and region: _Pending implementation._
- Managed Postgres provider and backup retention: _Pending implementation._
- Deployment trigger/approval policy: _Pending implementation._
- Domain and canonical-host policy: _Pending implementation._

## Verification

- A clean production deployment runs migrations and responds successfully to `/health`.
- The real host can load and execute the selected local embedding model reliably.
- Public APIs and pages never expose admin data, drafts, suggestions, credentials, or raw operational metadata.
- The owner can sign in and complete the core content-to-connection workflow over HTTPS.
- A documented backup/export can be created, and recovery has been tested outside production.
- CI can build the production image and deploy a known revision reproducibly.

## Exit checklist

- [ ] Application, database, secrets, and domain are configured for production.
- [ ] Backups/export and rollback instructions have been tested and documented.
- [ ] Security and accessibility release checks pass.
- [ ] Production monitoring/logging is sufficient to detect failed requests and embeddings.
- [ ] The public site and private dashboard are ready for real use.

## Do not add yet

- Multi-container orchestration, Kubernetes, Redis/Celery, or enterprise observability
- Visitor accounts or public writes
- New node types or source integrations unrelated to launch quality
- The curated GenAI source-discovery plugin; assess it only after stable use of the live graph
