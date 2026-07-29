# Supabase setup for Phase A

This guide creates a real hosted database for the public portfolio. In Phase A, you will insert one test reflection from the Supabase dashboard. You will build the private in-site authoring form in Phase B.

## 1. Create the project

1. Create an account and a new project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Choose a project name, database password, and region. Save the database password in a password manager; the frontend will not need it.
3. Wait for the project to finish provisioning.

## 2. Add the database table and public-read policy

1. In the left navigation, open **SQL Editor**.
2. Create a new query.
3. Copy all contents of [`schema.sql`](../../supabase/schema.sql) into the editor and click **Run**.
4. Confirm that `public.nodes` appears in **Table Editor**.

The SQL enables Row Level Security. The only browser-facing policy in Phase A allows anyone to read rows whose status is `published`; drafts are not returned to the public site.

## 3. Add one published reflection

In the SQL Editor, run the sample `insert` statement at the bottom of `schema.sql` after removing its leading `--` comment markers. Or add a row in **Table Editor** with these required values:

| Column | Example value |
|---|---|
| `slug` | `a-question-worth-following` |
| `type` | `reflection` |
| `title` | `A question worth following` |
| `summary` | `A first reflection for my new portfolio.` |
| `markdown_content` | `This is my first published reflection.` |
| `status` | `published` |
| `published_at` | current date/time |

Also create a second row with `status` set to `draft`. It should **not** appear on the public site; this is the first security check.

## 4. Connect the frontend

1. In the Supabase dashboard, open **Connect** (or **Project Settings → API**).
2. Copy the **Project URL** and the **Publishable key**. The publishable/anon key is intended for browser clients when RLS is enabled. Do **not** copy a `service_role` key.
3. In this repository, copy `frontend/.env.example` to `frontend/.env`.
4. Fill it in:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

5. Start or restart the frontend:

   ```sh
   cd frontend
   npm run dev
   ```

## 5. Verify

- The homepage shows the published reflection.
- Opening `/reflections/a-question-worth-following` shows its detail page.
- Open the site in an incognito/private browser window: the published reflection still appears.
- The draft reflection never appears, including when directly attempting its slug URL.

If the app reports a connection problem, first verify that the project URL/key are in `frontend/.env`, then restart the Vite server, and finally confirm that `schema.sql` ran successfully.

## Important for Phase B

Do not add public insert/update/delete policies. In Phase B, we will add your sole owner account and carefully scoped owner-only policies before building the `/admin` editor.
