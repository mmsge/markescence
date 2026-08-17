# Last.fm Ticks

Last.fm calls its Unix timestamps **ticks**. They always represent **seconds since the Unix epoch** — not milliseconds. This skill documents every place ticks appear and the exact idiom to use in each case.

## Where ticks come from

`user.getrecenttracks` returns each scrobble with a `date` object:

```json
{
  "name": "Body Better",
  "date": { "uts": "1704067200", "#text": "01 Jan 2024, 00:00" }
}
```

`date.uts` is always a **string**. Parse it with `parseInt(t.date.uts, 10)`.

## The nowplaying guard — always do this first

When a track is currently playing, Last.fm injects a pseudo-entry with
`@attr.nowplaying = "true"` **and no `date` field at all**. Touching
`t.date.uts` on that entry gives `undefined`, and `parseInt(undefined, 10)`
gives `NaN`. Always skip nowplaying entries before reading ticks:

```js
for (const t of [tracks].flat()) {
  if (t['@attr']?.nowplaying) continue; // no date.uts on this entry
  if (!t.date?.uts) continue;           // defensive: skip anything else without a date
  const ts = parseInt(t.date.uts, 10);
  // safe to use ts here
}
```

## Fetching the last-scrobbled track

Request `limit=2` so that if the first result is a nowplaying entry you
still get the most recent completed scrobble as the second:

```js
async function fetchLastScrobble() {
  const json = await lfmGet({ method: 'user.getrecenttracks', user: LASTFM_USER, limit: '2' });
  const tracks = json.recenttracks?.track ?? [];
  for (const t of [tracks].flat()) {
    if (!t['@attr']?.nowplaying && t.date?.uts) {
      return {
        ts:         parseInt(t.date.uts, 10),
        trackName:  t.name ?? null,
        artistName: t.artist?.['#text'] ?? null,
      };
    }
  }
  return null;
}
```

## Storing and retrieving a tick (SQLite)

SQLite has no native integer timestamp type you can rely on across all
drivers. Store ticks as **strings** in the `app_state` key/value table and
parse on read:

```js
// Write
upsertState.run('last_scrobble_ts', String(ts));

// Read
const row = db.prepare(`SELECT value FROM app_state WHERE key = 'last_scrobble_ts'`).get();
const lastScrobbleTs = row ? parseInt(row.value, 10) : null;
```

Always keep the parsed value as a plain number (or `null`); never let
`NaN` propagate — callers check `if (lastScrobbleTs)` truthy.

## Sending ticks over the API

Pass them straight through as numbers in JSON:

```js
res.json({
  counts,
  lastScrobbleTs,   // Unix seconds — null until first poll completes
  lastTrackName:   trackNameRow?.value ?? null,
  lastTrackArtist: trackArtistRow?.value ?? null,
});
```

The client receives a number (or `null`) and **never** needs to parse a
string — only the server does that, once, on database read.

## Converting ticks to a JS Date (×1000)

JavaScript's `Date` works in **milliseconds**. Always multiply by 1000:

```js
new Date(ts * 1000)          // Date object
new Date(ts * 1000).toISOString()  // "2024-01-01T00:00:00.000Z"
```

Formatting for display:

```js
new Date(lastScrobbleTs * 1000).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})
// → "1 Jan, 00:00"
```

## Computing age (seconds since last scrobble)

`Date.now()` returns milliseconds. Divide by 1000 to get the current
tick, then subtract:

```js
const age = Math.floor(Date.now() / 1000) - lastScrobbleTs;
```

## "Now playing" heuristic

Last.fm's nowplaying flag only appears while playback is happening live.
Because the server polls every 60 seconds and the client re-fetches from
the server every 60 seconds, a simpler proxy works well: if the last
completed scrobble is **less than 5 minutes old** and we have a track
name, treat it as currently playing:

```js
const NOW_PLAYING_MAX_AGE_S = 5 * 60; // 5 minutes

function updateNowPlaying(lastScrobbleTs, trackName) {
  const card    = document.getElementById('nowPlaying');
  const trackEl = document.getElementById('nowPlayingTrack');
  if (lastScrobbleTs && trackName) {
    const age = Math.floor(Date.now() / 1000) - lastScrobbleTs;
    if (age < NOW_PLAYING_MAX_AGE_S) {
      trackEl.textContent = trackName;
      card.style.display  = 'block';
      return;
    }
  }
  card.style.display = 'none';
}
```

## Converting a calendar date to a tick (backfill `from` parameter)

`user.getrecenttracks` accepts a `from` parameter in Unix seconds to
limit how far back pagination goes:

```js
const fromTs = Math.floor(new Date('2023-01-01T00:00:00Z').getTime() / 1000);
// pass as a string — the Last.fm API treats all params as strings
await lfmGet({ method: 'user.getrecenttracks', user, from: String(fromTs), limit: '200', page: String(page) });
```

Always use a `Z`-suffixed ISO string so the date is interpreted as UTC,
not local time.

## Grouping scrobbles by calendar month (backfill bucketing)

After collecting raw scrobbles `{ track_id, ts }`, bucket them into
months using UTC methods to avoid local-timezone drift:

```js
const monthCounts = new Map(); // "track_id|||YYYY-MM" → count
for (const { track_id, ts } of scrobbles) {
  const d  = new Date(ts * 1000);  // ×1000 — ticks are seconds
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const k  = `${track_id}|||${ym}`;
  monthCounts.set(k, (monthCounts.get(k) ?? 0) + 1);
}
```

## Synthetic timestamps for backfilled history rows

When inserting synthetic `count_history` rows (one per track per month),
use the **last calendar day of that month at noon UTC**. Noon avoids any
ambiguity from DST transitions, and the fixed format makes them easy to
identify and delete on a forced re-backfill:

```js
const [yr, mo] = ym.split('-').map(Number);
// Day 0 of the *next* month = last day of *this* month
const lastDay    = new Date(Date.UTC(yr, mo, 0)).getUTCDate();
const recordedAt = `${ym}-${String(lastDay).padStart(2, '0')} 12:00:00`;

// To wipe synthetic rows later:
db.prepare(`DELETE FROM count_history WHERE recorded_at LIKE '____-__-__ 12:00:00'`).run();
```

## DST guard when rendering date labels on a chart

If you pass a bare date string like `'2024-03-10'` to `new Date()`,
browsers parse it as UTC midnight, which can render as the previous day
in negative-UTC-offset zones. Append `T12:00:00` (noon, no `Z`) so the
browser interprets it in local time but far from any midnight boundary:

```js
// Inside a Chart.js tick callback:
callback(val, idx) {
  const date = labels[idx];          // e.g. "2024-03-10"
  if (!date) return '';
  const d = new Date(date + 'T12:00:00'); // noon avoids DST edge
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
```

## Quick-reference cheat sheet

| Situation | Idiom |
|-----------|-------|
| Parse tick from API string | `parseInt(t.date.uts, 10)` |
| Skip nowplaying entry | `if (t['@attr']?.nowplaying) continue` |
| Store tick in SQLite | `String(ts)` → TEXT column |
| Read tick from SQLite | `parseInt(row.value, 10)` |
| Tick → JS Date | `new Date(ts * 1000)` |
| Current tick | `Math.floor(Date.now() / 1000)` |
| Age in seconds | `Math.floor(Date.now() / 1000) - ts` |
| Date string → tick | `Math.floor(new Date('YYYY-MM-DDT00:00:00Z').getTime() / 1000)` |
| Month bucket key | `d.getUTCFullYear() + '-' + (d.getUTCMonth()+1).toString().padStart(2,'0')` |
| Last day of month | `new Date(Date.UTC(yr, mo, 0)).getUTCDate()` |
| Chart axis label (DST-safe) | `new Date(dateStr + 'T12:00:00')` |
