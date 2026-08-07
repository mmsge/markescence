PORT        = 4002
DEPLOY_HOST = msge
DEPLOY_DIR  = /srv/markescence

.PHONY: deploy build run stop logs status ssh poll poll-remote verify

# Pull latest code, rebuild image, restart container.
# Both generators run BEFORE the build: .git isn't in the build context, so the
# checkout is the only place these facts exist. generate-build-info.sh in
# particular must run before `--build` or the image would carry a stale SHA —
# hetzner-server ADR 0022.
deploy:
	git pull --ff-only
	./scripts/generate-page-dates.sh || echo "WARN: page dates not regenerated — site will stamp boot time"
	./scripts/generate-build-info.sh || echo "WARN: build info not regenerated — /version will report source=unknown"
	docker compose up -d --build

build:
	./scripts/generate-page-dates.sh || echo "WARN: page dates not regenerated — site will stamp boot time"
	./scripts/generate-build-info.sh || echo "WARN: build info not regenerated — /version will report source=unknown"
	docker compose build

# Build, boot and smoke-test the ops contract. All three endpoints, not just
# /healthz — the box's audit probes for /version and /health too, and `-f` makes
# a 404 or a 5xx fail the target.
verify: build
	docker compose up -d
	@sleep 3
	@curl -fsS http://127.0.0.1:$(PORT)/healthz | grep -qx ok && echo "  /healthz OK" || (echo "  /healthz FAILED"; exit 1)
	@curl -fsS http://127.0.0.1:$(PORT)/version >/dev/null && echo "  /version OK" || (echo "  /version FAILED"; exit 1)
	@curl -fsS http://127.0.0.1:$(PORT)/health  >/dev/null && echo "  /health  OK" || (echo "  /health  FAILED"; exit 1)

run:
	docker compose up -d

stop:
	docker compose down

logs:
	docker compose logs -f

status:
	docker compose ps

ssh:
	ssh -t $(DEPLOY_HOST) 'cd $(DEPLOY_DIR) && exec $$SHELL'

# Trigger a Last.fm poll on the local container
poll:
	curl -s -X POST http://localhost:$(PORT)/api/poll | jq .

# Trigger a Last.fm poll on the remote deployed container
poll-remote:
	ssh $(DEPLOY_HOST) 'curl -s -X POST http://localhost:$(PORT)/api/poll' | jq .

# ── Jump to a service (run on the server) ─────────────────────────────────────
.PHONY: msge skjenelangs daggerheart bot hetzner

msge:
	cd /srv/msge && exec $$SHELL

skjenelangs:
	cd /srv/skjenelangs && exec $$SHELL

daggerheart:
	cd /srv/rpg && exec $$SHELL

bot:
	cd /srv/bot && exec $$SHELL

hetzner:
	cd /root/hetzner-server && exec $$SHELL
