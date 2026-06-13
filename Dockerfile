# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14 AS builder
WORKDIR /app

# Build-time defaults for Next.js in CI/container builds.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=true

# Install dependencies first for better layer caching.
COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --ignore-scripts

# Build the web app.
COPY . .
RUN bun run --cwd apps/web postinstall
RUN bun run --cwd apps/web build


FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy the built workspace and runtime dependencies.
COPY --from=builder /app /app

EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/web", "start"]
