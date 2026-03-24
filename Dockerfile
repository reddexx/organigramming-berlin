# Multi-stage build that clones the repo at build-time (can be overridden with build-args)
FROM node:18-bullseye-slim AS builder
ARG REPO=https://github.com/reddexx/organigramming-berlin.git
ARG BRANCH=main

RUN apt-get update && \
		apt-get install -y --no-install-recommends \
			git ca-certificates build-essential python3 make g++ \
			libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev && \
		rm -rf /var/lib/apt/lists/*
WORKDIR /src

# Clone the specified repository and branch so the image can be built anywhere
RUN git clone --depth 1 --branch ${BRANCH} ${REPO} .

WORKDIR /src/app
# Use Corepack/Yarn to install dependencies and build (project uses yarn)
 RUN corepack enable && corepack prepare yarn@1.22.19 --activate
# Configure Yarn to be more resilient in CI builds: increase network timeout and point to an npm mirror if the registry is unstable.
 RUN yarn config set network-timeout 600000 || true
 RUN yarn config set registry https://registry.npmmirror.com || true
# Retry loop for transient registry errors (e.g. 502). Try up to 5 times with a short backoff.
 RUN /bin/sh -c 'i=0; until [ "$i" -ge 5 ]; do yarn install --silent --no-progress && break; i=$((i+1)); echo "yarn install failed, retrying ($i)"; sleep $((i*2)); done; if [ "$i" -ge 5 ]; then echo "yarn install failed after retries"; exit 1; fi'
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
