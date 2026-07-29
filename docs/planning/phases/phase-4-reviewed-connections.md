# Phase 4 — Reviewed Connections and Public Discovery
## Outcome

The owner reviews evidence-backed link suggestions and explicitly curates accepted edges. Visitors can search published material semantically and follow those accepted connections through the site.

## Prerequisites

- Phase 3 is complete and candidate quality has been manually evaluated.
- There are enough accepted-quality candidate pairs to make a public related-content experience useful.

## Scope

Expose the project’s defining experience without exposing drafts, raw model output, or unreviewed suggestions. Do not build a chat assistant or visual graph as a dependency.

## Steps

1. **Finish the edge-review contract.**
   - Ensure edge status transitions are explicit: `suggested` → `accepted` or `dismissed`.
   - Support manually created `accepted` edges, with optional source/target evidence blocks.
   - Allow editing the relationship type and removing an accepted edge. Record review timestamps and origin (`semantic_suggestion` or `manual`).
   - Enforce no duplicate directional pairs and no public connection to a draft node.

2. **Build the private Connections panel.**
   - On the node editor/detail view, list ranked suggestions with node title/type, relevance label/score, and matching source/target excerpts.
   - Provide accept, dismiss, and relationship-type controls. Require confirmation for deletion/removal where useful.
   - Add a manual-connect flow that searches the owner’s nodes and requires an edge type.
   - Make state changes immediately clear, and ensure dismissed pairs stop reappearing until content materially changes.

3. **Build public accepted-connections UI.**
   - Add a related-content section to each published node page.
   - Show only accepted edges where both nodes are published.
   - Render the chosen relationship type in human language (for example, “Inspired by” rather than a raw enum) and include a short node preview.
   - Do not show raw similarity scores or internal embedding metadata to visitors.

4. **Implement public semantic lookup.**
   - Add a search input that encodes the query with the same embedding provider and retrieves only published-node blocks.
   - Aggregate to node results, deduplicate nodes, and show title, type, summary, and a relevant excerpt.
   - Handle an empty query, no matches, embedding-service failure, and loading state accessibly.
   - Add basic type filtering. Consider combining Postgres full-text and vector results only if testing shows exact-name/phrase queries perform poorly; keep the ranking logic documented.

5. **Curate the first public graph.**
   - Review suggestions from the seeded content and accept a small set of clearly meaningful edges. Quality matters more than density.
   - Add manual narrative edges where semantic retrieval misses an important relationship.
   - Visit several multi-hop paths as a recruiter would, and improve summaries/connection choices that do not tell a clear story.

6. **Accessibility and resilience pass.**
   - Ensure connections and search results are keyboard reachable, announced sensibly to assistive technology, and understandable without color or a graph visualization.
   - Add empty states for nodes with no connections and searches with no results.
   - Test public endpoints directly to confirm drafts and suggestions cannot leak through response payloads or cached data.

7. **Test.**
   - Backend: status transitions, duplicate prevention, draft filtering, manual-edge authorization, and public-search filtering.
   - Frontend: accept/dismiss states, search result behavior, empty/error states, and accessible keyboard flow.
   - Run manual relevance checks with a short set of representative queries and record poor cases for later tuning.

## Decisions made

- Candidate threshold and relevance-label policy: _Pending implementation._
- Relationship-type display labels: _Pending implementation._
- Whether v1 uses vector-only or hybrid keyword/vector public lookup: _Pending implementation._

## Verification

- The owner can accept, dismiss, create, edit, and remove relationships through the dashboard.
- Accepted relationships appear publicly only when both endpoint nodes are published.
- Dismissed or suggested edges never appear in public API responses or UI.
- A public query returns relevant, deduplicated published nodes with useful excerpts.
- A keyboard-only user can perform a search and open a related node.

## Exit checklist

- [ ] The reviewed-connections workflow is fully usable end to end.
- [ ] At least several intentional multi-hop paths exist in the public portfolio.
- [ ] Public semantic lookup works without accounts or access to draft content.
- [ ] Accessibility, empty-state, and failure-state checks pass.
- [ ] The signature feature can be demonstrated in a short, clear walkthrough.

## Do not add yet

- A public chat/“ask my portfolio” assistant
- Automatic relationship publishing or AI-written public explanations
- Interactive graph visualization as a required navigation path
- GenAI source-discovery plugin
