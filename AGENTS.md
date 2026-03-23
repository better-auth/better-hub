# Better Hub -- Agent Documentation

Better Hub is a reimagined GitHub UI for code collaboration, built by the Better Auth team. It is a Next.js 16 / React 19 monorepo that proxies the GitHub API, adds AI features (Ghost assistant), and provides a faster, keyboard-driven experience for repos, PRs, issues, and CI/CD.

## Production

- Live site: https://better-hub.com

## Design

- Match the design language of the rest of the app.
- Prefer skeleton UI over loading spinners for loading states.

## How to Use These Docs

The `agent-docs/` directory contains detailed documentation organized by topic. Start with the section most relevant to your task. If you need a broad understanding, read **architecture/overview.md** first.

## Keeping Docs Up to Date

When you make changes to the codebase that affect architecture, patterns, configuration, or conventions documented in `agent-docs/`, update the relevant doc files as part of the same change. Examples of when to update:

- Adding or removing a page, API route, or component directory -- update `architecture/project-structure.md` and `frontend/components.md`
- Changing the database schema -- update `data-layer/database.md`
- Adding or modifying environment variables -- update `infrastructure/environment.md`
- Changing the auth flow, caching strategy, or data-fetching patterns -- update the relevant feature or data-layer doc
- Introducing a new major dependency or tool -- update `architecture/overview.md`
- Adding a new feature area -- consider creating a new doc file under the appropriate directory

If a change is significant enough that it would surprise a future agent reading the current docs, the docs need updating. Keep descriptions concise and factual -- document what exists and how it works, not aspirational plans.

## Documentation Index

### Architecture

- [agent-docs/architecture/overview.md](agent-docs/architecture/overview.md) -- Tech stack, monorepo layout, key dependencies, how systems connect
- [agent-docs/architecture/project-structure.md](agent-docs/architecture/project-structure.md) -- Full directory tree with annotations for every folder and key file
- [agent-docs/architecture/data-flow.md](agent-docs/architecture/data-flow.md) -- Request lifecycle, the `localFirstGitRead` caching pattern, AI data flow, mutation flow

### Features

- [agent-docs/features/ghost-ai.md](agent-docs/features/ghost-ai.md) -- Ghost AI assistant: model routing, ~30 tools, conversation persistence, semantic search, E2B sandboxes
- [agent-docs/features/github-integration.md](agent-docs/features/github-integration.md) -- Octokit REST client, ~30 sync job types, shared vs per-user cache security, rate limiting, OAuth scopes
- [agent-docs/features/pr-reviews.md](agent-docs/features/pr-reviews.md) -- PR review system: diff viewing, inline comments, AI summaries, merge panel, conflict resolution, CI checks
- [agent-docs/features/billing.md](agent-docs/features/billing.md) -- Stripe metered billing, credit system, spending limits, AI model pricing, usage tracking

### Data Layer

- [agent-docs/data-layer/database.md](agent-docs/data-layer/database.md) -- Prisma schema (20 models), connection pool config, migration commands
- [agent-docs/data-layer/caching.md](agent-docs/data-layer/caching.md) -- Multi-tier Redis caching: per-user, shared, repo data (TTL tiers), Vercel cache, DB fallback
- [agent-docs/data-layer/github-sync.md](agent-docs/data-layer/github-sync.md) -- Background sync job system: job lifecycle, deduplication, draining, ETag support

### Authentication

- [agent-docs/auth/authentication.md](agent-docs/auth/authentication.md) -- better-auth config, GitHub OAuth, `getServerSession()`, session/cookie handling, PAT sign-in, scopes

### Frontend

- [agent-docs/frontend/routing.md](agent-docs/frontend/routing.md) -- GitHub-compatible URL rewriting, middleware, git protocol redirects, route groups
- [agent-docs/frontend/components.md](agent-docs/frontend/components.md) -- Component organization by domain (~150 components), server vs client patterns
- [agent-docs/frontend/ui-patterns.md](agent-docs/frontend/ui-patterns.md) -- TailwindCSS 4, Radix UI, CVA, Shiki, TipTap, theming, keyboard shortcuts, hooks

### Infrastructure

- [agent-docs/infrastructure/development.md](agent-docs/infrastructure/development.md) -- Local setup, Docker Compose, dev scripts, linting, TypeScript config, testing
- [agent-docs/infrastructure/deployment.md](agent-docs/infrastructure/deployment.md) -- Vercel hosting, GitHub Actions CI, Sentry, security headers, build process
- [agent-docs/infrastructure/environment.md](agent-docs/infrastructure/environment.md) -- All environment variables categorized with descriptions

## Quick Reference

### Critical Files

| File                                     | Purpose                                               |
| ---------------------------------------- | ----------------------------------------------------- |
| `apps/web/src/lib/github.ts`             | All GitHub API data fetching (~7300 lines)            |
| `apps/web/src/lib/auth.ts`               | Authentication config and `getServerSession()`        |
| `apps/web/src/lib/db.ts`                 | Database client and connection pool                   |
| `apps/web/src/proxy.ts`                  | Middleware (auth + URL rewriting)                     |
| `apps/web/src/app/api/ai/ghost/route.ts` | Ghost AI endpoint (~3500 lines)                       |
| `apps/web/prisma/schema/`                | Database schema (multi-file: auth.prisma, app.prisma) |
| `apps/web/next.config.ts`                | Next.js configuration                                 |
| `apps/web/.env.example`                  | Environment variable template                         |

### Common Tasks

**Adding a new page**: Create `page.tsx` in `apps/web/src/app/(app)/your-route/`. It will automatically get the app layout (navbar, Ghost, auth).

**Adding a new API route**: Create `route.ts` in `apps/web/src/app/api/your-endpoint/`. Use `getServerSession()` for auth and `getOctokitFromSession()` for GitHub API access.

**Adding a new component**: Place in the appropriate feature directory under `apps/web/src/components/`. Use `"use client"` only if the component needs interactivity.

**Fetching GitHub data**: Add a function in `apps/web/src/lib/github.ts` using the `localFirstGitRead` pattern. Define the cache key, job type, and remote fetcher.

**Adding a database model**: Add to the appropriate file in `apps/web/prisma/schema/` (`auth.prisma` for better-auth tables, `app.prisma` for everything else), run `bunx prisma migrate dev --name your_migration`, then `bunx prisma generate`.

**Running checks before PR**: Run `bun check` from the repo root (lint + format + typecheck).
