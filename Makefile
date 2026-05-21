IMAGE     = markescence
CONTAINER = markescence
PORT      = 4001
DEPLOY_HOST = ap-mcp
DEPLOY_DIR  = /var/www/markescence

.PHONY: deploy build run stop logs status ssh

# Pull latest code, rebuild image, restart container
deploy: build run

build:
	podman build -t $(IMAGE) .

run:
	-podman stop $(CONTAINER) 2>/dev/null; podman rm $(CONTAINER) 2>/dev/null; true
	mkdir -p db
	podman run -d \
		--name $(CONTAINER) \
		--restart=always \
		-p $(PORT):4001 \
		-v ./db:/app/db:Z \
		-e LASTFM_API_KEY=$(LASTFM_API_KEY) \
		$(IMAGE)

stop:
	podman stop $(CONTAINER)
	podman rm $(CONTAINER)

logs:
	podman logs -f $(CONTAINER)

status:
	podman ps --filter name=$(CONTAINER)

ssh:
	ssh -t $(DEPLOY_HOST) 'cd $(DEPLOY_DIR) && exec $$SHELL'
