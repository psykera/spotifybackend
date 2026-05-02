export default function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const scope = 'user-read-private user-read-email';

  if (!clientId || !redirectUri) {
    res.status(500).json({ error: 'Missing Spotify client configuration' });
    return;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  if (typeof res.redirect === 'function') {
    res.redirect(authUrl);
  } else {
    res.writeHead(302, { Location: authUrl });
    res.end();
  }
}
