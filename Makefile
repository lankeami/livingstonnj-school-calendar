.PHONY: help local clean build serve

.DEFAULT_GOAL := help

##@ General

help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

local: clean build serve ## Clean, rebuild, and start local server

clean: ## Remove build artifacts
	@rm -rf dist
	@echo "Cleaned dist/"

build: ## Compile TypeScript and generate docs/
	npm run build

serve: ## Start a local server on the next available port
	@port=$$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()'); \
	echo "Serving docs/ at http://localhost:$$port"; \
	python3 -m http.server $$port --directory docs
