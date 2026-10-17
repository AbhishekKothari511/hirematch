# ============================================================================
# HireMatch Next.js Web Frontend Dockerfile
# ============================================================================

# Stage 1: Dependencies & Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm install

COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

RUN npm run build --workspace=@hirematch/shared
RUN npm run build --workspace=@hirematch/web

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

USER node

COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=builder /app/apps/web/.next ./apps/web/.next
COPY --chown=node:node --from=builder /app/apps/web/public ./apps/web/public
COPY --chown=node:node --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 3000

CMD ["npx", "next", "start", "apps/web", "-p", "3000"]
