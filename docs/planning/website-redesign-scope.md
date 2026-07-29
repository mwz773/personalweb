# Website redesign scope

## Purpose

Redesign the public portfolio from a card-based, route-first site into a content-dense personal hub. The homepage should lead with the knowledge graph, then move directly into writing and media. Individual items remain linkable pages; the homepage becomes the primary place to browse the body of work.

This document is a design and implementation scope. It does not change the database or frontend by itself.

## Design direction

### Principles

- **Content first, minimal chrome.** A name, a concise bio with inline links, then work.
- **Dense but legible.** Writing uses compact text rows with dates inline beside titles; media uses a tight visual mosaic.
- **Relationship-led.** The knowledge graph is the first major surface, not a secondary feature.
- **Warm and tactile.** The palette should feel natural, earthy, and editorial rather than corporate or gallery-minimal.
- **No decorative hero image.** Visual media belongs in the grid and content itself.
- **Accessible by default.** The redesign must retain keyboard navigation, readable contrast, text alternatives for cover art, and non-graph ways to explore all content.

### Palette

The approved palette anchors are:

| Role | Color | Hex |
| --- | --- | --- |
| Page background | Vanilla | `#F6EEE5` |
| Primary dark/text | Walnut | `#5D432C` |
| Deep accent | Auburn | `#922724` |
| Secondary accent | Canyon Clay (Sherwin-Williams SW 6054) | `#85594F` |
| Olive green | Olive | `#7E8B70` |
| Terracotta orange | Terracotta | `#CD7D5E` |
| Pastel brown | Brown | `#776052` |
| Graph highlight | Hunyadi yellow | `#E8A317` |

The Canyon Clay conversion is `#85594F`, as listed by [Sherwin-Williams for SW 6054](https://www.sherwin-williams.com/sherwinwilliams/SW6054-canyon-clay). Rhino blue is not part of the v1 palette.

Proposed usage:

- Vanilla: page background and quiet surfaces.
- Walnut: primary text and dark graph background.
- Olive, terracotta, auburn, and canyon clay: content-type colors and secondary accents.
- Hunyadi yellow: selected graph node, focused link, and active filter state only.

### Typography

Use two web-safe font stacks only:

- Display, headings, labels, and media titles: `Impact`, with `Haettenschweiler`, `Arial Narrow Bold`, and sans-serif fallbacks. This supplies the tall, emphatic editorial voice from the approved font reference.
- Body copy: `Georgia`, with `Times New Roman` and serif fallbacks.

Do not load or redistribute external font files for v1.

## Public information architecture

### Homepage: single-page hub

Order of sections:

1. **Compact identity header**
   - Name.
   - One-line bio with inline links.
   - LinkedIn icon linking to `https://linkedin.com/in/mandywzhang/`.
   - Email icon linking to `mailto:mandy.zhang@yale.edu`.
   - Link to `/cv` when the CV content is ready.
2. **Knowledge graph**
   - The first major visual surface after identity.
   - Uses only published nodes and accepted connections.
   - Keeps type filters, search/filtering, node selection, pan/zoom, and a text-based selected-item panel.
   - May retain `/graph` as a focused full-screen mode, while the homepage shows the primary embedded version.
3. **Writing feed**
   - Chronological, dense rows rather than cards.
   - Date sits inline with title, type, and a short summary/excerpt.
   - Type filters remain lightweight text links/pills.
   - Clicking a row opens the existing individual item page.
4. **Media grid**
   - Tight mosaic of uniform cover/poster thumbnails.
   - No visible captions by default; alt text and keyboard focus remain available.
   - Clicking an item opens its individual write-up.
   - Lightweight controls: media type and sort links.
5. **Footer**
   - Contact links, optional resume/CV link, and small site metadata.

### Individual item pages

Keep dedicated URLs for every published item. Redesign them to match the new type system and palette, while retaining:

- Full reflection/write-up.
- External source/project link where relevant.
- Accepted related content.
- A clear route back to the hub.

### CV / experience page

Add `/cv` after a resume is provided. The first version should be structured HTML rather than an embedded PDF, with an optional PDF download. It should include experience, education, selected projects, and contact links only after the source resume is reviewed.

## Proposed data model changes

These changes are required for a real media grid and bulk import preview. They should be implemented as a new, manually run Supabase migration after this scope is approved.

### Content types

Extend the existing `nodes.type` constraint with `film`.

Keep existing types: `reflection`, `project`, `article`, `book`, and `music`. The public interface should label `reflection` as **Journal**.

Journal is the single personal-writing and life-moments type: it can hold ordinary writing or document a hiking trip, vacation, and other significant moments with optional photos. Do not add `game` or `experience` types. The later `/cv` page can use structured resume data rather than ordinary portfolio nodes.

### Media metadata fields on `nodes`

| Field | Type | Purpose |
| --- | --- | --- |
| `cover_image_path` | `text`, nullable | Path to an owner-uploaded cover in a Supabase Storage bucket |
| `external_source` | `text`, nullable | Origin such as Letterboxd, Open Library, or a manual import |
| `external_id` | `text`, nullable | Stable identifier from the origin, used to avoid duplicate imports |
| `media_metadata` | `jsonb`, nullable | Source-specific details such as ISBN, director, runtime, or platform |
| `tags` | `text[]`, nullable | Optional owner-curated themes and lightweight filtering |

Add a uniqueness rule for `(external_source, external_id)` only when both values are present. This prevents a repeated bulk import from creating duplicate media entries.

### Images

Create a private Supabase Storage bucket for media covers. The owner can upload cover images from `/admin`; published pages receive short-lived signed URLs derived from `cover_image_path`. This keeps draft images private.

The corresponding storage policy must permit uploads/changes only to the owner and public reads only for covers attached to published portfolio items. The schema stores the storage path, not image binary data or a third-party URL.

### Journal photo galleries

Add a separate `node_media` table rather than adding a fixed number of image columns to `nodes`.

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `node_id` | `uuid` | The Journal item that owns the photo |
| `storage_path` | `text` | Supabase Storage path |
| `alt_text` | `text` | Required accessible description supplied by the owner |
| `ordinal` | `integer` | Display order within the entry |
| `created_at` | `timestamptz` | Upload record timestamp |

The owner dashboard will support multi-image uploads for Journal entries. A Journal entry may select its first image as the `cover_image_path` for use in the homepage grid; otherwise it stays in the writing feed.

## Media-grid interaction model

### Views

- **Grid:** default thumbnail mosaic, with CSS responsive sizing and no card chrome.

### Filters

- All.
- Books.
- Movies/films.
- Music.
- Journal entries with an uploaded cover image.

Articles and text-only Journal entries belong in the writing feed, not the media grid.

### Sorts

- Date added/published.
- Color — requires an explicit stored or derived color strategy; do not infer this in the browser for the first pass.
- Name/title.

Controls should be text-link-style buttons with an obvious selected state, not dropdown-heavy UI. Calendar view, consumption-date tracking, rhino blue, and ratings are explicitly out of scope for v1.

## Knowledge graph redesign

The graph remains a public surface built from published nodes and accepted manual/semantic relationships. The redesign should:

- Use the new palette by content type.
- Live at the top of the homepage and remain available at `/graph` as an optional focused view.
- Keep a readable text panel for the selected node and its connections.
- Continue to deduplicate a manual and semantic edge connecting the same pair.
- Avoid rendering drafts, suggested edges, similarity scores, or embedding information.

Do not make the graph the only navigation method. Writing rows, media thumbnails, search, and item pages must remain usable without it.

## Import and automation strategy

### Recommended first implementation: owner-only CSV import with preview

Build an owner-only importer in `/admin` after the redesign data model is in place.

1. Upload a CSV file.
2. Map its columns to title, type, source URL, summary, and optional reflection text.
3. Validate each row and detect duplicate external IDs/slugs.
4. Show a private preview.
5. Let the owner choose draft or published state.
6. Save only after explicit confirmation; never auto-publish imported rows.

This is the most useful common path for books, articles, films, music, and Journal entries. It is also easier to debug and safer than multiple fragile one-off integrations.

### Letterboxd: first import source

Use a **Letterboxd account export** as the first integration path, not scraping or a live sync. Letterboxd provides an export bundle containing CSV files, but its API access is by request and explicitly says it is not currently granting access for private/personal visualization projects. Its terms also prohibit scraping or automated extraction without authorization. [Letterboxd API access](https://letterboxd.com/api-beta/access/), [Letterboxd data export](https://letterboxd.com/user/exportdata/), [Letterboxd terms](https://letterboxd.com/legal/terms-of-use/)

The uploaded file `letterboxd-mwzhang-2026-07-26-17-11-utc.zip` contains `watched.csv`, `ratings.csv`, `diary.csv`, and `reviews.csv`. The first importer should use `reviews.csv` as the main source for film items because it includes title, year, Letterboxd URL, and review text. Ratings and watched dates are intentionally not imported or displayed in v1.

Recommended flow:

1. Export your own Letterboxd data as a ZIP/CSV bundle.
2. Upload the relevant CSV to the owner-only importer.
3. Map film title, year, review, and Letterboxd URL.
4. Preview matches and choose which entries become portfolio items.
5. Upload cover images to Supabase Storage and edit reflection content where desired.

An optional later feature can consume Letterboxd’s public RSS feed for new activity, but it should create private import candidates only—not automatic public posts.

### Books and articles

- **Books:** CSV import with ISBN, title, author, and optional cover metadata; the owner uploads the selected cover to Supabase Storage.
- **Articles:** CSV import of URLs; a server-side metadata fetcher can propose title, publisher, and summary. It must have strict URL validation, timeouts, and SSRF protections, and it must never publish automatically.
- **Manual entry remains available** for work that has no reliable source metadata.

## Delivery phases

### Phase R0 — decisions and migration design

- Approve final palette hex values.
- Decide the font licensing/fallback strategy.
- Confirm media categories and the Journal photo-gallery behavior.
- Define the database migration and CSV column template.

### Phase R1 — data foundation

- Completed locally: manually run the approved Supabase migration.
- Completed locally: add owner-only media metadata editing to the existing dashboard.
- Completed locally: create the private Supabase Storage cover bucket and owner/published-content policies.
- Completed locally: add media cover-image upload, display, and validation.
- Completed locally: add multi-image Journal gallery upload, ordering, alt text, and display.
- Next: seed several real media items as the redesigned public hub is built.

### Phase R2 — public visual redesign

- Replace the current public homepage with the single-page hub.
- Embed the graph at the top.
- Build dense writing feed and media grid.
- Redesign individual item pages and navigation.

### Phase R3 — importer and CV

- Build owner-only CSV import preview/confirm flow.
- Add Letterboxd-export mapping, beginning with the uploaded export’s `reviews.csv`.
- Add `/cv` once the resume content is available.
- Add LinkedIn/email links from final URLs.

### Phase R4 — validation and polish

- Test mobile, keyboard, screen-reader, contrast, empty states, and image failures.
- Verify no draft/import-preview data leaks publicly.
- Tune grid performance and graph performance with a representative data set.

## Open decisions

No open design decisions remain before Phase R0. The approved v1 scope uses Journal as the renamed reflection type, excludes ratings and rhino blue, and keeps the media grid image-led.

## Out of scope for this redesign

- Automatic publishing from any external source.
- Scraping Letterboxd or other sites.
- Public editing, comments, likes, or social feeds.
- AI-generated reviews or relationship explanations.
- A CV implementation before the resume content is supplied.
