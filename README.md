# Spotify OAuth Backend (Vercel)

Minimal serverless backend for Spotify OAuth. Contains two serverless functions:

- `api/login.js` — redirects to Spotify authorize URL
- `api/callback.js` — exchanges code for token and redirects to frontend

Environment variables (set these in Vercel dashboard or via `vercel env`):

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI` (e.g. `https://your-deploy.vercel.app/api/callback`)

Deploy steps (recommended):

1. Install Vercel CLI and login:

```bash
npm i -g vercel
vercel login
```

2. From the project root, link or initialize the project and add env vars:

```bash
vercel # follow prompts to create/link project
vercel env add SPOTIFY_CLIENT_ID production
vercel env add SPOTIFY_CLIENT_SECRET production
vercel env add SPOTIFY_REDIRECT_URI production
```

3. Deploy (preview or production):

```bash
vercel       # preview deploy
vercel --prod
```

Local testing:

```bash
vercel dev
# then open http://localhost:3000/api/login in your browser
```

Important: In the Spotify Developer Dashboard, set the app Redirect URI to your Vercel callback URL (e.g. `https://<your-project>.vercel.app/api/callback`).
