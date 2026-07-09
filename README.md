# Markescence

[![deployed](https://img.shields.io/endpoint?url=https://utrulla.msge.no/badge/mmsge/markescence)](https://markescence.msge.no)

![Deploy](https://github.com/mmsge/markescence/actions/workflows/deploy.yaml/badge.svg)

Real-time cumulative scrobble chart for Maisie Peters' *Florescence* pre-release singles,
built from [mvrkws](https://www.last.fm/user/mvrkws)'s Last.fm listening history.

**Live site → https://mmsge.github.io/markescence**

## What it does

- Plots the cumulative play count of every *Florescence* single over time, from their
  release dates through to album day (22 May 2026) and beyond
- Polls the Last.fm API every 60 seconds and appends new scrobbles to the chart live
- Fully static — one `index.html`, no build step, deployed to GitHub Pages

## Setup

### 1. Get a Last.fm API key

1. Go to https://www.last.fm/api/account/create
2. App name: `markescence` · Callback URL: `https://mmsge.github.io/markescence`
3. Copy the **API key**

### 2. Add it as a GitHub secret

Settings → Secrets and variables → Actions → **New repository secret**

| Name | Value |
|------|-------|
| `LASTFM_API_KEY` | your key from step 1 |

### 3. Enable GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → Branch: `gh-pages` / `/ (root)`

### 4. Trigger a deploy

Push anything to `main` (or run the workflow manually from the Actions tab).
The workflow injects the API key into `index.html` and pushes the result to `gh-pages`.

## Local development

Open `index.html` directly in a browser. The chart loads with historical data.
Live polling will show "Demo mode" until the key is injected — that's expected.

To test with a real key locally:

```bash
LASTFM_API_KEY=your_key_here
sed "s/__LASTFM_API_KEY__/${LASTFM_API_KEY}/" index.html > index.local.html
open index.local.html
```

## Tech stack

- Vanilla HTML / CSS / JS — zero dependencies at runtime
- [Chart.js 4](https://www.chartjs.org/) via CDN for the line chart
- [Last.fm API](https://www.last.fm/api) — `user.getrecenttracks` endpoint
- GitHub Actions + [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages)
