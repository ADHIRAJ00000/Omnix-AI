# syntax=docker/dockerfile:1

###############################################################################
# Build stage
#
# Native modules (none here, but kept uniform) need a compiler, which is only required to
# build them — not to run them. Compiling here and copying the result into a
# clean runtime keeps the toolchain out of the shipped image.
###############################################################################
FROM node:24-slim AS build

WORKDIR /app


# Dependencies first, and separately from source: this layer is cached and only
# rebuilt when a lockfile changes, so an ordinary code edit skips reinstalling.
COPY package*.json ./
RUN npm ci --omit=dev

COPY gateway/package*.json ./gateway/
RUN cd gateway && npm ci --omit=dev

###############################################################################
# Runtime stage
###############################################################################
FROM node:24-slim AS runtime

ENV NODE_ENV=production

# dumb-init becomes PID 1 and forwards signals properly. Without it Node runs as
# PID 1, where it does not reap orphaned child processes and can miss the
# SIGTERM the platform sends on shutdown — which is what triggers our graceful
# drain of in-flight requests.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/gateway/node_modules ./gateway/node_modules

COPY package*.json ./
COPY shared ./shared
COPY gateway ./gateway

# node:24-slim ships an unprivileged `node` user. Running as root would mean a
# container escape starts with root on the host.
USER node

WORKDIR /app/gateway

EXPOSE 8000

# The platform uses this to decide whether the container is actually serving,
# rather than merely started.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
