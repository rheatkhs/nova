# Debian-based Bun container with glibc for prebuilt canvas and ffmpeg support
FROM oven/bun:1-slim

WORKDIR /app

# Install ffmpeg and curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Application source
COPY tsconfig.json ./
COPY src ./src

# Data directory for SQLite persistence
RUN mkdir -p /app/data && chown -R bun:bun /app/data

# Non-root user (provided by oven/bun)
USER bun

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

CMD ["bun", "src/index.ts"]
