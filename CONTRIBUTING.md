# Contributing to Better Hub

Thanks for your interest in contributing! This guide covers what you need to get started.

## Prerequisites

- **Node.js** 22+
- **Bun**
- **Docker** (for PostgreSQL)
- A **GitHub OAuth App** ([create one here](https://github.com/settings/developers))

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/better-auth/better-hub.git
cd better-hub

# 2. Use the repo Node version
nvm use

# 3. Start PostgreSQL
docker compose up -d

# 4. Configure environment
cp apps/web/.env.example apps/web/.env
# └─ Fill in required values

# 5. Install dependencies
bun install

# 6. Run database migrations
cd apps/web && npx prisma migrate dev && npx prisma generate && cd ../..

# 7. Start dev server
bun dev
```

## Development Scripts

Run from the repo root:

```bash
bun dev          # Start all apps in dev mode
bun lint         # Run oxlint
bun lint:fix     # Run oxlint with auto-fix
bun fmt          # Format with oxfmt
bun fmt:check    # Check formatting
bun typecheck    # TypeScript type checking
bun check        # Run lint + fmt:check + typecheck
```

## Pull Request Workflow

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `bun check` to verify lint, format, and types pass
4. Push your branch and open a PR against `main`
5. Fill out the PR description — explain what changed and why

## Code Style

- **Linter**: oxlint (run `bun lint`)
- **Formatter**: oxfmt (run `bun fmt`)
- No manual style decisions — let the tools handle it

## Commit Conventions

Use clear, descriptive commit messages:

```
feat: add PR review comment threading
fix: handle null labels in issue list
refactor: extract cache helpers to shared module
docs: update env variable descriptions
```

Prefix with `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, or `test:`.

## Reporting Issues

Use [GitHub Issues](https://github.com/better-auth/better-hub/issues) to report bugs or suggest features. Include steps to reproduce for bugs.

## Security

For security vulnerabilities, see [SECURITY.md](SECURITY.md). Do not open public issues for security bugs.
