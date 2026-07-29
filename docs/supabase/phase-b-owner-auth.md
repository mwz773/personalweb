# Phase B: create the owner account and enable the dashboard

The dashboard code is ready, but it intentionally cannot write to your database until you create one Supabase Auth user and apply the owner-only Row Level Security policies.

## 1. Create your one owner account

1. Open your project in the Supabase dashboard.
2. Open **Authentication → Users**.
3. In the upper-right of the Users page, click **Add user** and choose **Send invitation**.
4. Enter your own email address and click **Invite user**.
5. Open the invitation email from Supabase and follow its link to finish creating the account and set a strong password. Save that password in a password manager.
6. Return to **Authentication → Users** and confirm that your email now appears in the user list.
7. In the left navigation, open **Authentication → Sign In / Providers**. Open the **Email** provider settings, turn off **Allow new users to sign up**, then save. There should be no other users for this prototype.

## 2. Apply the owner policies

1. Open [`phase-b-owner-auth.sql`](../../supabase/phase-b-owner-auth.sql).
2. Replace `REPLACE-WITH-YOUR-OWNER-EMAIL@example.com` with the email address you used for the account. Keep the single quotes around the email.
3. In Supabase, open **SQL Editor → New query**.
4. Paste the entire edited file and click **Run**.

This does four things:

- Assigns your existing Phase A reflection to your owner account.
- Makes `owner_id` mandatory for future content.
- Lets anonymous visitors read only published rows.
- Lets the signed-in owner manage only rows they own, including drafts.

## 3. Use the dashboard

1. Restart the Vite server if it is running: `npm run dev` from `frontend/`.
2. Open `http://localhost:5173/admin`.
3. Sign in with the account you created.
4. Confirm that your original reflection appears in the list.
5. Create a draft reflection. Check in an incognito window that it does not appear publicly.
6. Change it to **Publish publicly**, save, and confirm it appears on the homepage.

## Safety check

After testing, sign out and refresh `/admin`. The sign-in screen should appear. In an incognito window, drafts must not appear on the homepage or at their direct `/reflections/<slug>` URL.
