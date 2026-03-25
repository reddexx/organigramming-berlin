# Multi-stage build that clones the repo at build-time (can be overridden with build-args)
FROM node:18-bullseye-slim AS builder
ARG REPO=https://github.com/reddexx/organigramming-berlin.git
ARG BRANCH=main

RUN /bin/sh -c 'set -eu; success=0; \
	for attempt in 1 2 3 4 5; do \
		apt-get update -o Acquire::Retries=5 -o Acquire::ForceIPv4=true && \
		apt-get install -y --no-install-recommends --fix-missing \
			-o Acquire::Retries=5 \
			-o Acquire::ForceIPv4=true \
			git ca-certificates build-essential python3 make g++ \
			libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && \
			success=1 && break; \
		echo "apt install failed, retrying (${attempt}/5)"; \
		sleep $((attempt * 2)); \
	done; \
	if [ "$success" -ne 1 ]; then echo "apt install failed after retries"; exit 1; fi; \
	rm -rf /var/lib/apt/lists/*'
WORKDIR /src

# Clone the specified repository and branch so the image can be built anywhere
RUN git clone --depth 1 --branch ${BRANCH} ${REPO} .

WORKDIR /src/app
# Use Corepack/Yarn to install dependencies and build (project uses yarn)
 RUN corepack enable && corepack prepare yarn@1.22.19 --activate
 RUN /bin/sh -c 'set -eu; i=0; until [ "$i" -ge 5 ]; do yarn install --silent --no-progress && break; i=$((i+1)); echo "yarn install failed, retrying ($i/5)"; sleep $((i*2)); done; if [ "$i" -ge 5 ]; then echo "yarn install failed after retries"; exit 1; fi'
RUN npx browserslist@latest --update-db --silent || true
 ENV NODE_OPTIONS=--openssl-legacy-provider
 RUN yarn build

FROM node:18-alpine
WORKDIR /app

# copy built SPA
COPY --from=builder /src/app/build ./app/build

# copy server
COPY server ./server

WORKDIR /app/server
# install only server deps
RUN npm install --production --silent

# copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
