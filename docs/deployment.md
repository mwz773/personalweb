# Deployment guide

This project has three deployable parts:

- `frontend/`: the public Vite/React portfolio and private owner dashboard.
- Supabase: the hosted database, authentication, and private image storage.
- `backend/`: the FastAPI semantic service used only for embedding content and suggesting connections.

Recommended hosting: **Vercel** for the frontend, **Render** for the FastAPI service, and Supabase for the existing managed services.

## Deployment order

1. Deploy the frontend to Vercel and test it at the temporary `vercel.app` URL.
2. Buy and connect a custom domain.
3. Update Supabase authentication URLs for that domain.
4. Deploy the FastAPI semantic service to Render when semantic authoring needs to work away from the local computer.

The public portfolio, owner dashboard, published content, graph, photos, and résumé download can work before the FastAPI service is deployed. Only **Embed this item** and **Generate suggestions** require the FastAPI service.

## 1. Prepare the frontend for Vercel

This Vite application uses client-side routes, including `/cv` and individual content URLs. Create `frontend/vercel.json` before deploying so direct links do not return a 404 error:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Commit and push the latest frontend changes before continuing.

## 2. Deploy the frontend to Vercel

1. Create an account at [Vercel](https://vercel.com/).
2. Select **Add New** → **Project**, then import this GitHub repository.
3. Set the project’s **Root Directory** to `frontend`.
4. Let Vercel use its detected Vite build settings.
5. Add these environment variables in Vercel’s project settings:

```text
VITE_SUPABASE_URL=your Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY=your Supabase publishable key
```

6. Deploy and test the generated `vercel.app` URL.

Do not add `DATABASE_URL`, a Supabase service-role key, or any other private credential to Vercel. Values beginning with `VITE_` are included in the browser build.

Test the public home page, `/cv`, an individual post URL, image loading, the résumé download, and owner sign-in at `/admin`.

## 3. Buy and connect a custom domain

Buy a domain from a registrar, such as Cloudflare Registrar or Porkbun. Possible names to check include:

- `mandyzhang.com`
- `mandyzhang.dev`
- `mandyzhang.me`
- `mandy-w-zhang.com`

To attach it to Vercel:

1. In Vercel, open the portfolio project.
2. Open **Settings** → **Domains**.
3. Add both the root domain (`your-domain.com`) and `www.your-domain.com`.
4. Follow the DNS instructions Vercel provides at the registrar.
5. Choose one version as the canonical domain and redirect the other to it.
6. Wait for DNS verification and HTTPS provisioning.

Vercel’s custom-domain guide: <https://vercel.com/docs/domains/set-up-custom-domain>

## 4. Configure Supabase for production

After the custom domain works, open the Supabase dashboard:

**Authentication** → **URL Configuration**

Set:

```text
Site URL: https://your-domain.com
```

Add these redirect URLs:

```text
https://your-domain.com/**
http://localhost:5173/**
```

The production URL ensures authentication links and redirects do not return to localhost. Keep the localhost entry for development.

Supabase redirect URL guide: <https://supabase.com/docs/guides/auth/redirect-urls>

## 5. Deploy the FastAPI semantic service to Render

Deploy this when the owner dashboard should be able to embed content and generate suggestions from any computer.

1. Create an account at [Render](https://render.com/).
2. Select **New** → **Web Service** and connect this GitHub repository.
3. Set the service’s **Root Directory** to `backend`.
4. Use these commands:

```text
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

5. Add the following Render environment variables:

```text
DATABASE_URL=your Supabase pooler connection string
SUPABASE_URL=your Supabase project URL
SUPABASE_PUBLISHABLE_KEY=your Supabase publishable key
SEMANTIC_ALLOWED_ORIGIN=https://your-domain.com
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
PYTHON_VERSION=3.12.0
```

The `DATABASE_URL` and any other secret values must live only in Render’s environment settings, never in Git.

Once Render finishes, open:

```text
https://your-render-service.onrender.com/health
```

It should return a healthy status response.

Render FastAPI guide: <https://render.com/docs/deploy-fastapi>

## 6. Connect the deployed frontend to the semantic service

Copy the public Render service URL. In Vercel, add this environment variable:

```text
VITE_SEMANTIC_API_URL=https://your-render-service.onrender.com
```

Redeploy the Vercel project. Then sign in at `/admin` and test embedding one item.

## Production checklist

- [ ] `npm run build` passes locally in `frontend/`.
- [ ] Public home page works from the production domain.
- [ ] Direct links to `/cv` and individual posts work after refresh.
- [ ] Supabase URL and publishable key are set in Vercel.
- [ ] Supabase Site URL and redirect URLs use the custom domain.
- [ ] `/admin` signs in correctly.
- [ ] Images and the PDF résumé download load correctly.
- [ ] FastAPI `/health` works on Render, if semantic authoring is deployed.
- [ ] Render’s `SEMANTIC_ALLOWED_ORIGIN` exactly matches the production frontend origin.
