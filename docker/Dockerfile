# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/core/package.json ./packages/core/
COPY packages/adapter-sql/package.json ./packages/adapter-sql/
COPY packages/server/package.json ./packages/server/

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages

# Copy source code
COPY tsconfig.json turbo.json ./
COPY packages ./packages

# Build all packages
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN pnpm build

# Stage 3: Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 fortress && \
    adduser --system --uid 1001 fortress

# Copy built files
COPY --from=builder --chown=fortress:fortress /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=fortress:fortress /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=fortress:fortress /app/packages/adapter-sql/dist ./packages/adapter-sql/dist
COPY --from=builder --chown=fortress:fortress /app/packages/adapter-sql/package.json ./packages/adapter-sql/
COPY --from=builder --chown=fortress:fortress /app/packages/server/dist ./packages/server/dist
COPY --from=builder --chown=fortress:fortress /app/packages/server/package.json ./packages/server/
COPY --from=builder --chown=fortress:fortress /app/node_modules ./node_modules
COPY --from=builder --chown=fortress:fortress /app/package.json ./

# Create data directory for SQLite
RUN mkdir -p /data && chown fortress:fortress /data

USER fortress

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
