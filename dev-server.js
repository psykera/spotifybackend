const http = require('http');
const fs = require('fs');
const { URL } = require('url');

function loadDotEnv() {
  const p = './.env';
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

// Debug: print whether env vars are present (masked)
console.log('ENV loaded:', {
  SPOTIFY_CLIENT_ID: !!process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI: !!process.env.SPOTIFY_REDIRECT_URI,
  SPOTIFY_CLIENT_SECRET: !!process.env.SPOTIFY_CLIENT_SECRET,
});

const PORT = process.env.PORT || 3000;

function loginHandler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const scope = 'user-read-private user-read-email playlist-read-private user-read-recently-played';

  if (!clientId || !redirectUri) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing Spotify client configuration' }));
    return;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  res.writeHead(302, { Location: authUrl });
  res.end();
}

async function callbackHandler(req, res, urlObj) {
  const code = urlObj.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing code in callback request' }));
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing Spotify client configuration' }));
    return;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', redirectUri);

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      res.writeHead(tokenRes.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: data }));
      return;
    }

    // For local testing return the token as JSON instead of redirecting.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ access_token: data.access_token, raw: data }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Token exchange failed' }));
  }
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && urlObj.pathname === '/api/login') {
    loginHandler(req, res);
    return;
  }

  if (req.method === 'GET' && urlObj.pathname === '/api/callback') {
    await callbackHandler(req, res, urlObj);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Dev server listening on http://localhost:${PORT}`);
});
