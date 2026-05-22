PORT        = 4002
DEPLOY_HOST = msge
DEPLOY_DIR  = /var/www/markescence

.PHONY: deploy build run stop logs status ssh poll poll-remote

# Pull latest code, rebuild image, restart container
deploy:
	git pull --ff-only
	docker compose up -d --build

build:
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
