# Stage 1: Base (Setup pnpm and context)
FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate

WORKDIR /app

# Stage 2: Builder (Build the TypeScript source)
FROM base AS builder

# Install build tools for native modules
RUN apk add --no-cache python3 make g++ libc6-compat

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Stage 3: Deployer (Prepare the production bundle)
# This stage isolates the specific app and its production deps
FROM base AS deployer

WORKDIR /app
COPY . .

# --prod ensures only production deps are included
# --legacy required for pnpm v10+ without injected workspace packages
# /app/pruned is the destination folder
RUN pnpm --filter=@fortressauth/server --prod deploy --legacy /app/pruned

# Stage 4: Native Builder (Rebuild native modules in the pruned folder)
FROM base AS native-builder

WORKDIR /app/pruned

# Copy the pruned lockfile/packages from the deployer stage
COPY --from=deployer /app/pruned .

# Install build tools specifically for the production build
RUN apk add --no-cache python3 make g++

# Force a rebuild of better-sqlite3 inside this final isolated structure
RUN npm rebuild better-sqlite3

# Stage 5: Runner (Final Image)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 fortress && \
    adduser --system --uid 1001 fortress

# Install runtime libraries often needed by native modules on Alpine
RUN apk add --no-cache libstdc++

# Copy the fully built, isolated application from the native-builder stage
COPY --from=native-builder --chown=fortress:fortress /app/pruned .

# Copy the built dist files from the builder stage
COPY --from=builder --chown=fortress:fortress /app/packages/server/dist ./packages/server/dist
COPY --from=builder --chown=fortress:fortress /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=fortress:fortress /app/packages/adapter-sql/dist ./packages/adapter-sql/dist

# Create data directory for SQLite
RUN mkdir -p /data && chown fortress:fortress /data

USER fortress

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
