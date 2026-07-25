-- Phase B: private owner authoring.
-- Complete the first placeholder below only AFTER creating your owner user in
-- Supabase Dashboard → Authentication → Users. Then run this entire file in
-- the SQL Editor.

-- 1. Replace this email with the email address of your one owner account.
--    This assigns the Phase A starter reflection to you so it is editable.
do $$
declare
  site_owner_id uuid;
begin
  select id into site_owner_id
  from auth.users
  where email = 'mandy.zhang@yale.edu';

  if site_owner_id is null then
    raise exception 'No Supabase Auth user matches the owner email.';
  end if;

  update public.nodes
  set owner_id = site_owner_id
  where owner_id is null;
end $$;

-- 2. Every node now belongs to an owner. New browser-created rows receive
--    the signed-in user automatically.
alter table public.nodes
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

grant insert, update, delete on public.nodes to authenticated;

-- The public Phase A policy remains in place: everyone can read published rows.
-- These owner policies additionally allow the one authenticated owner to see
-- drafts and manage only their own rows.
drop policy if exists "Owner can read their nodes" on public.nodes;
create policy "Owner can read their nodes"
  on public.nodes
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owner can create their nodes" on public.nodes;
create policy "Owner can create their nodes"
  on public.nodes
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owner can update their nodes" on public.nodes;
create policy "Owner can update their nodes"
  on public.nodes
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owner can delete their nodes" on public.nodes;
create policy "Owner can delete their nodes"
  on public.nodes
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Keep `updated_at` accurate without trusting the frontend clock.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_nodes_updated_at on public.nodes;
create trigger set_nodes_updated_at
before update on public.nodes
for each row execute function public.set_updated_at();
