'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { DatabaseSync } = require('node:sqlite');

let Resvg;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch {
  console.warn('[og-image] @resvg/resvg-js not available — /og-image.png disabled');
}

const PORT        = process.env.PORT || 4001;
const LASTFM_KEY  = process.env.LASTFM_API_KEY || '';
const LASTFM_USER = 'mvrkws';
const POLL_MS     = 60 * 1000; // 1 minute
const SITE_URL    = 'https://markescence.msge.no';

// ── Site created/modified dates derived from git history ────────────────────
// Written by scripts/generate-page-dates.sh (pure git + POSIX sh), run by
// `make deploy`/`make build` on the checkout — `.git` isn't in the Docker
// build context, so the container can only ever see the generated file.
// Absent file (e.g. a bare `docker build`/`docker compose build` that skipped
// the Makefile hook) ⇒ falls back to boot time. Site-level, single page: same
// pattern as msge-no (ADR 0004) and hetzner-server (ADR 0015).
const ISO_NOW = new Date().toISOString();
const PAGE_DATES = (() => {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'page-dates.json'), 'utf8'));
    return { created: d.created || ISO_NOW, modified: d.modified || ISO_NOW };
  } catch {
    return { created: ISO_NOW, modified: ISO_NOW };
  }
})();

function stampDates(text) {
  return text
    .replace(/__PAGE_CREATED_ISO__/g, PAGE_DATES.created)
    .replace(/__PAGE_MODIFIED_ISO__/g, PAGE_DATES.modified);
}

// Stamped once at boot and served from memory so the placeholders never ship
// raw; index.html's live counts come from client-side /api/counts fetches, so
// the markup itself is static and a git-derived Last-Modified stays truthful.
const indexHtml  = stampDates(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'));
const sitemapXml = stampDates(fs.readFileSync(path.join(__dirname, 'sitemap.xml'), 'utf8'));

// ── Tracks ────────────────────────────────────────────────────────────────────
// Mirrors the TRACKS array in index.html — server adds color + releaseDate
// so the OG image generator can use them without duplication.

const TRACKS = [
  // Pre-release singles
  { id: 'my-regards',                 artist: 'Maisie Peters', track: 'My Regards',                          display: 'My Regards',                      color: '#c4622d', releaseDate: '2026-02-06' },
  { id: 'audrey-hepburn',             artist: 'Maisie Peters', track: 'Audrey Hepburn',                      display: 'Audrey Hepburn',                  color: '#9b7e2a', releaseDate: '2025-10-09' },
  { id: 'you-you-you',                artist: 'Maisie Peters', track: 'You You You',                         display: 'You You You',                     color: '#4a9e7a', releaseDate: '2025-10-09' },
  { id: 'say-my-name',                artist: 'Maisie Peters', track: 'Say My Name In Your Sleep',           display: 'Say My Name In Your Sleep',       color: '#3a7fa8', releaseDate: '2025-11-19' },
  { id: 'kingmaker',                  artist: 'Maisie Peters', track: 'Kingmaker (with Julia Michaels)',      display: 'Kingmaker',                       color: '#8a6e9a', releaseDate: '2026-03-01', altArtist: 'Julia Michaels' },
  // Album-only tracks
  // altTrack covers the stylised alternating-case names submitted by some scrobblers
  // (e.g. "MaRy JaNeS") which Last.fm stores as a separate entry from the proper title.
  // "Girl's Just Flying" also uses a curly apostrophe (U+2019) in the stylised form.
  { id: 'mary-janes',                 artist: 'Maisie Peters', track: 'Mary Janes',                          altTrack: 'MaRy JaNeS',                                    display: 'Mary Janes',                      color: '#d4564e', releaseDate: '2026-05-22' },
  { id: 'old-fashioned',              artist: 'Maisie Peters', track: 'Old Fashioned',                       altTrack: 'OlD fAsHiOnEd',                                 display: 'Old Fashioned',                   color: '#c49050', releaseDate: '2026-05-22' },
  { id: 'houses',                     artist: 'Maisie Peters', track: 'Houses',                              altTrack: 'hOuSeS',                                        display: 'Houses',                          color: '#2d9e8a', releaseDate: '2026-05-22' },
  { id: 'vampire-time',               artist: 'Maisie Peters', track: 'Vampire Time',                                                                                   display: 'Vampire Time',                    color: '#6e4eb0', releaseDate: '2026-05-22' },
  { id: 'if-you-let-me',              artist: 'Maisie Peters', track: 'If You Let Me (with Marcus Mumford)', altTrack: 'iF yOu LeT mE (wItH mArCuS mUmFoRd)',           display: 'If You Let Me',                   color: '#4e88c4', releaseDate: '2026-05-22', altArtist: 'Marcus Mumford' },
  { id: 'flat-earther',               artist: 'Maisie Peters', track: 'Flat Earther',                        altTrack: 'FlAt EaRtHeR',                                  display: 'Flat Earther',                    color: '#9e2d4e', releaseDate: '2026-05-22' },
  { id: 'questions',                  artist: 'Maisie Peters', track: 'Questions',                           altTrack: 'qUeStIoNs',                                     display: 'Questions',                       color: '#7a9e4e', releaseDate: '2026-05-22' },
  { id: 'girls-just-flying',          artist: 'Maisie Peters', track: "Girl's Just Flying",                  altTrack: 'GiRl’S jUsT fLyInG',                       display: "Girl's Just Flying",              color: '#c46e9e', releaseDate: '2026-05-22' },
  { id: 'you-then-me-now',            artist: 'Maisie Peters', track: 'You Then Me Now',                     altTrack: 'yOu ThEn Me NoW',                               display: 'You Then Me Now',                 color: '#8a9e5a', releaseDate: '2026-05-22' },
  { id: 'nothing-like-being-in-love', artist: 'Maisie Peters', track: 'Nothing Like Being In Love',          altTrack: 'nOtHiNg LiKe BeInG iN lOvE',                   display: 'Nothing Like Being In Love',      color: '#4e7a9e', releaseDate: '2026-05-22' },
];

// ── OG Image ──────────────────────────────────────────────────────────────────

// Cache the generated PNG for 5 minutes so we don't re-render on every crawl.
const ogCache = { png: null, builtAt: 0 };
const OG_CACHE_MS = 5 * 60 * 1000;

function buildOgSvg(counts) {
  const W = 1200, H = 630;
  const today = new Date().toISOString().slice(0, 10);

  // Active tracks, sorted by play count descending; cap at 12 so bars stay legible.
  const active = TRACKS
    .filter(t => t.releaseDate <= today)
    .map(t => ({ ...t, plays: counts[t.id] || 0 }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 12);

  const allActive = TRACKS.filter(t => t.releaseDate <= today);
  const totalPlays = allActive.reduce((s, t) => s + (counts[t.id] || 0), 0);
  const leader = active[0];
  const maxPlays = Math.max(...active.map(t => t.plays), 1);

  // Right panel geometry
  const DIV_X     = 510;
  const CHART_L   = DIV_X + 30;
  const LABEL_W   = 150;    // track-name column
  const BAR_X     = CHART_L + LABEL_W + 8;
  const BAR_MAX_W = W - BAR_X - 80;  // leave room for play count text
  const BAR_H     = 28;
  const BAR_GAP   = 12;
  const CHART_TOP = 72;

  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const bars = active.map((t, i) => {
    const y  = CHART_TOP + i * (BAR_H + BAR_GAP);
    const bw = Math.max(3, Math.round((t.plays / maxPlays) * BAR_MAX_W));
    const label = t.display.length > 21 ? t.display.slice(0, 20) + '…' : t.display;
    return `
  <text x="${CHART_L + LABEL_W}" y="${y + BAR_H * 0.72}"
        font-family="'Courier New',Courier,monospace" font-size="11.5" fill="#8a7e6e"
        text-anchor="end">${esc(label)}</text>
  <rect x="${BAR_X}" y="${y + 5}" width="${bw}" height="${BAR_H - 10}"
        fill="${t.color}" rx="2" opacity="0.88"/>
  <text x="${BAR_X + bw + 7}" y="${y + BAR_H * 0.72}"
        font-family="'Courier New',Courier,monospace" font-size="11" fill="${t.color}">${t.plays}</text>`;
  }).join('');

  const totalFmt = totalPlays.toLocaleString('en');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- background -->
  <rect width="${W}" height="${H}" fill="#f5f0e8"/>
  <!-- top rust accent -->
  <rect width="${W}" height="5" fill="#c4622d" opacity="0.7"/>
  <!-- divider -->
  <line x1="${DIV_X}" y1="45" x2="${DIV_X}" y2="${H - 45}" stroke="#1a1208" stroke-opacity="0.1" stroke-width="1"/>

  <!-- ── LEFT PANEL ── -->
  <text x="58" y="92"
        font-family="'Courier New',Courier,monospace" font-size="11" fill="#8a7e6e"
        letter-spacing="3">MVRKWS · LAST.FM</text>

  <text x="55" y="208"
        font-family="Georgia,'Times New Roman',serif" font-size="76" fill="#1a1208">Marks of</text>
  <text x="55" y="292"
        font-family="Georgia,'Times New Roman',serif" font-size="76" fill="#c4622d"
        font-style="italic">Florescence</text>
  <text x="58" y="325"
        font-family="'Courier New',Courier,monospace" font-size="11" fill="#8a7e6e"
        letter-spacing="2">CUMULATIVE SCROBBLES</text>
  <text x="58" y="341"
        font-family="'Courier New',Courier,monospace" font-size="11" fill="#8a7e6e"
        letter-spacing="2">MAISIE PETERS</text>

  <!-- thin rule -->
  <line x1="58" y1="362" x2="${DIV_X - 40}" y2="362" stroke="#8a7e6e" stroke-opacity="0.3" stroke-width="1"/>

  <!-- total plays stat -->
  <text x="58" y="432"
        font-family="Georgia,'Times New Roman',serif" font-size="54" fill="#c4622d"
        font-weight="bold">${totalFmt}</text>
  <text x="58" y="454"
        font-family="'Courier New',Courier,monospace" font-size="11" fill="#8a7e6e"
        letter-spacing="2">TOTAL PLAYS · ${allActive.length} TRACKS</text>

  <!-- leading track -->
  <text x="58" y="516"
        font-family="Georgia,'Times New Roman',serif" font-size="20" fill="#1a1208">${esc(leader ? leader.display : '—')}</text>
  <text x="58" y="536"
        font-family="'Courier New',Courier,monospace" font-size="11" fill="${leader ? leader.color : '#8a7e6e'}">${leader ? leader.plays + ' plays' : ''}</text>
  <text x="58" y="554"
        font-family="'Courier New',Courier,monospace" font-size="10" fill="#8a7e6e"
        letter-spacing="1">LEADING TRACK</text>

  <!-- site URL -->
  <text x="58" y="${H - 28}"
        font-family="'Courier New',Courier,monospace" font-size="11" fill="#8a7e6e"
        opacity="0.7">markescence.msge.no</text>

  <!-- ── RIGHT PANEL ── -->
  <text x="${CHART_L}" y="46"
        font-family="'Courier New',Courier,monospace" font-size="10" fill="#8a7e6e"
        letter-spacing="3">BY TRACK</text>
  ${bars}
</svg>`;
}

async function buildOgPng() {
  if (!Resvg) throw new Error('resvg not available');
  const rows   = db.prepare('SELECT track_id, play_count FROM track_counts').all();
  const counts = Object.fromEntries(rows.map(r => [r.track_id, r.play_count]));
  const svg    = buildOgSvg(counts);
  const resvg  = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  return resvg.render().asPng();
}

// ── Database ──────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'db', 'markescence.sqlite');
let db;

function initDb() {
  fs.mkdirSync(path.join(__dirname, 'db'), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    -- Latest known play count per track (upserted on every poll)
    CREATE TABLE IF NOT EXISTS track_counts (
      track_id   TEXT PRIMARY KEY,
      play_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Time-series history — one row per track per poll cycle
    CREATE TABLE IF NOT EXISTS count_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id    TEXT    NOT NULL,
      play_count  INTEGER NOT NULL,
      recorded_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_history_track ON count_history(track_id);
    CREATE INDEX IF NOT EXISTS idx_history_time  ON count_history(recorded_at);

    -- Key/value store for misc server state
    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ── Last.fm helpers ───────────────────────────────────────────────────────────

async function lfmGet(params) {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('api_key', LASTFM_KEY);
  url.searchParams.set('format', 'json');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Last.fm HTTP ${res.status}`);
  return res.json();
}

async function fetchTrackCount(artist, track) {
  const json = await lfmGet({ method: 'track.getInfo', artist, track, username: LASTFM_USER });
  return parseInt(json.track?.userplaycount ?? '0', 10) || 0;
}

async function fetchLastScrobble() {
  const json = await lfmGet({ method: 'user.getrecenttracks', user: LASTFM_USER, limit: '2' });
  const tracks = json.recenttracks?.track ?? [];
  for (const t of [tracks].flat()) {
    if (!t['@attr']?.nowplaying && t.date?.uts) {
      return {
        ts: parseInt(t.date.uts, 10),
        trackName: t.name ?? null,
        artistName: t.artist?.['#text'] ?? null,
      };
    }
  }
  return null;
}

// ── Background poller ─────────────────────────────────────────────────────────

const upsertCount = () => db.prepare(`
  INSERT INTO track_counts (track_id, play_count, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(track_id) DO UPDATE SET
    play_count = excluded.play_count,
    updated_at = excluded.updated_at
`);

const insertHistory = () => db.prepare(`
  INSERT INTO count_history (track_id, play_count) VALUES (?, ?)
`);

async function pollCounts() {
  if (!LASTFM_KEY) {
    console.log('[poll] no LASTFM_API_KEY — skipping');
    return;
  }
  console.log(`[poll] ${new Date().toISOString()} — fetching track counts…`);

  const up = upsertCount();
  const hist = insertHistory();

  for (const t of TRACKS) {
    try {
      let count = await fetchTrackCount(t.artist, t.track);
      // Some scrobblers submit stylised alternating-case track names (e.g. "GiRl'S jUsT
      // fLyInG") that Last.fm stores as a separate entry. altTrack lets us query that
      // variant and take whichever count is higher.
      if (t.altTrack) {
        const alt = await fetchTrackCount(t.artist, t.altTrack);
        count = Math.max(count, alt);
      }
      if (t.altArtist) {
        const alt = await fetchTrackCount(t.altArtist, t.track);
        count = Math.max(count, alt); // Last.fm counts the same scrobble under one artist
      }
      up.run(t.id, count);
      hist.run(t.id, count);
      console.log(`  ${t.id}: ${count}`);
    } catch (err) {
      console.warn(`  ${t.id}: FAILED — ${err.message}`);
    }
  }

  // Fetch and store the most recent scrobble timestamp + track info
  try {
    const scrobble = await fetchLastScrobble();
    if (scrobble) {
      const { ts, trackName, artistName } = scrobble;
      const upsertState = db.prepare(
        `INSERT INTO app_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      );
      upsertState.run('last_scrobble_ts', String(ts));
      if (trackName)  upsertState.run('last_track_name',   trackName);
      if (artistName) upsertState.run('last_track_artist', artistName);
      console.log(`  last scrobble: ${new Date(ts * 1000).toISOString()} — ${trackName}`);
    }
  } catch (err) {
    console.warn(`  last_scrobble_ts: FAILED — ${err.message}`);
  }

  console.log('[poll] done');
  ogCache.builtAt = 0; // invalidate OG image so next request re-renders with fresh counts
}

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Unauthenticated liveness probe for the container healthcheck
// (hetzner-server ADR 0006 — box_health scrapes Docker health status).
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// Manual poll trigger — POST /api/poll
// Runs pollCounts() immediately and waits for it to finish.
app.post('/api/poll', async (req, res) => {
  try {
    await pollCounts();
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Latest counts from DB — fast read, always returns something
app.get('/api/counts', (req, res) => {
  const rows = db.prepare(
    'SELECT track_id, play_count FROM track_counts'
  ).all();

  const counts = Object.fromEntries(rows.map(r => [r.track_id, r.play_count]));

  const tsRow = db.prepare(
    `SELECT value FROM app_state WHERE key = 'last_scrobble_ts'`
  ).get();
  const lastScrobbleTs = tsRow ? parseInt(tsRow.value, 10) : null;

  const trackNameRow   = db.prepare(`SELECT value FROM app_state WHERE key = 'last_track_name'`).get();
  const trackArtistRow = db.prepare(`SELECT value FROM app_state WHERE key = 'last_track_artist'`).get();

  res.json({
    counts,
    lastScrobbleTs,   // Unix seconds — null until first poll completes
    lastTrackName:   trackNameRow?.value   ?? null,
    lastTrackArtist: trackArtistRow?.value ?? null,
    demo: !LASTFM_KEY,
  });
});

// Time-series history from DB (useful for debugging / future chart features)
app.get('/api/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '500', 10), 2000);
  const rows = db.prepare(`
    SELECT track_id, play_count, recorded_at
    FROM   count_history
    ORDER  BY recorded_at DESC
    LIMIT  ?
  `).all(limit);
  res.json(rows);
});

// OG image — generated PNG, cached 5 min
app.get('/og-image.png', async (req, res) => {
  if (!Resvg) return res.status(501).send('og-image not available');
  const now = Date.now();
  try {
    if (!ogCache.png || now - ogCache.builtAt > OG_CACHE_MS) {
      ogCache.png     = await buildOgPng();
      ogCache.builtAt = now;
    }
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
    res.send(ogCache.png);
  } catch (err) {
    console.error('[og-image] generation failed:', err);
    res.status(500).send('og-image generation failed');
  }
});

// Date-stamped static pages, served from memory rather than express.static so
// the __PAGE_*_ISO__ placeholders never ship raw. Last-Modified is the
// git-derived modified date; conditional GETs (req.fresh) get a bodyless 304.
app.get('/', (req, res) => {
  res.set('Last-Modified', new Date(PAGE_DATES.modified).toUTCString());
  if (req.fresh) return res.status(304).end();
  res.type('html').send(indexHtml);
});
app.get('/index.html', (_req, res) => res.redirect(301, '/'));
app.get('/sitemap.xml', (_req, res) => res.type('xml').send(sitemapXml));

// Static files — everything else (robots.txt, /og-image.png handled above)
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html'],
}));

app.listen(PORT, () => {
  console.log(`markescence listening on :${PORT}`);
  if (!LASTFM_KEY) console.warn('  ⚠  LASTFM_API_KEY not set — running in demo mode');
});

// ── Boot ──────────────────────────────────────────────────────────────────────
initDb();
pollCounts();                          // immediate first fetch on startup
setInterval(pollCounts, POLL_MS);      // then every 5 minutes
