'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PORT        = process.env.PORT || 4001;
const LASTFM_KEY  = process.env.LASTFM_API_KEY || '';
const LASTFM_USER = 'mvrkws';
const POLL_MS     = 60 * 1000; // 1 minute

// ── Tracks ────────────────────────────────────────────────────────────────────
// Mirrors the TRACKS array in index.html — only what the server needs.

const TRACKS = [
  { id: 'my-regards',                  artist: 'Maisie Peters', track: 'My Regards' },
  { id: 'audrey-hepburn',              artist: 'Maisie Peters', track: 'Audrey Hepburn' },
  { id: 'you-you-you',                 artist: 'Maisie Peters', track: 'You You You' },
  { id: 'say-my-name',                 artist: 'Maisie Peters', track: 'Say My Name In Your Sleep' },
  { id: 'kingmaker',                   artist: 'Maisie Peters', track: 'Kingmaker (with Julia Michaels)', altArtist: 'Julia Michaels' },
  { id: 'mary-janes',                  artist: 'Maisie Peters', track: 'Mary Janes' },
  { id: 'old-fashioned',               artist: 'Maisie Peters', track: 'Old Fashioned' },
  { id: 'houses',                      artist: 'Maisie Peters', track: 'Houses' },
  { id: 'vampire-time',                artist: 'Maisie Peters', track: 'Vampire Time' },
  { id: 'if-you-let-me',               artist: 'Maisie Peters', track: 'If You Let Me (with Marcus Mumford)', altArtist: 'Marcus Mumford' },
  { id: 'flat-earther',                artist: 'Maisie Peters', track: 'Flat Earther' },
  { id: 'questions',                   artist: 'Maisie Peters', track: 'Questions' },
  { id: 'girls-just-flying',           artist: 'Maisie Peters', track: "Girl's Just Flying" },
  { id: 'you-then-me-now',             artist: 'Maisie Peters', track: 'You Then Me Now' },
  { id: 'nothing-like-being-in-love',  artist: 'Maisie Peters', track: 'Nothing Like Being In Love' },
];

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

async function fetchLastScrobbleTs() {
  const json = await lfmGet({ method: 'user.getrecenttracks', user: LASTFM_USER, limit: '1' });
  const tracks = json.recenttracks?.track ?? [];
  for (const t of [tracks].flat()) {
    if (!t['@attr']?.nowplaying && t.date?.uts) {
      return parseInt(t.date.uts, 10);
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

  // Fetch and store the most recent scrobble timestamp
  try {
    const ts = await fetchLastScrobbleTs();
    if (ts) {
      db.prepare(`
        INSERT INTO app_state (key, value) VALUES ('last_scrobble_ts', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(String(ts));
      console.log(`  last scrobble: ${new Date(ts * 1000).toISOString()}`);
    }
  } catch (err) {
    console.warn(`  last_scrobble_ts: FAILED — ${err.message}`);
  }

  console.log('[poll] done');
}

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();

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

  res.json({
    counts,
    lastScrobbleTs, // Unix seconds — null until first poll completes
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

// Static files — serve index.html at root
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
