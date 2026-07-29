# Semantic Stage 1: pgvector and semantic data tables

You chose `sentence-transformers/all-MiniLM-L6-v2`. It produces **384-dimensional** embeddings, so this manual database step creates `vector(384)` storage.

Type this SQL yourself in **Supabase → SQL Editor → New query**, then click **Run**. It does not embed anything yet and does not change any public page behavior.

## Code to type and run

```sql
create extension if not exists vector with schema extensions;

alter table public.nodes
  add column if not exists embedding_status text not null default 'not_embedded'
    check (embedding_status in ('not_embedded', 'processing', 'ready', 'failed')),
  add column if not exists embedding_model text,
  add column if not exists last_embedded_at timestamptz,
  add column if not exists embedding_error text;

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  content text not null check (char_length(trim(content)) > 0),
  embedding extensions.vector(384),
  embedding_model text not null,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint blocks_unique_node_ordinal unique (node_id, ordinal)
);

create index blocks_node_id_idx on public.blocks (node_id);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references public.nodes(id) on delete cascade,
  target_node_id uuid not null references public.nodes(id) on delete cascade,
  source_block_id uuid references public.blocks(id) on delete set null,
  target_block_id uuid references public.blocks(id) on delete set null,
  relationship_type text not null default 'related_to'
    check (relationship_type in ('related_to', 'inspired_by', 'cites', 'extends', 'contrasts_with')),
  confidence_score real check (confidence_score >= 0 and confidence_score <= 1),
  status text not null default 'suggested'
    check (status in ('suggested', 'accepted', 'dismissed')),
  origin text not null default 'semantic_suggestion'
    check (origin in ('semantic_suggestion', 'manual')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint edges_no_self_link check (source_node_id <> target_node_id),
  constraint edges_unique_pair unique (source_node_id, target_node_id)
);

create index edges_source_node_id_idx on public.edges (source_node_id);
create index edges_target_node_id_idx on public.edges (target_node_id);

alter table public.blocks enable row level security;
alter table public.edges enable row level security;

grant select on public.blocks to authenticated;
grant select on public.edges to anon, authenticated;
grant insert, update, delete on public.edges to authenticated;

create policy "Owner can read blocks for their nodes"
  on public.blocks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.nodes
      where nodes.id = blocks.node_id
        and nodes.owner_id = (select auth.uid())
    )
  );

create policy "Accepted semantic edges are publicly readable"
  on public.edges
  for select
  to anon, authenticated
  using (
    status = 'accepted'
    and exists (
      select 1 from public.nodes as source_node
      where source_node.id = source_node_id
        and source_node.status = 'published'
    )
    and exists (
      select 1 from public.nodes as target_node
      where target_node.id = target_node_id
        and target_node.status = 'published'
    )
  );

create policy "Owner can read semantic edges for their nodes"
  on public.edges
  for select
  to authenticated
  using (
    exists (
      select 1 from public.nodes as source_node
      where source_node.id = source_node_id
        and source_node.owner_id = (select auth.uid())
    )
  );

create policy "Owner can update semantic edges for their nodes"
  on public.edges
  for update
  to authenticated
  using (
    exists (
      select 1 from public.nodes as source_node
      where source_node.id = source_node_id
        and source_node.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.nodes as source_node
      where source_node.id = source_node_id
        and source_node.owner_id = (select auth.uid())
    )
  );
```

## What this creates

- `blocks`: paragraph-level plain text and its future embedding. This table is private; public visitors cannot inspect paragraphs or vectors.
- `edges`: future semantic suggestions and your review decisions. Only accepted edges between published nodes can be public.
- Four embedding-status fields on existing `nodes`, so the dashboard can show whether an item has been embedded.

Your existing `node_links` manual connections are unchanged. Keep using them; semantic edges are separate because they require review state, confidence, and evidence blocks.

## Verify safely

After the SQL succeeds:

1. In Supabase **Table Editor**, confirm `blocks` and `edges` exist.
2. In the app, restart `npm run dev` and open `/admin`.
3. Each existing item should show **Semantic: not embedded**. This is expected.
4. Open an incognito window and confirm the public portfolio still works normally.

Do not add rows to `blocks` or `edges` manually. Stage 2’s FastAPI service will be responsible for creating them.

If SQL reports an error, send the exact message before changing any policy or removing any constraint.
