# Multi-stage build that clones the repo at build-time (can be overridden with build-args)
FROM node:18-alpine AS builder
ARG REPO=https://github.com/reddexx/organigramming-berlin.git
ARG BRANCH=main

RUN apk add --no-cache git
WORKDIR /src

# Clone the specified repository and branch so the image can be built anywhere
RUN git clone --depth 1 --branch ${BRANCH} ${REPO} .

WORKDIR /src/app
RUN npm ci --silent
RUN npm run build

FROM nginx:stable-alpine
COPY --from=builder /src/app/build /usr/share/nginx/html

# Custom nginx config to allow embedding in iframes and serve SPA fallback
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx-default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
