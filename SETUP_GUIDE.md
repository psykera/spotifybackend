# Spotify Playlist Viewer

A web application that allows users to login with Spotify OAuth and view their playlists, recent artists, and account information.

## Features

- 🎵 **Spotify OAuth Login**: Secure authentication with Spotify
- 📋 **View Playlists**: See all your playlists with track counts and privacy status
- 🎤 **Recent Artists**: Discover the artists from your recently played tracks
- 👤 **User Profile**: View your Spotify account details (name, email, account type, followers)
- 💾 **Session Management**: Automatic token management using sessionStorage
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices

## Prerequisites

- Node.js 24.x or higher
- A Spotify Developer account with registered application

## Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in or create an account
3. Create a new app and accept the terms
4. You'll receive:
   - **Client ID**
   - **Client Secret**

### 2. Configure Redirect URI

In your Spotify app settings, add a redirect URI:
- For local development: `http://localhost:3000/api/callback`
- For production: `https://yourdomain.com/api/callback`

### 3. Set Environment Variables

Create a `.env` file in the project root:

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/callback
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start the Server

**For local development:**
```bash
npm run dev
```

**For production:**
```bash
npm start
```

Visit `http://localhost:3000` and click "Connect with Spotify" to get started.

## API Endpoints

### `/api/login`
Redirects user to Spotify's authorization page.

**Response**: 302 redirect to Spotify authorization

### `/api/callback`
Handles the OAuth callback and exchanges authorization code for access token.

**Query Parameters**:
- `code`: Authorization code from Spotify
- `error` (optional): Error message if authorization failed

**Response**: 302 redirect to home page with token in query parameter

### `/api/me`
Fetches the current user's profile information.

**Headers**:
- `Authorization: Bearer {access_token}`

**Response**:
```json
{
  "display_name": "User Name",
  "email": "user@example.com",
  "product": "premium",
  "followers": { "total": 100 },
  ...
}
```

### `/api/playlists`
Fetches user's playlists.

**Headers**:
- `Authorization: Bearer {access_token}`

**Response**:
```json
{
  "items": [
    {
      "name": "Playlist Name",
      "public": true,
      "tracks": { "total": 50 },
      ...
    }
  ],
  "total": 5,
  ...
}
```

### `/api/recently-played`
Fetches recently played tracks.

**Headers**:
- `Authorization: Bearer {access_token}`

**Response**:
```json
{
  "items": [
    {
      "track": {
        "name": "Track Name",
        "artists": [{ "name": "Artist Name" }],
        ...
      },
      ...
    }
  ],
  ...
}
```

## Project Structure

```
spotifybackend/
├── index.html              # Frontend UI
├── dev-server.js           # Local development server
├── package.json            # Project dependencies
├── .env                    # Environment variables (not in git)
├── vercel.json             # Vercel configuration
├── README.md               # This file
└── api/
    ├── login.js            # OAuth login handler
    ├── callback.js         # OAuth callback handler
    ├── me.js              # Get user profile
    ├── playlists.js       # Get user playlists
    └── recently-played.js # Get recently played tracks
```

## OAuth Flow

1. User clicks "Connect with Spotify"
2. User is redirected to `/api/login`
3. App redirects to Spotify authorization page
4. User authorizes the app
5. Spotify redirects to `/api/callback` with authorization code
6. Backend exchanges code for access token
7. Access token is returned in URL query parameter
8. Frontend stores token in sessionStorage
9. App fetches user data using the token

## Security Notes

- Access tokens are stored in `sessionStorage` and cleared when the page is closed
- The token is passed in URL only temporarily and immediately stored in sessionStorage
- Never expose `SPOTIFY_CLIENT_SECRET` in frontend code
- Use HTTPS in production
- Implement token refresh logic for long-lived sessions if needed

## Spotify API Scopes

The app requests the following scopes:
- `user-read-private`: Access user's private info
- `user-read-email`: Access user's email address
- `playlist-read-private`: Access private playlists
- `user-read-recently-played`: Access recently played tracks

## Troubleshooting

### "Missing code in callback request"
- Ensure the redirect URI in `.env` matches exactly with what's set in Spotify Dashboard
- Check browser console for errors

### "No playlists found"
- User may not have any playlists created
- Check Spotify account permissions
- Make sure `playlist-read-private` scope is authorized

### "401 Unauthorized"
- Access token may have expired
- Clear sessionStorage and login again
- Check if token is being sent in Authorization header correctly

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel settings:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (update with Vercel domain)
4. Deploy

The `vercel.json` file configures API routes automatically.

### Local Development

```bash
npm run dev
```

Then visit `http://localhost:3000`

## Files Overview

### Frontend (`index.html`)
- Beautiful dark-themed Spotify UI
- OAuth login button
- Dashboard showing playlists, artists, and account info
- Session management with logout

### API Handlers (`api/`)
- **login.js**: Initiates OAuth flow by redirecting to Spotify
- **callback.js**: Exchanges authorization code for access token
- **me.js**: Fetches user profile information
- **playlists.js**: Fetches all user playlists
- **recently-played.js**: Fetches recently played tracks

### Development Server (`dev-server.js`)
- Local HTTP server for testing
- Loads environment variables from `.env`
- Routes requests to API handlers
