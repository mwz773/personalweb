-- Phase A starter schema for the hosted portfolio prototype.
-- Run this file in the Supabase Dashboard SQL Editor.
-- It intentionally contains only the `nodes` table; owner login and writes
-- are added in Phase B.

create extension if not exists pgcrypto;

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  slug text not null unique,
  type text not null default 'reflection'
    check (type in ('reflection', 'project')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  summary text not null check (char_length(trim(summary)) between 1 and 320),
  markdown_content text not null check (char_length(trim(markdown_content)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  project_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists nodes_public_reflections_idx
  on public.nodes (published_at desc)
  where status = 'published' and type = 'reflection';

alter table public.nodes enable row level security;

grant select on public.nodes to anon, authenticated;

-- Public visitors may read only content that has been intentionally published.
drop policy if exists "Published nodes are publicly readable" on public.nodes;
create policy "Published nodes are publicly readable"
  on public.nodes
  for select
  to anon, authenticated
  using (status = 'published');


