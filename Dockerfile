# Multi-stage build that clones the repo at build-time (can be overridden with build-args)
FROM node:18-bullseye-slim AS builder
ARG REPO=https://github.com/reddexx/organigramming-berlin.git
ARG BRANCH=main

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src

# Clone the specified repository and branch so the image can be built anywhere
RUN git clone --depth 1 --branch ${BRANCH} ${REPO} .

WORKDIR /src/app
# Use Corepack/Yarn to install dependencies and build (project uses yarn)
RUN corepack enable && corepack prepare yarn@1.22.19 --activate
RUN yarn install --silent --no-progress
RUN yarn build

FROM nginx:stable-alpine
COPY --from=builder /src/app/build /usr/share/nginx/html

# Custom nginx config to allow embedding in iframes and serve SPA fallback
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx-default.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
