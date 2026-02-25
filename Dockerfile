# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY tsconfig.base.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY packages/ ./packages/
COPY scripts/ ./scripts/

# Build all packages
RUN npm run build -w @orr/shared
RUN npm run build -w @orr/api
RUN npm run build -w @orr/web

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/web/dist ./packages/api/public

# Copy seed data
COPY scripts/ ./scripts/

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DB_PATH=/app/data/orr-companion.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/api/dist/index.js"]
