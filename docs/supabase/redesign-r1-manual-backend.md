# Redesign R1: media foundation — backend steps

This is the first backend step for the visual redesign. You will create a **private** image bucket, allow the site to display images only when their portfolio item is published, add the `film` content type, and add the fields needed for cover images and Journal photo galleries.

Type and run this yourself in **Supabase Dashboard → SQL Editor → New query**. Do not put these commands in the frontend or FastAPI project.

## Before you begin

- Keep the existing `reflection` database value. The redesigned interface will call it **Journal**; keeping the stored value avoids breaking existing entries.
- This migration does not delete or rewrite existing nodes, blocks, edges, or links.
- The bucket is deliberately private. The frontend will create short-lived signed image URLs later. That is safer than a public bucket: draft or unconnected images cannot be downloaded merely because someone knows a URL.

## 1. Create the storage bucket

1. Open **Storage** in the Supabase dashboard.
2. Click **New bucket**.
3. Name it exactly `portfolio-media`.
4. Leave **Public bucket** turned **off**.
5. If the bucket form offers restrictions, set a **5 MB** maximum file size and allow only `image/jpeg`, `image/png`, and `image/webp`.
6. Create the bucket.

Do not use the Storage dashboard to upload your final portfolio images. Those uploads are made with administrative credentials and are not associated with your owner account. We will add the owner upload interface after this migration.

## 2. Run this SQL migration

Copy the entire block below into one SQL Editor query and click **Run**.

```sql
-- Add the redesigned content/data fields without changing existing content.
alter table public.nodes
  drop constraint if exists nodes_type_check;

alter table public.nodes
  add constraint nodes_type_check
  check (type in ('reflection', 'project', 'article', 'book', 'music', 'film'));

alter table public.nodes
  add column if not exists cover_image_path text,
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists media_metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags text[] not null default '{}';

alter table public.nodes
  drop constraint if exists nodes_cover_image_path_length_check;

alter table public.nodes
  add constraint nodes_cover_image_path_length_check
  check (
    cover_image_path is null
    or char_length(trim(cover_image_path)) between 1 and 500
  );

-- An importer can safely be run again when it supplies a real source + ID.
create unique index if not exists nodes_unique_external_source_id
  on public.nodes (external_source, external_id)
  where external_source is not null and external_id is not null;

-- A Journal entry can own any number of ordered, accessible photos.
create table if not exists public.node_media (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  storage_path text not null unique
    check (char_length(trim(storage_path)) between 1 and 500),
  alt_text text not null
    check (char_length(trim(alt_text)) between 1 and 280),
  ordinal integer not null default 0 check (ordinal >= 0),
  created_at timestamptz not null default now(),
  constraint node_media_unique_node_ordinal unique (node_id, ordinal)
);

create index if not exists node_media_node_id_idx
  on public.node_media (node_id, ordinal);

alter table public.node_media enable row level security;

grant select on public.node_media to anon, authenticated;
grant insert, update, delete on public.node_media to authenticated;

drop policy if exists "Published node media is publicly readable" on public.node_media;
create policy "Published node media is publicly readable"
  on public.node_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.nodes
      where nodes.id = node_media.node_id
        and nodes.status = 'published'
    )
  );

drop policy if exists "Owner can read media for their nodes" on public.node_media;
create policy "Owner can read media for their nodes"
  on public.node_media
  for select
  to authenticated
  using (
    exists (
      select 1 from public.nodes
      where nodes.id = node_media.node_id
        and nodes.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owner can add media for their nodes" on public.node_media;
create policy "Owner can add media for their nodes"
  on public.node_media
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.nodes
      where nodes.id = node_media.node_id
        and nodes.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owner can update media for their nodes" on public.node_media;
create policy "Owner can update media for their nodes"
  on public.node_media
  for update
  to authenticated
  using (
    exists (
      select 1 from public.nodes
      where nodes.id = node_media.node_id
        and nodes.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.nodes
      where nodes.id = node_media.node_id
        and nodes.owner_id = (select auth.uid())
    )
  );

drop policy if exists "Owner can delete media for their nodes" on public.node_media;
create policy "Owner can delete media for their nodes"
  on public.node_media
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.nodes
      where nodes.id = node_media.node_id
        and nodes.owner_id = (select auth.uid())
    )
  );

-- Files uploaded by the owner use this path pattern:
--   <your-auth-user-id>/<node-id>/<random-file-name>
-- The public SELECT policy below makes only files recorded on published nodes
-- available for signed URLs. It does not make the bucket public.
drop policy if exists "Published portfolio media can be read" on storage.objects;
create policy "Published portfolio media can be read"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'portfolio-media'
    and (
      exists (
        select 1
        from public.node_media
        join public.nodes on nodes.id = node_media.node_id
        where node_media.storage_path = storage.objects.name
          and nodes.status = 'published'
      )
      or exists (
        select 1
        from public.nodes
        where nodes.cover_image_path = storage.objects.name
          and nodes.status = 'published'
      )
    )
  );

drop policy if exists "Owner can read portfolio media" on storage.objects;
create policy "Owner can read portfolio media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'portfolio-media'
    and owner_id = (select auth.uid()::text)
  );

drop policy if exists "Owner can upload portfolio media" on storage.objects;
create policy "Owner can upload portfolio media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Owner can update portfolio media" on storage.objects;
create policy "Owner can update portfolio media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'portfolio-media'
    and owner_id = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'portfolio-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Owner can delete portfolio media" on storage.objects;
create policy "Owner can delete portfolio media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'portfolio-media'
    and owner_id = (select auth.uid()::text)
  );
```

## 3. Verify the migration

Run this separate read-only query:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'nodes'
  and column_name in (
    'cover_image_path', 'external_source', 'external_id',
    'media_metadata', 'tags'
  )
order by column_name;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'node_media'
order by ordinal_position;
```

You should see five new `nodes` fields and the six `node_media` fields. In **Table Editor**, `nodes.type` should now accept `film`.

### If you ran an earlier copy of this guide

Run the following correction once before testing image uploads. It lets the public site create a signed URL for a cover image on a published Book, Film, Music item, and so on—not only gallery images.

```sql
drop policy if exists "Published portfolio media can be read" on storage.objects;
create policy "Published portfolio media can be read"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'portfolio-media'
    and (
      exists (
        select 1
        from public.node_media
        join public.nodes on nodes.id = node_media.node_id
        where node_media.storage_path = storage.objects.name
          and nodes.status = 'published'
      )
      or exists (
        select 1
        from public.nodes
        where nodes.cover_image_path = storage.objects.name
          and nodes.status = 'published'
      )
    )
  );
```

## What this protects

- Only your authenticated owner account can add, edit, or delete media records and storage files.
- Visitors can read a `node_media` row only if its parent node is published.
- The private bucket requires a signed URL; later frontend code will request one only for a photo attached to published content.
- A draft Journal entry may keep its images private while you write it.

Supabase Storage access is controlled with policies on `storage.objects`; uploads need a matching `SELECT` policy because the upload response returns object metadata. Private buckets are served with signed URLs, rather than public URLs. See Supabase’s [Storage access-control guide](https://supabase.com/docs/guides/storage/security/access-control), [private/public bucket overview](https://supabase.com/docs/guides/storage/buckets/fundamentals), and [upload-policy troubleshooting note](https://supabase.com/docs/guides/troubleshooting/storage-error-403-forbidden-new-row-violates-row-level-security-policy-on-upload-a94384).

## Next step

When the bucket is created and both queries succeed, reply **done** (or paste the exact Supabase error). I will then update the frontend to let you create Films, upload cover images, and add/reorder Journal gallery photos.
