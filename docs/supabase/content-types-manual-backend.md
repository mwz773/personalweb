# Add articles, books, and music: backend code

Type this SQL yourself in **Supabase → SQL Editor → New query**, then run it before refreshing the frontend. It expands the existing `nodes` table; it does not change your RLS policies or remove any content.

```sql
alter table public.nodes
  drop constraint nodes_type_check;

alter table public.nodes
  add constraint nodes_type_check
  check (type in ('reflection', 'project', 'article', 'book', 'music'));

alter table public.nodes
  add column if not exists creator text,
  add column if not exists source_name text,
  add column if not exists source_url text;
```

## What each new field means

| Content type | `creator` | `source_name` | `source_url` |
|---|---|---|---|
| Article | Author | Publication/site | Original article link |
| Book | Author | Publisher | Book/publisher/library link |
| Music | Artist/creator | Album/platform/context | Listening link |

Projects continue to use `project_url`. Reflections do not need any source fields.

## Important content rule

For articles, books, and music, enter only lightweight metadata and **your own reflection**. Do not copy full article bodies, book passages, or song lyrics into `markdown_content`. This keeps the portfolio personal, copyright-conscious, and useful for future semantic linking.

## Verify

1. Run the SQL once; it should complete without error.
2. Restart `npm run dev` if it is running.
3. Visit `/admin` and create a draft article or book.
4. Confirm the appropriate metadata fields appear for that type.
5. Publish it and verify that it appears in the matching public filter and has its own public page.

If Supabase reports that `nodes_type_check` does not exist, stop and send me the exact error. Do not remove all constraints from the table.
