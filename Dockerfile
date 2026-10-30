# Minimal single-stage Bun container
FROM oven/bun:1-alpine

WORKDIR /app

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Application source
COPY tsconfig.json ./
COPY src ./src

# Non-root user (provided by oven/bun)
USER bun

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["bun", "src/index.ts"]
