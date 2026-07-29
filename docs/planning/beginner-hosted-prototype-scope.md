# Active Build Scope: Hosted Portfolio Authoring Prototype

## Purpose

This is the active, beginner-friendly path for the project. It does **not** replace or delete the full semantic-portfolio scope in [`semantic-portfolio-scope.md`](semantic-portfolio-scope.md); that document remains the long-term vision.

This scope deliberately starts with a real, publicly hosted portfolio where I can sign in and publish content that persists in a cloud database. It postpones the custom FastAPI service, Docker, pgvector, embeddings, and automatic semantic linking until the basic authoring experience is working and enjoyable.

## First-release goal

Build a public, read-only portfolio where:

- Visitors can browse published reflections and projects.
- I can sign in as the sole owner, create/edit/delete drafts, and publish content from an `/admin` area.
- Content is stored in hosted Postgres, not in browser storage or source files.
- I can add manually curated “related” links between pieces of content.

This is already a complete, useful portfolio. The semantic-linking system is a later upgrade, not a prerequisite for launch.

---

## Architecture for the prototype

```text
Visitor or owner browser
  → React + Vite + TypeScript site
  → Supabase Auth (owner login)
  → Supabase Postgres (content and manually curated links)
  → Row Level Security (public read of published content; owner-only writes)
```

The browser may use Supabase’s publishable/anon key, but it must never contain a service-role key or any other secret with unrestricted database access. Supabase’s React guidance supports this browser-client pattern when Row Level Security (RLS) is enabled; RLS policies enforce what the public and owner can do. [Supabase React quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs) · [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Chosen tools

| Need | Choice | Why now |
|---|---|---|
| UI | React + Vite + TypeScript | Small, fast feedback loop and a useful frontend skill |
| Persistent data | Supabase Postgres | Hosted relational database without first building an API service |
| Owner login | Supabase Auth | Avoids inventing insecure password/session handling |
| Authorization | Supabase RLS | Enforces public-read/owner-write rules at the database boundary |
| Hosting | Vercel or Netlify, chosen during deployment | Straightforward static frontend deployment |
| Styling | Choose one simple approach during Phase A | Avoid changing UI frameworks repeatedly |

### Deliberately absent at first

- FastAPI, Docker, Postgres running locally, pgvector, embeddings, and LLM APIs.
- File/photo uploads, external metadata adapters, GitHub synchronization, and visitor accounts.
- A public write form, comments, or any feature allowing strangers to publish content.

---

## Security and publishing rules

“Public authoring” here means **a publicly hosted site where the owner can author and publish**. It does not mean that anonymous visitors can create content.

1. Public visitors may read only records with `status = 'published'`.
2. The owner may create, read, update, delete, publish, and unpublish their own records.
3. Disable public sign-up after creating the one owner account. Do not create additional accounts for this prototype.
4. RLS must be enabled on every publicly exposed table. Do not rely on hidden buttons or frontend checks for security.
5. Drafts must return no data—not merely be hidden in the interface—to unauthenticated requests.
6. Keep Supabase service-role credentials out of the frontend, Git history, and deployment environment for the client app.

---

## Minimal data model

Start with two tables. Use the Supabase SQL editor at first, then save the finalized schema as version-controlled migrations once the prototype is stable.

```text
nodes
├── id (UUID primary key)
├── owner_id (UUID referencing the authenticated owner)
├── slug (unique public URL)
├── type ('reflection' | 'project')
├── title
├── summary
├── markdown_content
├── status ('draft' | 'published')
├── created_at, updated_at, published_at
└── project_url (nullable; used only for projects)

node_links
├── id (UUID primary key)
├── owner_id (UUID referencing the authenticated owner)
├── source_node_id (UUID → nodes)
├── target_node_id (UUID → nodes)
├── relationship_type ('related_to' | 'inspired_by' | 'extends')
├── created_at
└── unique(source_node_id, target_node_id)
```

For RLS, implement policies that allow anonymous/public selection only for published nodes (and links whose endpoints are both published), while allowing the authenticated owner to manage only rows whose `owner_id` equals their authenticated user ID. Test policies from an unauthenticated browser session—not only while logged in.

---

## Phases

### Phase A — First hosted content prototype

**Goal:** create a live React site connected to Supabase, with one publicly readable reflection.

**Build steps:**

1. Create a Supabase project and a React + Vite + TypeScript application.
2. Add the Supabase browser client using `VITE_SUPABASE_URL` and the publishable key in a local `.env` file; commit only `.env.example`.
3. Create the `nodes` table with the reflection fields, enable RLS, and add a temporary controlled way to insert one test reflection from the Supabase dashboard.
4. Create a public home page that queries and renders published reflections.
5. Create a public node-detail route using a slug.
6. Deploy the frontend to Vercel or Netlify and set its environment variables in the host dashboard.
7. Confirm the live site shows the published reflection and that a draft is invisible in an incognito window.

**Done when:** a real URL displays one published reflection stored in Supabase—not hardcoded in the frontend.

**Keep it small:** no login UI, no editor, no project type, and no related links yet.

### Phase B — Private owner authoring

**Goal:** replace dashboard-only data entry with a safe owner dashboard in the live site.

**Build steps:**

1. Create the sole owner account in Supabase Auth and disable public sign-up.
2. Add owner-only RLS policies for `nodes`; test read/write behavior while logged in and logged out.
3. Build `/admin/login`, session restore, logout, and an owner-only `/admin` route.
4. Build an editor for reflections: title, summary, slug, Markdown body, save draft, publish, and unpublish.
5. Add simple validation and a Markdown preview. Sanitize rendered Markdown.
6. Test that direct API requests cannot create or edit data while unauthenticated.

**Done when:** I can log in on the deployed site, create a draft, publish it, see it publicly, then unpublish it and see it disappear publicly.

**Keep it small:** only one owner and only reflections. Do not add custom passwords, roles, or backend services.

### Phase C — Portfolio content and manual connections

**Goal:** make the prototype feel like a portfolio rather than a blog.

**Build steps:**

1. Add the `project` node type and `project_url` field; extend the dashboard form and public rendering.
2. Build a simple content index with filters for reflections and projects.
3. Create the `node_links` table, enable RLS, and write public/owner policies.
4. Add an owner interface to create and remove manual links between nodes.
5. Display published related links on each public node page with a human-readable relationship label.
6. Enter 6–10 pieces of real, public-appropriate content and manually curate a few strong links.

**Done when:** a visitor can browse a project or reflection and follow at least one intentional connection to another piece of work.

**Keep it small:** relationships are entirely manual. No embeddings, automatic suggestions, timelines, external-source ingestion, or graph visualization.

### Phase D — Polish and learning review

**Goal:** make a version you are proud to share and decide whether the semantic upgrade is worth the next learning step.

**Build steps:**

1. Improve visual hierarchy, mobile layout, keyboard navigation, focus states, color contrast, and empty states.
2. Add an About/landing section that explains what the portfolio is and guides visitors to content.
3. Review public content, titles, summaries, links, and spelling.
4. Document how to run locally, deploy, update environment variables, and create/edit content.
5. Ask one or two trusted people to try the site and note where they get confused.
6. Decide whether to continue to semantic search based on enjoyment, content volume, and the usefulness of your manual links.

**Done when:** the site is usable on phone and desktop, has several real entries, and can be shared confidently.

### Phase E — Optional semantic upgrade

Only begin this after Phase D. Reuse the full scope and Phase 3/4 documents for this work.

**Upgrade path:**

1. Add a small FastAPI service focused on Markdown chunking, local `sentence-transformers` embeddings, and pgvector retrieval.
2. Connect it to the same hosted Postgres database or migrate deliberately to a compatible managed Postgres setup.
3. Generate private candidate links from semantic similarity.
4. Add an owner review flow; keep manual links as a permanent fallback.
5. Add public semantic lookup only after the candidate quality is demonstrably useful.

Do not begin with GenAI or an LLM. If useful later, add it after retrieval to help explain or label already-retrieved candidates; it must never automatically publish links or sources.

---

## First working session: do only this

The first session should be 60–90 minutes. Its goal is momentum, not completeness.

- [ ] Create the React + Vite project.
- [ ] Run it locally and change the page title/text so it feels like yours.
- [ ] Create a Supabase project.
- [ ] Add the project URL and publishable key to a local `.env` file.
- [ ] Connect from React and display a simple “connected” state.
- [ ] Commit the starter project (without `.env`).

Stop there. A working frontend connected to a hosted project is a successful first session. Create the table and public content page in the next session.

---

## When to return to the full scope

Return to the original semantic scope once all of these are true:

- I have a publicly shareable site and can independently add content to it.
- I have at least 10–15 thoughtful entries with enough written reflection to compare meaningfully.
- Manual connections are becoming repetitive or visibly miss useful relationships.
- I am excited to learn backend/Python and vector search—not adding them only because the original plan said so.

At that point, the semantic system becomes a natural enhancement to something already valuable.
