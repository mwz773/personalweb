# Phase 1 — Content Vertical Slice
## Outcome

The owner can sign in, privately create and edit a Markdown reflection, preview it, publish it, and visit its stable public page. Unpublished content remains inaccessible through public APIs and routes.

## Prerequisites

- Phase 0 acceptance checklist is complete.
- The local database and migrations work from a clean checkout.
- Decide the owner identity mechanism and document it below before writing auth code.

## Scope

Implement one complete content type—`reflection`—and the security boundary around it. The goal is a trustworthy authoring-to-publication loop, not a broad content taxonomy.

## Steps

1. **Choose and document the owner-auth design.**
   - Use a small single-owner approach: one configured identity, secure password/OAuth/magic-link flow, and server-validated session cookie.
   - Define session lifetime, logout behavior, CSRF protection where applicable, secure-cookie settings, and how the initial owner account is provisioned.
   - Add a backend dependency/middleware that protects every `/api/admin/*` route. Frontend route guards are convenience only, never the authorization control.

2. **Complete the reflection data contract.**
   - Add required reflection fields: `id`, `slug`, `type`, `title`, `summary`, `markdown_content`, `status`, timestamps, and `published_at`.
   - Define validation rules: trimmed title and summary, unique normalized slug, valid Markdown text size, and only `draft`/`published` statuses.
   - Add migration(s) rather than modifying prior migrations once they have been shared or applied.

3. **Build owner-only reflection APIs.**
   - Implement create, list, fetch-by-id, update, publish, and unpublish operations under `/api/admin`.
   - Generate a URL-safe slug from the title, allow owner override, and resolve collisions predictably.
   - Return typed, field-level validation errors. Do not expose database exceptions to the client.
   - Ensure every mutating route requires the authenticated owner.

4. **Build public reflection APIs.**
   - Implement a public list endpoint and `GET /api/nodes/{slug}`.
   - Filter public queries by `status = published` in the data-access layer, not merely in frontend filtering.
   - Return 404 for drafts and unknown slugs without revealing whether a draft exists.

5. **Build the dashboard editor.**
   - Create an owner-only content list and reflection editor.
   - Include title, summary, slug, Markdown body, save draft, preview, publish, and unpublish controls.
   - Render Markdown through a sanitizer; never render arbitrary raw HTML from authored Markdown without a reviewed sanitization policy.
   - Make unsaved changes visible and prevent accidental navigation where practical.

6. **Build public reflection pages.**
   - Add public index cards and a node detail page with title, publication date, summary, and rendered Markdown.
   - Use semantic headings, accessible link text, and responsive typography.
   - Verify direct navigation to a published slug works after a frontend refresh.

7. **Test the vertical slice.**
   - Backend: unauthenticated admin requests fail; owner requests work; draft content never appears publicly; publishing makes it appear; unpublishing removes it.
   - Frontend: editor validation, preview rendering, and public/draft empty states.
   - Add one end-to-end happy-path test if the project’s test setup supports it.

8. **Seed real content.**
   - Write 5–8 public-appropriate reflections using the dashboard.
   - Use this content to improve editor ergonomics and public-page readability before expanding the data model.

## Decisions made

- Owner authentication method: _Pending implementation._
- Markdown rendering/sanitization library: _Pending implementation._
- Slug collision policy: _Pending implementation._

## Verification

- An unauthenticated request to every admin route is rejected.
- A draft is absent from public lists and its direct public URL returns 404.
- Publishing and unpublishing a reflection changes only its public visibility, not its content.
- Markdown preview and public rendering are consistent and safe.
- At least five reflections have been created through the intended authoring path.

## Exit checklist

- [ ] Owner authentication is enforced by the backend.
- [ ] Reflection CRUD, preview, publish, and unpublish work end to end.
- [ ] Public pages contain only published reflections.
- [ ] Tests cover authorization and publication visibility.
- [ ] The phase is usable with real content, not only mocks.

## Do not add yet

- Article/project/experience forms
- External source metadata fetching
- Embeddings, connections, semantic search, or AI-generated labels
- Multi-user roles or visitor accounts
