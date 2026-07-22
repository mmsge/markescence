#!/bin/sh
# Derive site created/modified timestamps from git history into
# page-dates.json, read by server.js at boot.
#
# Runs on the CHECKOUT (make deploy / make build), never in the container —
# .git is dockerignored, so the image can only ever see the generated file.
# Pure git + POSIX sh: the deploy host has no Node outside the containers.
#
# Site-level granularity (one date pair for the whole site): this is a
# single-page app, so per-page dates would be machinery without a consumer.
#
# created  = author date of the oldest commit touching the repo
# modified = author date of the newest commit touching the repo
#
# NOTE: a shallow clone (e.g. CI fetch-depth: 1) collapses both dates onto
# the latest commit; the server checkout is a full clone.
#
# Same pattern as msge-no (ADR 0004) and hetzner-server (ADR 0015).
set -eu
cd "$(dirname "$0")/.."

OUT=page-dates.json

modified=$(git log -1 --format=%aI 2>/dev/null || true)
created=$(git log --format=%aI 2>/dev/null | tail -n 1 || true)

if [ -z "$modified" ] || [ -z "$created" ]; then
  echo "WARN: no git history — skipping $OUT generation" >&2
  exit 0
fi

printf '{\n  "generated": "%s",\n  "created": "%s",\n  "modified": "%s"\n}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$created" "$modified" > "$OUT"
echo "Wrote $OUT"
