const SPOTIFY_API = 'https://api.spotify.com/v1';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summarizeTrack(track) {
  if (!track) return null;

  return {
    id: track.id,
    name: track.name,
    uri: track.uri,
    duration_ms: track.duration_ms,
    popularity: track.popularity,
    explicit: track.explicit,
    artists: (track.artists || []).map((artist) => ({
      id: artist.id,
      name: artist.name,
    })),
    album: track.album
      ? {
          id: track.album.id,
          name: track.album.name,
          images: track.album.images || [],
        }
      : null,
  };
}

function summarizeAnalysis(analysis) {
  if (!analysis) {
    return { sections: [], beats: [], bars: [], tatums: [] };
  }

  const summarizePoints = (points, limit) =>
    (points || []).slice(0, limit).map((point) => ({
      start: round(point.start ?? 0, 3),
      duration: round(point.duration ?? 0, 3),
      confidence: round(point.confidence ?? 0, 3),
      loudness: round(point.loudness ?? 0, 3),
      tempo: round(point.tempo ?? 0, 3),
      key: point.key,
      mode: point.mode,
    }));

  return {
    bars: summarizePoints(analysis.bars, 24),
    beats: summarizePoints(analysis.beats, 96),
    tatums: summarizePoints(analysis.tatums, 96),
    sections: summarizePoints(analysis.sections, 16),
  };
}

function chooseMood(features, currentSection) {
  const energy = features.energy ?? 0.5;
  const valence = features.valence ?? 0.5;
  const tempo = features.tempo ?? 110;
  const loudness = currentSection?.loudness ?? features.loudness ?? -12;

  if (energy < 0.3 && valence < 0.4) return 'calm';
  if (tempo >= 135 || energy >= 0.8 || loudness > -5) return 'intense';
  if (valence >= 0.65) return 'uplifting';
  if (valence <= 0.35) return 'moody';
  return 'balanced';
}

function chooseVisualMode(signal, mood) {
  if (signal.energy < 0.28) return 'minimal';
  if (signal.energy > 0.78 || signal.bpm > 135) return 'chaotic';
  if (signal.transition > 0.6 || mood === 'uplifting') return 'waves';
  if (signal.valence < 0.35) return 'particles';
  return 'geometric';
}

function choosePalette(mood, signal) {
  if (mood === 'calm') return ['#cfd8e3', '#7ea9cf', '#30455f', '#111827'];
  if (mood === 'uplifting') return ['#6ee7b7', '#22c55e', '#f59e0b', '#f8fafc'];
  if (mood === 'intense') return ['#ff4d6d', '#ffb703', '#fb5607', '#261447'];
  if (signal.valence < 0.35) return ['#8b5cf6', '#4c1d95', '#1e293b', '#f8fafc'];
  return ['#1db954', '#1ed760', '#60a5fa', '#f8fafc'];
}

function buildSignal(features, analysis, progressMs, durationMs) {
  const bpm = Math.round(features.tempo ?? 0);
  const energy = features.energy ?? 0.5;
  const valence = features.valence ?? 0.5;
  const danceability = features.danceability ?? 0.5;
  const durationSeconds = Math.max(1, (durationMs || 1) / 1000);
  const progressSeconds = Math.max(0, (progressMs || 0) / 1000);
  const progress = clamp(progressSeconds / durationSeconds, 0, 1);

  const sections = analysis?.sections || [];
  const sectionIndex = sections.reduce((index, section, currentIndex) => (
    section.start <= progressSeconds ? currentIndex : index
  ), -1);
  const currentSection = sectionIndex >= 0 ? sections[sectionIndex] : null;
  const nextSection = sectionIndex >= 0 ? sections[sectionIndex + 1] : null;
  const transition = nextSection
    ? clamp(1 - ((nextSection.start - progressSeconds) / 4), 0, 1)
    : 0;

  const beatInterval = bpm > 0 ? 60 / bpm : 0.5;
  const beatPhase = clamp((progressSeconds % beatInterval) / beatInterval, 0, 1);
  const intensity = clamp((energy * 0.6) + ((bpm / 160) * 0.25) + (transition * 0.15), 0, 1);

  return {
    bpm,
    energy: round(energy),
    valence: round(valence),
    danceability: round(danceability),
    progress: round(progress),
    progress_ms: Math.round(progressMs || 0),
    transition: round(transition),
    beatPhase: round(beatPhase),
    intensity: round(intensity),
    sectionIndex: Math.max(0, sectionIndex),
    sectionCount: sections.length,
    currentSection: currentSection
      ? {
          start: currentSection.start,
          duration: currentSection.duration,
          loudness: currentSection.loudness,
          tempo: currentSection.tempo,
          key: currentSection.key,
          mode: currentSection.mode,
        }
      : null,
  };
}

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Missing access token' });
    return;
  }

  try {
    const currentRes = await fetch(`${SPOTIFY_API}/me/player/currently-playing?additional_types=track`, {
      headers: authHeaders(token),
    });

    let currentPlayback = null;
    let playbackSource = 'none';

    if (currentRes.status === 200) {
      currentPlayback = await currentRes.json();
      playbackSource = 'current';
    } else if (currentRes.status !== 204) {
      const errorText = await currentRes.text();
      res.status(currentRes.status || 500).json({ error: errorText || 'Failed to fetch playback state' });
      return;
    }

    let track = currentPlayback?.item || null;
    let isPlaying = currentPlayback?.is_playing ?? false;
    let progressMs = currentPlayback?.progress_ms ?? 0;

    if (!track?.id) {
      const recentRes = await fetch(`${SPOTIFY_API}/me/player/recently-played?limit=1`, {
        headers: authHeaders(token),
      });

      if (!recentRes.ok) {
        const errorText = await recentRes.text();
        res.status(recentRes.status || 500).json({ error: errorText || 'Failed to fetch recent playback' });
        return;
      }

      const recentData = await recentRes.json();
      track = recentData.items?.[0]?.track || null;
      playbackSource = track ? 'recent' : 'none';
      isPlaying = false;
      progressMs = 0;
    }

    if (!track?.id) {
      res.status(200).json({
        active: false,
        playbackSource,
        track: null,
        features: null,
        analysis: { sections: [], beats: [], bars: [], tatums: [] },
        signal: null,
        mood: 'idle',
        visual: {
          mode: 'minimal',
          palette: ['#1db954', '#0f172a', '#94a3b8', '#e2e8f0'],
          density: 0.15,
          motion: 0.1,
        },
        fetchedAt: new Date().toISOString(),
      });
      return;
    }

    const [featuresRes, analysisRes] = await Promise.all([
      fetch(`${SPOTIFY_API}/audio-features/${track.id}`, { headers: authHeaders(token) }),
      fetch(`${SPOTIFY_API}/audio-analysis/${track.id}`, { headers: authHeaders(token) }),
    ]);

    const features = featuresRes.ok ? await featuresRes.json() : {};
    const analysis = analysisRes.ok ? await analysisRes.json() : {};
    const summarizedAnalysis = summarizeAnalysis(analysis);
    const signal = buildSignal(features, summarizedAnalysis, progressMs, track.duration_ms);
    const mood = chooseMood(features, signal.currentSection);
    const visualMode = chooseVisualMode(signal, mood);

    res.status(200).json({
      active: isPlaying,
      playbackSource,
      track: summarizeTrack(track),
      features: {
        tempo: round(features.tempo ?? 0, 2),
        energy: round(features.energy ?? 0, 3),
        valence: round(features.valence ?? 0, 3),
        danceability: round(features.danceability ?? 0, 3),
        acousticness: round(features.acousticness ?? 0, 3),
        instrumentalness: round(features.instrumentalness ?? 0, 3),
        liveness: round(features.liveness ?? 0, 3),
        loudness: round(features.loudness ?? 0, 3),
        speechiness: round(features.speechiness ?? 0, 3),
        key: features.key,
        mode: features.mode,
        time_signature: features.time_signature,
      },
      analysis: summarizedAnalysis,
      signal,
      mood,
      visual: {
        mode: visualMode,
        palette: choosePalette(mood, signal),
        density: round(clamp(0.2 + (signal.energy * 0.55) + (signal.transition * 0.15), 0.12, 0.98), 3),
        motion: round(clamp(0.15 + (signal.intensity * 0.8), 0.1, 1), 3),
        pulse: round(clamp(signal.bpm / 180, 0.15, 1), 3),
      },
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to build listening state',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}