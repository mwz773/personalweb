# Phase 2 — Portfolio Structure
## Outcome

The site functions as a coherent traditional portfolio before semantic features: visitors can browse projects, influences, reflections, and experience; the owner can author all four v1 node types.

## Prerequisites

- Phase 1 is complete and its authorization/publication tests pass.
- The content editor and public node page have been used with real reflections.

## Scope

Add `article`, `project`, and `experience` on top of the common node model. Keep external-source handling manual-first. Do not add new ingestion integrations merely to populate metadata.

## Steps

1. **Define type-specific metadata contracts.**
   - `article`: source URL, author (optional), publication/site (optional), original publication date (optional), and required personal reflection in Markdown.
   - `project`: repository URL (optional), live-demo URL (optional), technologies/skills, role, and Markdown write-up.
   - `experience`: organization, role, start/end dates, location (optional), structured bullets, skills, and optional Markdown context.
   - Validate URLs, dates, and enum-like fields on the backend. Preserve type-specific metadata in JSON only where a column is not justified.

2. **Extend the owner editor deliberately.**
   - Add a type selector only for new nodes; changing an existing node’s type should be restricted or explicitly handled to avoid invalid metadata.
   - Build focused forms for the three types rather than one enormous generic form.
   - For articles, add non-blocking reflection prompts such as “What idea stayed with you?” and “What does this connect to?”
   - Continue to support draft, preview, publish, and unpublish for every type.

3. **Extend public rendering.**
   - Render type labels and metadata consistently on every node page.
   - Show external-source and repository/demo links with clear destination labels.
   - Build project and article listing pages or a reusable filtered content index.
   - Build an experience timeline from published `experience` nodes, sorted by structured date fields rather than prose.

4. **Add basic discovery before semantic search.**
   - Add public filters for type; optionally add simple date ordering.
   - Define a reusable node-card component with title, summary, type, date, and optional metadata.
   - Provide clear no-results and no-content states.

5. **Improve data integrity.**
   - Enforce that external `article` nodes have a source URL and authored reflections have appropriate content.
   - Confirm publishing validation rejects incomplete type-specific records.
   - Keep source content limited to lightweight metadata and the owner’s reflection; never store a scraped article body.

6. **Seed and review content.**
   - Enter at least 15–20 nodes across reflection, article, project, and experience.
   - Include several items that genuinely share themes; this is required material for Phase 3 tuning.
   - Review every public page on mobile and desktop. Edit summaries and metadata until the site reads coherently without semantic links.

7. **Test.**
   - Add API validation tests for each node type.
   - Test public filtering, timeline ordering, and visibility behavior across types.
   - Test malformed URLs/dates and incomplete publish attempts.

## Decisions made

- Project skill/technology representation: _Pending implementation._
- Experience date precision policy (month/year vs. exact date): _Pending implementation._
- Public taxonomy/filter design: _Pending implementation._

## Verification

- The dashboard can create, edit, preview, and publish all four v1 types.
- Published article pages show source attribution and the owner’s reflection, but no stored source body.
- Published projects link safely to their repository/demo when provided.
- The experience page is correctly ordered and works with missing end dates/current roles.
- A visitor can find content by type even with semantic search disabled.

## Exit checklist

- [ ] At least 15–20 reviewed nodes are available for embedding experiments.
- [ ] All metadata validation happens in the backend.
- [ ] The public site is already a credible, accessible portfolio.
- [ ] No platform API or scraper is required for content entry.
- [ ] Tests cover each type’s valid and invalid publication path.

## Do not add yet

- YouTube, Substack, X, or other metadata adapters
- Photos/media uploads and S3 storage
- Embedding jobs, vector queries, public semantic lookup, or graph UI
- GenAI source-discovery plugin
