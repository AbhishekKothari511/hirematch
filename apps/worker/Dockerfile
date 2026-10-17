# ============================================================================
# HireMatch BullMQ Worker Dockerfile (Multi-stage production build)
# ============================================================================

# Stage 1: Build & Compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies across workspaces
RUN npm install

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY apps/worker/ ./apps/worker/

# Compile shared library and worker
RUN npm run build --workspace=@hirematch/shared
RUN npm run build --workspace=@hirematch/worker

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Run as non-root user
USER node

# Copy package manifests and compiled artifacts
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --chown=node:node --from=builder /app/apps/worker/package.json ./apps/worker/package.json

CMD ["node", "apps/worker/dist/worker.js"]
