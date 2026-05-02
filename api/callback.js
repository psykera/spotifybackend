export default async function handler(req, res) {
  const code = (req.query && req.query.code) || (req.url && new URL(req.url, 'http://localhost').searchParams.get('code'));

  if (!code) {
    res.status(400).json({ error: 'Missing code in callback request' });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.status(500).json({ error: 'Missing Spotify client configuration' });
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
      res.status(tokenRes.status || 500).json({ error: data });
      return;
    }

    const accessToken = data.access_token;
    if (!accessToken) {
      res.status(500).json({ error: 'No access token returned' });
      return;
    }

    const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
    const appOrigin = `${forwardedProto}://${forwardedHost}`;
    const redirectTo = `${appOrigin}/?token=${encodeURIComponent(accessToken)}`;
    if (typeof res.redirect === 'function') {
      res.redirect(redirectTo);
    } else {
      res.writeHead(302, { Location: redirectTo });
      res.end();
    }
  } catch (err) {
    res.status(500).json({ error: 'Token exchange failed' });
  }
}
