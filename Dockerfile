# Multi-stage build. Deliberately not using Next.js's "output: standalone" mode for
# this first migration off App Platform - this copies the full node_modules through
# and runs the exact same build:deploy/start:deploy scripts App Platform already ran,
# to keep the number of new things that can go wrong as small as possible. A leaner
# standalone image is a worthwhile follow-up once this is proven stable, not part of
# the initial move.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build needs these at build time: the NEXT_PUBLIC_* ones get inlined into the
# client (and server) bundle by Next's build-time replacement, and SENTRY_AUTH_TOKEN
# is used only by the Sentry webpack/turbopack plugin for source map upload - none of
# these are read again at container start, unlike everything in the runtime .env file
# (see deploy/docker-compose.yml). Passed via --build-arg from the CI workflow, never
# baked into the repo.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MARKETING_URL
ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_AUTH_TOKEN
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_MARKETING_URL=$NEXT_PUBLIC_MARKETING_URL
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

# prisma generate before next build - the Prisma client must exist before any route
# that imports it gets type-checked/bundled. Requires no database connectivity itself,
# just the schema file, so this works fine in a network-isolated CI build.
RUN npm run build:deploy

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./

# node:24-slim already has a low-privileged "node" user (uid 1000) built in.
USER node

EXPOSE 3000
ENV PORT=3000

# prisma migrate deploy runs here, not at image-build time - mirrors the App Platform
# setup this replaces (see docs/deployment.md / CLAUDE.md's run_command note): the
# build stage has no need for a database connection, and running migrations at
# container start means a rolled-back image never leaves the schema ahead of the code
# that's actually running.
CMD ["npm", "run", "start:deploy"]
