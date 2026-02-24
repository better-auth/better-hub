# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Better Hub is a reimagined GitHub UI/collaboration platform built as a pnpm monorepo with:
- `apps/web` — Next.js 16 (App Router, React 19) web application
- `packages/chrome-extension` — Chrome extension that redirects GitHub URLs

### Key gotcha: Secret environment variable conflicts

Cloud Agent VMs inject secrets as real OS-level environment variables that **override** `.env` file values.
The `UPSTASH_REDIS_REST_URL` secret must start with `https://`; if the injected value is invalid, every
page will 500 because `src/lib/redis.ts` instantiates the Upstash client at module-level. To work around
this, start the dev server (and run builds) with `env -u` to strip all injected secrets so that the
`.env` file values take effect:

```bash
cd apps/web
env -u UPSTASH_REDIS_REST_URL -u UPSTASH_REDIS_REST_TOKEN -u DATABASE_URL \
    -u BETTER_AUTH_URL -u BETTER_AUTH_SECRET -u NEXT_PUBLIC_APP_URL \
    -u GITHUB_CLIENT_ID -u GITHUB_CLIENT_SECRET -u ANTHROPIC_API_KEY \
    -u E2B_API_KEY -u INNGEST_EVENT_KEY -u INNGEST_SIGNING_KEY \
    -u MIXEDBREAD_API_KEY -u OPEN_ROUTER_API_KEY -u SLACK_CLIENT_ID \
    -u SLACK_CLIENT_SECRET -u SUPER_MEMORY_API_KEY -u VERCEL_OIDC_TOKEN \
    -u OPENAPI_KEY \
    npx next dev --port 3000
```

### Services

| Service | How to start | Port |
|---------|-------------|------|
| PostgreSQL | `sudo docker compose up -d` (from repo root) | 54320 |
| Next.js dev | `npx next dev --port 3000` (from `apps/web`, with `env -u` wrapper above) | 3000 |

### Standard commands (from repo root)

See `package.json` scripts:
- **Lint:** `pnpm lint` (oxlint)
- **Format:** `pnpm fmt` / `pnpm fmt:check` (oxfmt)
- **Typecheck:** `pnpm typecheck`
- **Build:** `pnpm build` (needs `env -u` wrapper if secrets are injected)
- **All checks:** `pnpm check`

### Database

- Docker Compose runs PostgreSQL 16 on port 54320 (`docker-compose.yml` at repo root)
- Prisma schema lives at `apps/web/prisma/schema.prisma`
- Run migrations: `cd apps/web && DATABASE_URL="postgresql://postgres:postgres@localhost:54320/better_hub" npx prisma migrate deploy`
- Generate client: `cd apps/web && npx prisma generate`

### .env file

The `.env` file must live at `apps/web/.env`. See `apps/web/.env.example` for all variables.
Critical values for local dev:
- `DATABASE_URL` — must point to local Docker PostgreSQL on port 54320
- `UPSTASH_REDIS_REST_URL` — must start with `https://`
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` — must point to the local dev server origin
