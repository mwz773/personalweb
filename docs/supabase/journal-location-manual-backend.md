# Journal globe: location field — manual backend step

This adds an optional human-readable place to each Journal entry, such as `Kyoto, Japan` or `Chicago, IL`. It does not change existing entries, and an entry without a place remains valid.

In **Supabase Dashboard → SQL Editor → New query**, type and run:

```sql
alter table public.nodes
  add column if not exists location_name text;

alter table public.nodes
  drop constraint if exists nodes_location_name_length_check;

alter table public.nodes
  add constraint nodes_location_name_length_check
  check (
    location_name is null
    or char_length(trim(location_name)) between 1 and 160
  );
```

## Verify

Run this query afterwards:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'nodes'
  and column_name = 'location_name';
```

It should return one `location_name` row with data type `text`.

Do not add coordinates to Supabase. The site will use a small, local lookup table that maps each place name to coordinates, so no geocoding API or API key is needed.
