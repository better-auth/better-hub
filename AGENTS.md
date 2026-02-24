# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Better Hub is a pnpm monorepo containing a Next.js 16 web app (`apps/web`) that provides an enhanced GitHub UI with AI features. The main tech stack is TypeScript, Next.js (App Router), Prisma 7 + PostgreSQL, Upstash Redis, and better-auth with GitHub OAuth.

### Services

| Service | Required | How to run |
|---|---|---|
| PostgreSQL 16 | Yes | `sudo dockerd &>/dev/null &` then `sudo docker compose up -d postgres` from repo root (port 54320) |
| Next.js dev server | Yes | `pnpm dev` from `apps/web/` (port 3000) |
| Inngest dev server | No | `npx inngest-cli@latest dev` (port 8288) — only needed for background embedding jobs |

### Environment variables

The Cursor Cloud VM may inject placeholder secrets (e.g. `UPSTASH_REDIS_REST_URL`) into the system environment. Since `dotenv/config` (used by Prisma and the app) does **not** override existing env vars, you must `export` correct values in the shell before running `pnpm dev` or Prisma commands. Key variables to export:

- `DATABASE_URL` — set to the local PostgreSQL connection string (postgres user, port 54320, database better_hub) `# pragma: allowlist secret`
- `BETTER_AUTH_SECRET` — any random base64 string (use `openssl rand -base64 32`)
- `BETTER_AUTH_URL` — set to the local dev server URL (port 3000)
- `NEXT_PUBLIC_APP_URL` — same as BETTER_AUTH_URL
- `UPSTASH_REDIS_REST_URL` — must start with `https://`; use any valid HTTPS URL as placeholder
- `UPSTASH_REDIS_REST_TOKEN` — any non-empty string

Without valid `UPSTASH_REDIS_REST_URL` (must start with `https://`), the Redis client throws `UrlError` at import time and the app returns 500.

### Commands reference

- **Install deps:** `pnpm install` (from repo root)
- **Lint:** `pnpm lint` (oxlint — warnings are expected, 0 errors is passing)
- **Format check:** `pnpm fmt:check` (oxfmt)
- **Typecheck:** `pnpm typecheck`
- **Full check:** `pnpm check` (lint + fmt:check + typecheck)
- **Prisma migrate:** `cd apps/web && pnpm prisma migrate deploy`
- **Prisma generate:** `cd apps/web && pnpm prisma generate` (also runs via `postinstall`)
- **Dev server:** `cd apps/web && pnpm dev`

### Docker in Cloud VM

Docker must be started manually since the VM doesn't use systemd:

```bash
sudo dockerd &>/dev/null &
sleep 3
```

The Docker daemon is configured with `fuse-overlayfs` storage driver and `iptables-legacy`.

### Gotchas

- The `.env` file at `apps/web/.env` is loaded by Next.js and Prisma, but system-level env vars take precedence. Always `export` critical env vars in the shell.
- Prisma client is generated into `apps/web/src/generated/prisma/` — regenerate after schema changes with `pnpm prisma generate` in `apps/web/`.
- The `pnpm install` warning about "Ignored build scripts" for `@prisma/engines`, `esbuild`, `sharp`, etc. is expected — the `pnpm-workspace.yaml` already has `onlyBuiltDependencies` configured for prisma.
- GitHub OAuth won't work without real `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. The landing page and login button render correctly with placeholders, but actual sign-in requires valid credentials.
