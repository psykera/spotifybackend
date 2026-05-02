const apiBase = window.location.origin;
const profileKey = 'spotify_pulse_profile_v1';
const tokenKey = 'spotify_token';
const pollIntervalMs = 5000;

const elements = {
  connectBtn: document.getElementById('connectBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  status: document.getElementById('status'),
  dashboard: document.getElementById('dashboard'),
  playbackBadge: document.getElementById('playbackBadge'),
  trackInfo: document.getElementById('trackInfo'),
  asciiArt: document.getElementById('asciiArt'),
  asciiMode: document.getElementById('asciiMode'),
  canvasMode: document.getElementById('canvasMode'),
  signalBpm: document.getElementById('signalBpm'),
  signalEnergy: document.getElementById('signalEnergy'),
  signalMood: document.getElementById('signalMood'),
  signalTransition: document.getElementById('signalTransition'),
  profileSummary: document.getElementById('profileSummary'),
  historyStrip: document.getElementById('historyStrip'),
  userSummary: document.getElementById('userSummary'),
};

const state = {
  accessToken: null,
  user: null,
  snapshot: null,
  profile: loadProfile(),
  timer: null,
  p5Instance: null,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(profileKey);
    if (!raw) {
      return {
        preferred_style: 'minimal',
        avg_bpm: 110,
        energy_bias: 'medium',
        avg_energy: 0.5,
        avg_valence: 0.5,
        samples: 0,
        style_counts: {},
        recent_tracks: [],
        seed: hashString('spotify-pulse-default'),
        last_track_id: null,
        last_sample_at: 0,
      };
    }

    const parsed = JSON.parse(raw);
    return {
      preferred_style: 'minimal',
      avg_bpm: 110,
      energy_bias: 'medium',
      avg_energy: 0.5,
      avg_valence: 0.5,
      samples: 0,
      style_counts: {},
      recent_tracks: [],
      seed: hashString('spotify-pulse-default'),
      last_track_id: null,
      last_sample_at: 0,
      ...parsed,
    };
  } catch {
    return {
      preferred_style: 'minimal',
      avg_bpm: 110,
      energy_bias: 'medium',
      avg_energy: 0.5,
      avg_valence: 0.5,
      samples: 0,
      style_counts: {},
      recent_tracks: [],
      seed: hashString('spotify-pulse-default'),
      last_track_id: null,
      last_sample_at: 0,
    };
  }
}

function saveProfile(profile) {
  state.profile = profile;
  localStorage.setItem(profileKey, JSON.stringify(profile));
}

function setStatus(message) {
  elements.status.textContent = message;
}

function showDashboard(visible) {
  elements.dashboard.classList.toggle('hidden', !visible);
  elements.logoutBtn.classList.toggle('hidden', !visible);
}

function moodLabel(snapshot) {
  return snapshot?.mood || 'idle';
}

function formatArtistNames(track) {
  const artists = track?.artists || [];
  return artists.map((artist) => artist.name).join(' · ') || 'Unknown artist';
}

function getCover(track) {
  return track?.album?.images?.[0]?.url || '';
}

function updateUserSummary(user, profile) {
  if (!user) {
    elements.userSummary.classList.add('hidden');
    elements.userSummary.innerHTML = '';
    return;
  }

  const displayName = user.display_name || user.email || 'Spotify listener';
  elements.userSummary.classList.remove('hidden');
  elements.userSummary.innerHTML = `
    <strong style="color: var(--text)">${displayName}</strong><br />
    ${user.product || 'free'} account · ${profile.samples || 0} learned samples · style ${profile.preferred_style}
  `;
}

function updateSignalFields(snapshot) {
  const signal = snapshot?.signal;
  elements.playbackBadge.textContent = snapshot?.active ? 'Live' : snapshot?.playbackSource === 'recent' ? 'Recent' : 'Idle';
  elements.asciiMode.textContent = snapshot?.visual?.mode || 'minimal';
  elements.canvasMode.textContent = snapshot?.visual?.mode || 'p5.js';
  elements.signalBpm.textContent = signal ? `${signal.bpm}` : '—';
  elements.signalEnergy.textContent = signal ? `${Math.round(signal.energy * 100)}%` : '—';
  elements.signalMood.textContent = snapshot ? moodLabel(snapshot) : '—';
  elements.signalTransition.textContent = signal ? `${Math.round(signal.transition * 100)}%` : '—';
}

function updateTrackCard(snapshot) {
  const track = snapshot?.track;
  if (!track) {
    elements.trackInfo.innerHTML = `
      <div class="track-card">
        <div class="cover"></div>
        <div>
          <div class="track-name">No active track</div>
          <div class="track-meta">Start playing music in Spotify to animate the canvas.</div>
        </div>
      </div>
    `;
    return;
  }

  const progress = snapshot?.signal?.progress ?? 0;
  const sectionIndex = snapshot?.signal?.sectionIndex ?? 0;
  const sectionCount = snapshot?.signal?.sectionCount ?? 0;

  elements.trackInfo.innerHTML = `
    <div class="track-card">
      <div class="cover" style="${getCover(track) ? `background-image:url('${getCover(track)}')` : ''}"></div>
      <div>
        <div class="track-name">${track.name}</div>
        <div class="track-meta">${formatArtistNames(track)}</div>
        <div class="track-submeta">${track.album?.name || 'Unknown album'} · ${snapshot?.features?.tempo ? `${Math.round(snapshot.features.tempo)} BPM` : 'No tempo data'}</div>
        <div class="track-submeta">Progress ${Math.round(progress * 100)}% · Section ${sectionIndex + 1}/${Math.max(1, sectionCount)}</div>
      </div>
    </div>
  `;
}

function charSetForMode(mode) {
  if (mode === 'chaotic') return ['@', '#', '%', '&', '*', '+', '='];
  if (mode === 'waves') return ['~', '≈', '-', '^', '/', '\\', '|'];
  if (mode === 'particles') return ['.', '·', '•', 'o', '◦'];
  if (mode === 'geometric') return ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  return ['.', ':', '-', '=', '*'];
}

function renderAscii(snapshot, profile) {
  if (!snapshot) {
    elements.asciiArt.textContent = 'Connect Spotify to begin.';
    return;
  }

  const width = 60;
  const height = 20;
  const mode = snapshot.visual?.mode || profile.preferred_style || 'minimal';
  const chars = charSetForMode(mode);
  const signal = snapshot.signal || { energy: 0.2, bpm: 100, transition: 0, beatPhase: 0, progress: 0 };
  const seed = hashString(`${snapshot.track?.id || 'idle'}:${profile.seed}:${profile.samples}`);
  const random = seededRandom(seed);
  const density = snapshot.visual?.density ?? 0.3;
  const progressBand = Math.floor(signal.progress * (width - 1));
  const beatColumn = Math.floor(signal.beatPhase * (width - 1));
  const centerRow = Math.floor(height / 2);
  const lines = [];

  for (let row = 0; row < height; row += 1) {
    let line = '';
    for (let col = 0; col < width; col += 1) {
      const wave = Math.sin((col / width) * Math.PI * 2 * (1 + (signal.bpm / 120))) * 0.5 + 0.5;
      const pulse = Math.cos((row / height) * Math.PI * 2 + signal.beatPhase * Math.PI * 2) * 0.5 + 0.5;
      const noise = random();
      const sectionPulse = Math.abs(col - progressBand) < 1 || Math.abs(col - beatColumn) < 1;
      const fill = clamp((wave * 0.3) + (pulse * 0.25) + (noise * 0.35) + density * 0.3 + signal.transition * 0.15, 0, 1);

      if (sectionPulse && row >= centerRow - 2 && row <= centerRow + 2) {
        line += chars[Math.min(chars.length - 1, Math.floor(chars.length * 0.85))];
        continue;
      }

      if (row === centerRow && col % 7 === 0) {
        line += chars[Math.min(chars.length - 1, Math.floor(chars.length * 0.65))];
        continue;
      }

      if (fill > 0.82) {
        line += chars[chars.length - 1];
      } else if (fill > 0.68) {
        line += chars[Math.floor(chars.length * 0.75)];
      } else if (fill > 0.52) {
        line += chars[Math.floor(chars.length * 0.5)];
      } else if (fill > 0.36) {
        line += chars[Math.floor(chars.length * 0.25)];
      } else {
        line += chars[0];
      }
    }
    lines.push(line);
  }

  elements.asciiArt.textContent = lines.join('\n');
}

function renderProfile(profile) {
  elements.profileSummary.innerHTML = `
    <div class="profile-chip">
      <span>Preferred style</span>
      <strong>${profile.preferred_style || 'minimal'}</strong>
    </div>
    <div class="profile-chip">
      <span>Average BPM</span>
      <strong>${Math.round(profile.avg_bpm || 110)}</strong>
    </div>
    <div class="profile-chip">
      <span>Energy bias</span>
      <strong>${profile.energy_bias || 'medium'}</strong>
    </div>
    <div class="profile-chip">
      <span>Samples learned</span>
      <strong>${profile.samples || 0}</strong>
    </div>
  `;

  const recentTracks = (profile.recent_tracks || []).slice(0, 8);
  elements.historyStrip.innerHTML = recentTracks.length
    ? recentTracks.map((item) => `<div class="history-pill">${item.name} · ${item.mood || 'mixed'}</div>`).join('')
    : '<div class="history-pill">Your listening memory will appear here after a few tracks.</div>';
}

function deriveStyle(signal) {
  if (signal.energy < 0.34) return 'minimal';
  if (signal.energy > 0.74 || signal.bpm > 135) return 'chaotic';
  if (signal.transition > 0.6) return 'waves';
  if (signal.valence < 0.38) return 'particles';
  return 'geometric';
}

function updateLearning(snapshot) {
  if (!snapshot?.track?.id || !snapshot.signal) {
    return state.profile;
  }

  const now = Date.now();
  const sameTrack = state.profile.last_track_id === snapshot.track.id;
  const recentlyRecorded = now - (state.profile.last_sample_at || 0) < 120000;
  if (sameTrack && recentlyRecorded) {
    return state.profile;
  }

  const samples = state.profile.samples || 0;
  const nextSamples = samples + 1;
  const bpm = snapshot.signal.bpm || state.profile.avg_bpm || 110;
  const energy = snapshot.signal.energy ?? state.profile.avg_energy ?? 0.5;
  const valence = snapshot.signal.valence ?? state.profile.avg_valence ?? 0.5;
  const style = deriveStyle(snapshot.signal);
  const styleCounts = { ...(state.profile.style_counts || {}) };
  styleCounts[style] = (styleCounts[style] || 0) + 1;
  const preferredStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || style;

  const updatedProfile = {
    ...state.profile,
    preferred_style: preferredStyle,
    avg_bpm: round(((state.profile.avg_bpm || bpm) * samples + bpm) / nextSamples, 1),
    avg_energy: round(((state.profile.avg_energy ?? 0.5) * samples + energy) / nextSamples, 3),
    avg_valence: round(((state.profile.avg_valence ?? 0.5) * samples + valence) / nextSamples, 3),
    energy_bias: energy < 0.4 ? 'low' : energy > 0.66 ? 'high' : 'medium',
    samples: nextSamples,
    style_counts: styleCounts,
    recent_tracks: [
      {
        id: snapshot.track.id,
        name: snapshot.track.name,
        mood: snapshot.mood,
        bpm,
      },
      ...(state.profile.recent_tracks || []).filter((item) => item.id !== snapshot.track.id),
    ].slice(0, 10),
    seed: state.profile.seed || hashString(snapshot.user?.id || snapshot.track.id || 'spotify-pulse'),
    last_track_id: snapshot.track.id,
    last_sample_at: now,
  };

  saveProfile(updatedProfile);
  return updatedProfile;
}

function updateP5Snapshot(snapshot, profile) {
  window.__spotifyArtState = {
    snapshot,
    profile,
    palette: snapshot?.visual?.palette || ['#1db954', '#4cc9f0', '#f72585', '#eef4fb'],
    mode: snapshot?.visual?.mode || profile.preferred_style || 'minimal',
  };
}

function fetchJson(url) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
    },
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }

    return response.json();
  });
}

async function loadUser() {
  const user = await fetchJson(`${apiBase}/api/me`);
  state.user = user;
  updateUserSummary(user, state.profile);
}

async function refreshListeningState() {
  const snapshot = await fetchJson(`${apiBase}/api/listening-state`);
  state.snapshot = snapshot;
  state.profile = updateLearning(snapshot);

  showDashboard(true);
  updateSignalFields(snapshot);
  updateTrackCard(snapshot);
  renderAscii(snapshot, state.profile);
  renderProfile(state.profile);
  updateUserSummary(state.user, state.profile);
  updateP5Snapshot(snapshot, state.profile);

  const label = snapshot.active ? 'Playing live from Spotify.' : snapshot.playbackSource === 'recent' ? 'Using your most recent listen.' : 'Waiting for playback.';
  setStatus(`${label} BPM ${snapshot.signal?.bpm ?? '—'} · energy ${snapshot.signal ? Math.round(snapshot.signal.energy * 100) : '—'}% · mood ${snapshot.mood || 'idle'}.`);
}

function extractTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    sessionStorage.setItem(tokenKey, token);
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  return sessionStorage.getItem(tokenKey);
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const number = Number.parseInt(value, 16);
  return [
    (number >> 16) & 255,
    (number >> 8) & 255,
    number & 255,
  ];
}

function ensureP5() {
  if (!window.p5 || state.p5Instance || !document.getElementById('p5Mount')) {
    return;
  }

  state.p5Instance = new window.p5((p) => {
    let particles = [];

    function resize() {
      const mount = document.getElementById('p5Mount');
      const width = mount?.clientWidth || 300;
      const height = Math.max(320, Math.round(width * 0.72));
      p.resizeCanvas(width, height);
    }

    function resetParticles(count) {
      particles = [];
      for (let index = 0; index < count; index += 1) {
        particles.push({
          x: p.random(p.width),
          y: p.random(p.height),
          vx: p.random(-1, 1),
          vy: p.random(-1, 1),
          size: p.random(2, 8),
          hueOffset: p.random(1),
        });
      }
    }

    p.setup = () => {
      const mount = document.getElementById('p5Mount');
      const width = mount?.clientWidth || 300;
      const height = Math.max(320, Math.round(width * 0.72));
      p.createCanvas(width, height);
      p.colorMode(p.RGB, 255, 255, 255, 255);
      p.noiseDetail(3, 0.5);
      resetParticles(80);
    };

    p.windowResized = () => resize();

    p.draw = () => {
      const live = window.__spotifyArtState || {};
      const snapshot = live.snapshot;
      const profile = live.profile || state.profile;
      const palette = live.palette || ['#1db954', '#4cc9f0', '#f72585', '#eef4fb'];
      const signal = snapshot?.signal || { energy: 0.15, bpm: 100, transition: 0, beatPhase: 0, intensity: 0.2 };
      const mode = live.mode || profile.preferred_style || 'minimal';
      const energy = signal.energy ?? 0.2;
      const bpm = signal.bpm || 100;
      const transition = signal.transition ?? 0;
      const intensity = signal.intensity ?? 0.3;

      p.background(6, 12, 22, 24);
      p.noFill();

      if (mode === 'waves') {
        const waveCount = 5 + Math.floor(energy * 7);
        for (let wave = 0; wave < waveCount; wave += 1) {
          const y = p.height * ((wave + 1) / (waveCount + 1));
          p.stroke(...hexToRgb(palette[wave % palette.length]), 210);
          p.strokeWeight(1.5 + (wave % 3) * 0.35);
          p.beginShape();
          for (let x = 0; x <= p.width; x += 16) {
            const wobble = p.sin((x * 0.015) + (p.frameCount * 0.035) + wave) * (18 + transition * 42);
            p.curveVertex(x, y + wobble * (0.2 + energy));
          }
          p.endShape();
        }
      } else if (mode === 'chaotic') {
        const count = 80 + Math.floor(energy * 120);
        for (let index = 0; index < count; index += 1) {
          const angle = (index / count) * p.TWO_PI * (1 + intensity * 2.2) + p.frameCount * 0.005;
          const radius = p.map(index, 0, count, 20, Math.min(p.width, p.height) * 0.55) + p.sin(p.frameCount * 0.02 + index) * 22;
          const x = p.width / 2 + p.cos(angle) * radius;
          const y = p.height / 2 + p.sin(angle) * radius;
          p.stroke(...hexToRgb(palette[index % palette.length]), 190);
          p.line(p.width / 2, p.height / 2, x, y);
        }
      } else if (mode === 'particles') {
        p.noStroke();
        for (const particle of particles) {
          particle.x = (particle.x + particle.vx * (1 + energy * 3) + p.width) % p.width;
          particle.y = (particle.y + particle.vy * (1 + energy * 3) + p.height) % p.height;
          const size = particle.size + transition * 8;
          const alpha = 120 + particle.hueOffset * 120;
          p.fill(...hexToRgb(palette[Math.floor(particle.hueOffset * palette.length)]), alpha);
          p.circle(particle.x, particle.y, size);
        }
      } else {
        const spokes = 6 + Math.floor(energy * 10);
        p.translate(p.width / 2, p.height / 2);
        for (let spoke = 0; spoke < spokes; spoke += 1) {
          const angle = (spoke / spokes) * p.TWO_PI + p.frameCount * 0.003;
          const length = p.map(p.noise(spoke * 0.2, p.frameCount * 0.01), 0, 1, 60, Math.max(p.width, p.height) * 0.42 + intensity * 120);
          p.stroke(...hexToRgb(palette[spoke % palette.length]), 180);
          p.strokeWeight(1.5 + (spoke % 4) * 0.45);
          p.line(0, 0, p.cos(angle) * length, p.sin(angle) * length);
        }

        p.stroke(...hexToRgb(palette[0]), 90);
        p.circle(0, 0, 80 + energy * 180 + (bpm / 2));
      }

      if (snapshot) {
        p.noFill();
        p.stroke(...hexToRgb(palette[palette.length - 1]), 80 + transition * 120);
        p.strokeWeight(1.2);
        p.rect(12, 12, p.width - 24, p.height - 24, 18);
      }

      if (particles.length < 1) {
        resetParticles(80);
      }
    };
  }, 'p5Mount');

  window.addEventListener('resize', () => {
    if (state.p5Instance && typeof state.p5Instance.windowResized === 'function') {
      state.p5Instance.windowResized();
    }
  });
}

async function loadUser() {
  const user = await fetchJson(`${apiBase}/api/me`);
  state.user = user;
  updateUserSummary(user, state.profile);
}

async function refreshListeningState() {
  const snapshot = await fetchJson(`${apiBase}/api/listening-state`);
  state.snapshot = snapshot;
  state.profile = updateLearning(snapshot);

  showDashboard(true);
  updateSignalFields(snapshot);
  updateTrackCard(snapshot);
  renderAscii(snapshot, state.profile);
  renderProfile(state.profile);
  updateUserSummary(state.user, state.profile);
  updateP5Snapshot(snapshot, state.profile);

  const label = snapshot.active ? 'Playing live from Spotify.' : snapshot.playbackSource === 'recent' ? 'Using your most recent listen.' : 'Waiting for playback.';
  setStatus(`${label} BPM ${snapshot.signal?.bpm ?? '—'} · energy ${snapshot.signal ? Math.round(snapshot.signal.energy * 100) : '—'}% · mood ${snapshot.mood || 'idle'}.`);
}

function updateP5Snapshot(snapshot, profile) {
  window.__spotifyArtState = {
    snapshot,
    profile,
    palette: snapshot?.visual?.palette || ['#1db954', '#4cc9f0', '#f72585', '#eef4fb'],
    mode: snapshot?.visual?.mode || profile.preferred_style || 'minimal',
  };
}

function fetchJson(url) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
    },
  }).then(async (response) => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${errorText}`);
    }

    return response.json();
  });
}

function extractTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    sessionStorage.setItem(tokenKey, token);
    window.history.replaceState({}, document.title, window.location.pathname);
    return token;
  }
  return sessionStorage.getItem(tokenKey);
}

async function bootstrap() {
  state.accessToken = extractTokenFromUrl();

  if (!state.accessToken) {
    showDashboard(false);
    setStatus('Ready to connect with Spotify.');
    ensureP5();
    renderProfile(state.profile);
    return;
  }

  showDashboard(true);
  ensureP5();

  try {
    await loadUser();
    await refreshListeningState();
    if (state.timer) {
      clearInterval(state.timer);
    }
    state.timer = setInterval(() => {
      refreshListeningState().catch((error) => {
        console.error(error);
        setStatus('Playback is connected, but the live analysis momentarily failed.');
      });
    }, pollIntervalMs);
  } catch (error) {
    console.error(error);
    setStatus('Connected, but the Spotify analysis endpoints could not be reached.');
  }
}

function logout() {
  sessionStorage.removeItem(tokenKey);
  state.accessToken = null;
  state.user = null;
  state.snapshot = null;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  showDashboard(false);
  setStatus('Logged out. Ready to connect again.');
  elements.trackInfo.innerHTML = '';
  elements.asciiArt.textContent = 'Connect Spotify to begin.';
  elements.profileSummary.innerHTML = '';
  elements.historyStrip.innerHTML = '';
  updateUserSummary(null, state.profile);
}

elements.connectBtn.addEventListener('click', () => {
  window.location.href = `${apiBase}/api/login`;
});

elements.logoutBtn.addEventListener('click', logout);

bootstrap();