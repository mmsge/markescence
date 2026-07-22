PORT        = 4002
DEPLOY_HOST = msge
DEPLOY_DIR  = /srv/markescence

.PHONY: deploy build run stop logs status ssh poll poll-remote

# Pull latest code, rebuild image, restart container
deploy:
	git pull --ff-only
	./scripts/generate-page-dates.sh || echo "WARN: page dates not regenerated — site will stamp boot time"
	docker compose up -d --build

build:
	./scripts/generate-page-dates.sh || echo "WARN: page dates not regenerated — site will stamp boot time"
	docker compose build

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
