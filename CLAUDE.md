# markescence

## Deployment environment

This service runs on a shared Hetzner VPS (SSH alias `msge`, IP `157.180.66.111`).

| Key | Value |
|-----|-------|
| Server path | `/srv/markescence` |
| Domain | `markescence.msge.no` |
| Host port | `4002` (must be `0.0.0.0:4002`, not `127.0.0.1:4002`) |
| Runtime | Docker Compose |
| Deploy | `make deploy` (pulls latest code, rebuilds image, restarts container) |

## Central ingress — do not manage Caddy here

TLS and routing are handled centrally in **`github.com/mmsge/naustet-server`** — not in this repo.

- The Caddyfile block for this service lives at `naustet-server/Caddyfile`
- Service documentation lives at `naustet-server/services/markescence.md`
- To change routing or the domain, edit that repo and run `make reload` on the server

## Other services on the same server

| Service | Domain | Host port |
|---------|--------|-----------|
| skjenelangs.no | skjenelangs.msge.no | 4001 |
| **markescence** | markescence.msge.no | **4002** |
| daggerheart (river-sky) | rpg.msge.no | 4000 |
| activitypub-mcp | bot.skvip.lol | 3000 |

**Port 4002 is reserved for this service.** Do not change it without updating the Caddyfile in `naustet-server`.

## Environment

Requires `.env` on the server at `/srv/markescence/.env` with Last.fm credentials.
Never commit `.env` to git.

## Last.fm polling

Trigger a manual poll on the live server:
```sh
make poll-remote
```
