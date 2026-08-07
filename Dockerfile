FROM node:22-alpine

WORKDIR /app

# Fonts needed by resvg-js for OG image text rendering
RUN apk add --no-cache font-noto

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY index.html ./
COPY robots.txt ./
COPY sitemap.xml ./
# Git-derived dates (scripts/generate-page-dates.sh, run by `make deploy`/`make
# build` on the checkout — .git isn't in the build context). The bracketed "n"
# makes this a glob pattern, so COPY doesn't fail when the file is absent (a
# bare `docker build`/`docker compose build` that skipped the Makefile hook);
# server.js falls back to boot time in that case.
COPY page-dates.jso[n] ./

RUN mkdir -p db

# This image's git identity (scripts/generate-build-info.sh, run by `make deploy`/
# `make build` on the checkout BEFORE this build), served at /version so a
# `git pull` that skipped a rebuild becomes visible — hetzner-server ADR 0022.
# MUST stay the LAST COPY: built_at changes on every deploy, so an earlier COPY
# would bust the layer cache for `npm ci` and everything below it. Same
# bracketed-"n" optional-copy glob as page-dates.json above, so a bare
# `docker build` still succeeds; server.js then reports source "unknown".
COPY build-info.jso[n] ./

EXPOSE 4001

CMD ["node", "server.js"]
