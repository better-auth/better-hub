# Development Setup

## Prerequisites

- **Node.js** 22+
- **Bun** (package manager, v1.3.5+)
- **Docker** (for PostgreSQL and Redis)
- A **GitHub OAuth App** ([create one here](https://github.com/settings/developers))

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/better-auth/better-hub.git
cd better-hub

# 2. Use the repo Node version
nvm use

# 3. Start PostgreSQL and Redis
docker compose up -d

# 4. Configure environment
cp apps/web/.env.example apps/web/.env
# Fill in required values (see environment.md)

# 5. Install dependencies
bun install

# 6. Run database migrations
cd apps/web && bunx prisma migrate dev && bunx prisma generate && cd ../..

# 7. Start dev server
bun dev
```

The app will be available at `http://localhost:3000`.

## Docker Compose Services

Defined in `docker-compose.yml`:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `127.0.0.1:54320` | PostgreSQL database (`max_connections=300`) |
| `redis` | `redis:7-alpine` | (internal) | Redis cache |
| `redis-rest` | `hiett/serverless-redis-http` | `127.0.0.1:8079` | Upstash-compatible REST API proxy for Redis |

The Redis REST proxy emulates the Upstash REST API locally, so the same `@upstash/redis` client works in both development and production.

Default connection strings:
- PostgreSQL: `postgresql://postgres:postgres@localhost:54320/better_hub`
- Redis REST: `http://localhost:8079` with token `local_token`

## Development Scripts

Run from the repo root:

| Command | Description |
|---|---|
| `bun dev` | Start all apps in dev mode (Next.js dev server) |
| `bun lint` | Run oxlint across `apps/` and `packages/` |
| `bun lint:fix` | Run oxlint with auto-fix |
| `bun fmt` | Format with oxfmt |
| `bun fmt:check` | Check formatting (CI mode) |
| `bun typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `bun check` | Run lint + fmt:check + typecheck (full CI check) |
| `bun fix` | Run lint:fix + fmt (fix everything) |
| `bun build` | Build all workspaces |

### Web App Scripts (`apps/web/`)

| Command | Description |
|---|---|
| `bun dev` | Next.js dev server |
| `bun build` | `prisma generate && next build` |
| `bun start` | Next.js production server |
| `bun test` | Run tests with Vitest |
| `bun generate:models` | Refresh AI model catalog from OpenRouter API |
| `bun generate:models:check` | Verify model catalog is up to date |

## Pre-Commit Hooks

Configured via `simple-git-hooks` + `lint-staged`:

```json
{
  "pre-commit": "bun lint-staged"
}
```

Lint-staged runs on staged files:
- `*.{ts,tsx,js,jsx}` -> `oxfmt --write` + `oxlint --fix`
- `*.json` -> `oxfmt --write`

After cloning, run `bun prepare` (or `bun install`, which triggers `postinstall`) to set up the git hooks.

## Linting and Formatting

### oxlint (`oxlint.json`)
- Plugins: `typescript`, `import`, `promise`, `unicorn`
- Key rules: `eqeqeq: error`, `no-var: error`, `prefer-const: error`, `no-unused-vars: warn`
- Ignores: `node_modules`, `dist`, `.git`, `.next`

### oxfmt
- Configured via `.oxfmtignore` for file exclusions
- Handles TypeScript, JavaScript, JSON, and YAML files

## TypeScript Configuration

Root `tsconfig.json` sets strict defaults:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

Notable strict settings:
- `noUncheckedIndexedAccess` -- Array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes` -- Distinguishes between `undefined` and missing
- `verbatimModuleSyntax` -- Requires explicit `type` imports

## Database Management

```bash
cd apps/web

# Create a new migration
bunx prisma migrate dev --name migration_name

# Apply pending migrations
bunx prisma migrate dev

# Generate Prisma client (after schema changes)
bunx prisma generate

# Open Prisma Studio (database GUI)
bunx prisma studio

# Reset database (drops all data)
bunx prisma migrate reset
```

## Testing

Tests use Vitest (`vitest` v4):

```bash
cd apps/web
bun test
```

Test files follow the `*.test.ts` convention (e.g., `extract-snippet.test.ts`).
