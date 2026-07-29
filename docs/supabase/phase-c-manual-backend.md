# Phase C backend: manual connections

You asked to type backend code yourself. This guide contains the only database code required for Phase C. Type it into **Supabase → SQL Editor → New query** yourself, then click **Run**.

The existing `nodes` table already supports `project` and `project_url`, so do not alter it for this phase. This code creates a new `node_links` table for your manually curated relationships.

## Before you begin

- You can sign in at `/admin` and create/edit a reflection.
- You have at least two portfolio items to connect.
- You are signed into the Supabase dashboard as the project owner.

## Code to type and run

```sql
create table public.node_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  source_node_id uuid not null
    references public.nodes(id) on delete cascade,
  target_node_id uuid not null
    references public.nodes(id) on delete cascade,
  relationship_type text not null
    check (relationship_type in ('related_to', 'inspired_by', 'extends')),
  created_at timestamptz not null default now(),
  constraint node_links_no_self_link
    check (source_node_id <> target_node_id),
  constraint node_links_unique_pair
    unique (source_node_id, target_node_id)
);

create index node_links_source_node_id_idx
  on public.node_links (source_node_id);

create index node_links_target_node_id_idx
  on public.node_links (target_node_id);

alter table public.node_links enable row level security;

grant select on public.node_links to anon, authenticated;
grant insert, delete on public.node_links to authenticated;

create policy "Published links are publicly readable"
  on public.node_links
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.nodes as source_node
      where source_node.id = source_node_id
        and source_node.status = 'published'
    )
    and exists (
      select 1
      from public.nodes as target_node
      where target_node.id = target_node_id
        and target_node.status = 'published'
    )
  );

create policy "Owner can read their links"
  on public.node_links
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owner can create links between their nodes"
  on public.node_links
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1
      from public.nodes as source_node
      where source_node.id = source_node_id
        and source_node.owner_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.nodes as target_node
      where target_node.id = target_node_id
        and target_node.owner_id = (select auth.uid())
    )
  );

create policy "Owner can delete their links"
  on public.node_links
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
```

## What this code does

- Creates one record for every intentional connection: a source item, a target item, and a relationship label.
- Stops an item from linking to itself and stops duplicate directional links.
- Lets the public read a link only when **both** endpoint items are published.
- Lets you, the signed-in owner, create and delete links only between your own portfolio items.
- Uses `on delete cascade`, so deleting a portfolio item also removes its connections instead of leaving broken links behind.

## Test it from the frontend

1. Restart `npm run dev` if it is already running.
2. Go to `http://localhost:5173/admin` and sign in.
3. Create a **project** using the new content-type selector, then publish it.
4. Open an existing reflection in the dashboard. Under **Manual connections**, connect it to the project and select a relationship type.
5. Open the reflection’s public page in an incognito window. The **Connected work** section should show the project.
6. Change either item to draft and refresh the public page. The connection must disappear publicly.

If the SQL editor reports an error, stop and send me the exact error text. Do not weaken or remove the Row Level Security policies to make the error disappear.
