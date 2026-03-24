# Architecture Overview

Better Hub is a reimagined GitHub UI for code collaboration, built by the Better Auth team. It provides a faster, more pleasant experience for browsing repos, reviewing PRs, triaging issues, and interacting with an AI assistant (Ghost).

Production URL: `https://www.better-hub.com`

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16 |
| UI | React | 19 |
| Styling | TailwindCSS | 4 |
| Component primitives | Radix UI | - |
| ORM | Prisma | 7 |
| Database | PostgreSQL | 16 |
| Cache | Redis via Upstash REST | 7 |
| Package manager | Bun | 1.3.5 |
| Linter | oxlint | - |
| Formatter | oxfmt | - |
| Language | TypeScript (strict) | 5.7+ |
| Error tracking | Sentry | 10 |
| Hosting | Vercel | - |

## Monorepo Layout

The repo uses Bun workspaces with three packages:

- **`apps/web`** -- The main Next.js application. Contains all pages, API routes, components, and server-side logic.
- **`packages/chrome-extension`** -- Chrome Manifest V3 extension that adds "Open in Better Hub" buttons on GitHub pages and optionally redirects GitHub URLs.
- **`packages/firefox-extension`** -- Firefox equivalent of the Chrome extension.

## Key Dependencies

### GitHub Integration
- `@octokit/rest` -- REST client for all GitHub API calls
- `better-auth` -- Authentication library (built by the same team) with GitHub OAuth

### AI / ML
- `@openrouter/ai-sdk-provider` + `ai` (Vercel AI SDK) -- Model routing and streaming for Ghost AI
- `@ai-sdk/anthropic` -- Anthropic provider for specific AI tasks
- `@mixedbread-ai/sdk` -- Embedding generation and reranking for semantic search
- `supermemory` -- Long-term AI conversation memory
- `e2b` -- Sandboxed code execution environments

### Billing
- `stripe` -- Metered billing and subscriptions
- `@better-auth/stripe` -- Stripe plugin for better-auth

### Background Jobs
- `inngest` -- Durable background functions (embedding content, retrying Stripe usage reports)

### UI
- `radix-ui` -- Accessible UI primitives (dialog, dropdown, tooltip, popover, etc.)
- `cmdk` -- Command palette (`Cmd+K`)
- `shiki` -- Syntax highlighting for code blocks and diffs
- `@tiptap/*` -- Rich text editor for comments and markdown
- `motion` -- Animations
- `lucide-react` -- Icons
- `react-markdown` + remark/rehype plugins -- Markdown rendering
- `nuqs` -- URL query state management
- `next-themes` -- Theme switching

### Data
- `@prisma/client` + `@prisma/adapter-pg` -- ORM with native PostgreSQL adapter
- `@upstash/redis` -- Redis REST client for caching
- `pg` -- PostgreSQL connection pool
- `zod` -- Schema validation

## How They Connect

```
Browser ──► Next.js Middleware (proxy.ts)
              │
              ├── URL rewriting (GitHub-compatible routes)
              ├── Authentication check (better-auth session cookie)
              │
              ▼
         App Router (React Server Components)
              │
              ├── getServerSession() ──► better-auth ──► PostgreSQL
              ├── GitHub data fetching ──► localFirstGitRead pattern
              │     │
              │     ├── Redis cache (Upstash)
              │     ├── DB cache (github_cache_entries)
              │     └── GitHub API (Octokit) + background sync jobs
              │
              ├── AI endpoints ──► OpenRouter / Anthropic
              │     │
              │     ├── Tool calls (GitHub API via Octokit)
              │     ├── E2B sandbox (code execution)
              │     └── Semantic search (Mixedbread embeddings)
              │
              └── Billing ──► Stripe (metered usage)
```
