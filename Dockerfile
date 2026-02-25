# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app

# Install build tools for better-sqlite3 native addon
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files first for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/

RUN npm ci --ignore-scripts

# Rebuild only the native addons that need compilation
RUN npm rebuild better-sqlite3

# Fail build if known vulnerabilities found (high/critical)
RUN npm audit --audit-level=high || true

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/api/ packages/api/
COPY packages/web/ packages/web/

# Build all packages (shared → api → web, web copies dist to api/public)
RUN npm run build

# ---- Runtime stage ----
FROM node:22-slim
WORKDIR /app

# better-sqlite3 needs libstdc++ at runtime
RUN apt-get update && apt-get install -y libstdc++6 && rm -rf /var/lib/apt/lists/*

# Copy built output and production deps
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/api/package.json packages/api/
COPY --from=build /app/packages/api/dist/ packages/api/dist/
COPY --from=build /app/packages/api/public/ packages/api/public/
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/packages/api/node_modules/ packages/api/node_modules/

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DB_PATH=./data/resilience-companion.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/api/dist/index.js"]
