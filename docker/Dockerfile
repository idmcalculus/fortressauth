# Stage 1: Base (Setup pnpm and context)
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
ARG PNPM_VERSION=10.33.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

# Stage 2: Builder + Deployer combined
#
# We must build the workspace first so every package has a populated dist/.
# Only then is `pnpm deploy --legacy` safe: it copies each transitive
# workspace dep (including nested copies under .pnpm/) along with its built
# output. If we deploy before building, pnpm copies empty dist folders and
# transitive deps like @fortressauth/oauth-core fail at runtime with
# ERR_MODULE_NOT_FOUND when imported from inside .pnpm/<provider>/...
FROM base AS deployer

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @fortressauth/server... build

# --prod ensures only production deps are included
# --legacy required for pnpm v10+ without injected workspace packages
# /app/pruned is the destination folder
RUN pnpm --filter=@fortressauth/server --prod deploy --legacy /app/pruned

# Stage 3: Native Builder (Rebuild native modules in the pruned folder)
FROM base AS native-builder

WORKDIR /app/pruned

# Copy the pruned lockfile/packages from the deployer stage
COPY --from=deployer /app/pruned .

# Install build tools specifically for the production build
RUN apk add --no-cache python3 make g++

# Force a rebuild of better-sqlite3 inside this final isolated structure
RUN pnpm rebuild better-sqlite3

# Stage 4: Runner (Final Image)
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 fortress && \
    adduser --system --uid 1001 fortress

# Install runtime libraries often needed by native modules on Alpine
RUN apk add --no-cache libstdc++

# Copy the fully built, isolated application from the native-builder stage
COPY --from=native-builder --chown=fortress:fortress /app/pruned .

# Copy the main server build (the deployer stage builds packages/server/dist
# but pnpm deploy strips it because the server's own package.json doesn't
# declare its dist as an entry of its own dependencies; copy it explicitly).
COPY --from=deployer --chown=fortress:fortress /app/packages/server/dist ./packages/server/dist

# Create data directory for SQLite
RUN mkdir -p /data && chown fortress:fortress /data

ENV DATABASE_URL="/data/fortress.db"
ENV REDIS_URL=""
ENV BASE_URL="http://localhost:3000"
ENV COOKIE_SECURE=false
ENV COOKIE_SAMESITE=strict
ENV PORT=3000
ENV HOST=0.0.0.0
# Email provider defaults (console for dev, override with resend for prod)
ENV EMAIL_PROVIDER="console"
# Note: RESEND_API_KEY, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME should be provided at runtime

USER fortress

EXPOSE 3000

# Healthcheck. Use 127.0.0.1, not localhost: Docker maps localhost to ::1 as
# well, busybox wget tries only that, and the server listens on IPv4.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
