# Project Structure

## Root

```
better-hub/
├── AGENTS.md                  # Agent documentation entry point
├── CONTRIBUTING.md            # Contributor guide
├── README.md                  # Project readme
├── SECURITY.md                # Security policy
├── LICENSE                    # MIT license
├── package.json               # Root workspace config (scripts, devDependencies)
├── tsconfig.json              # Base TypeScript config (strict mode)
├── oxlint.json                # Linter config (plugins: typescript, import, promise, unicorn)
├── bunfig.toml                # Bun configuration
├── docker-compose.yml         # Local dev services (Postgres, Redis, Redis REST proxy)
├── bun.lock / pnpm-lock.yaml  # Lock files
├── apps/                      # Application packages
├── packages/                  # Shared/extension packages
└── agent-docs/                # Agent documentation (this directory)
```

## `apps/web/` -- Main Next.js Application

```
apps/web/
├── package.json               # App dependencies and scripts
├── next.config.ts             # Next.js config (rewrites, images, headers, Sentry)
├── prisma/
│   ├── schema.prisma          # Database schema (20 models)
│   └── migrations/            # Prisma migrations
├── public/
│   ├── extension/             # Extension download assets
│   └── fonts/                 # Custom fonts
├── scripts/
│   └── generate-openrouter-models.mts  # Fetches model pricing from OpenRouter API
└── src/
    ├── proxy.ts               # Next.js middleware (auth, URL rewrites, git redirects)
    ├── app/                   # App Router pages and API routes
    ├── components/            # React components organized by feature
    ├── generated/             # Auto-generated code (Prisma client)
    ├── hooks/                 # Custom React hooks
    └── lib/                   # Core business logic, utilities, stores
```

## `src/app/` -- App Router

### Page Routes (`src/app/(app)/`)

The `(app)` route group wraps all authenticated pages with a shared layout that provides the navbar, session, notifications, Ghost AI chat panel, and theming.

```
(app)/
├── layout.tsx                 # Auth gate, navbar, Ghost chat, theme provider
├── dashboard/page.tsx         # User dashboard (activity feed, repos)
├── repos/page.tsx             # Repository listing
├── repos/[owner]/[repo]/      # Repository detail (has its own layout)
│   ├── layout.tsx             # Repo sidebar, nav tabs, file tree, branch selector
│   ├── page.tsx               # Repo overview (README, file list)
│   ├── blob/[...path]/        # File viewer
│   ├── tree/[...path]/        # Directory viewer
│   ├── pulls/                 # Pull requests list and detail
│   │   ├── page.tsx           # PR list
│   │   ├── new/               # Create PR
│   │   └── [number]/          # PR detail (conversation, diff, files, checks)
│   ├── issues/                # Issues list and detail
│   │   ├── page.tsx
│   │   └── [number]/
│   ├── actions/               # CI/CD workflow runs
│   │   ├── page.tsx
│   │   ├── compare/           # Compare workflow runs
│   │   ├── [runId]/           # Run detail
│   │   └── workflows/[...path]/
│   ├── commits/               # Commit history and detail
│   ├── discussions/           # Repository discussions
│   ├── releases/              # Releases and tags
│   ├── tags/                  # Tag listing
│   ├── security/              # Security advisories
│   ├── people/                # Contributors and org members
│   ├── insights/              # Repository insights
│   ├── settings/              # Repo settings
│   ├── activity/              # Activity feed
│   ├── code/                  # Code search within repo
│   └── prompts/               # Prompt requests
├── issues/page.tsx            # Cross-repo issues view
├── pulls/page.tsx             # Cross-repo PRs view
├── stars/                     # Starred repos
├── trending/page.tsx          # Trending repositories
├── search/page.tsx            # Global search
├── notifications/page.tsx     # Notification center
├── orgs/                      # Organizations listing and detail
├── users/[username]/          # User profile
├── extension/page.tsx         # Browser extension download page
└── [owner]/page.tsx           # Owner profile (redirected via rewrites)
```

### API Routes (`src/app/api/`)

```
api/
├── auth/[...all]/             # better-auth catch-all handler
├── ai/
│   ├── ghost/                 # Ghost AI chat (main endpoint + stream resume)
│   ├── ghost-tabs/            # Ghost tab management
│   ├── chat-history/          # Chat history retrieval
│   ├── commit-message/        # AI commit message generation
│   ├── pr-overview/           # AI PR analysis/summary
│   ├── command/               # AI command execution
│   └── rewrite-prompt/        # AI prompt rewriting
├── billing/
│   ├── balance/               # Credit balance check
│   ├── spending-limit/        # Spending limit management
│   └── welcome/               # Welcome credit grant
├── search-*/                  # Search endpoints (repos, issues, PRs, code, users)
├── repo-files/                # Repository file listing
├── file-content/              # File content retrieval
├── highlight-code/            # Server-side syntax highlighting
├── highlight-diff/            # Diff syntax highlighting
├── workflow-runs/             # CI/CD workflow data
├── check-status/              # PR check status
├── compare-runs/              # Compare workflow runs
├── merge-conflicts/           # PR merge conflict detection
├── job-logs/                  # CI job log streaming
├── user-*/                    # User data endpoints (profile, repos, scopes, settings)
├── org-repos/                 # Organization repos
├── rate-limit/                # GitHub rate limit status
├── upload/                    # File upload (images)
├── github-image/              # GitHub image proxy
├── extension-download/        # Extension download handler
├── og/                        # OpenGraph image generation
└── inngest/                   # Inngest webhook handler
```

## `src/components/` -- UI Components

Components are organized by feature domain:

```
components/
├── layout/                    # App shell (navbar, nav-aware-content, notification sheet)
├── repo/                      # Repository views (sidebar, nav, code viewer, file tree, etc.) ~38 files
├── pr/                        # Pull request UI (diff viewer, conversation, merge, reviews) ~30 files
├── issue/                     # Issue detail views
├── issues/                    # Issue listing
├── prs/                       # PR listing
├── dashboard/                 # Dashboard widgets
├── search/                    # Search UI
├── settings/                  # User settings
│   └── tabs/                  # Settings tab panels
├── shared/                    # Cross-cutting components ~32 files
│   ├── ai-chat.tsx            # AI chat interface
│   ├── global-chat-panel.tsx  # Ghost panel (slide-out)
│   ├── markdown-renderer.tsx  # Server-side markdown
│   ├── highlighted-code-block.tsx
│   ├── comment.tsx / comment-thread.tsx
│   └── github-link-interceptor.tsx  # Rewrites github.com links to Better Hub
├── ui/                        # Base UI primitives (button, dialog, badge, etc.) ~14 files
├── actions/                   # CI/CD action views
├── discussion/                # Discussion views
├── notifications/             # Notification UI
├── onboarding/                # First-run onboarding overlay
├── orgs/                      # Organization views
├── people/                    # People/contributors views
├── security/                  # Security advisory views
├── trending/                  # Trending repos
├── users/                     # User profile views
│   └── activity-timeline/     # Activity timeline components
├── providers/                 # React context providers
├── extension/                 # Extension promo
├── prompt-request/            # Prompt request UI
├── repos/                     # Repos listing
├── pwa/                       # PWA support
└── theme/                     # Theme provider and selector
```

## `src/lib/` -- Core Logic

```
lib/
├── auth.ts                    # better-auth server config, getServerSession()
├── auth-client.ts             # better-auth React client
├── ai-auth.ts                 # Helper to get Octokit from session for AI routes
├── db.ts                      # Prisma client with PG pool configuration
├── redis.ts                   # Upstash Redis client
├── github.ts                  # GitHub API layer (~7300 lines, all data fetching)
├── github-types.ts            # TypeScript interfaces for GitHub entities
├── github-utils.ts            # Utility functions (language colors, URL helpers)
├── github-scopes.ts           # OAuth scope groups and definitions
├── github-sync-store.ts       # DB/Redis sync job persistence layer
├── github-user-attachments.ts # User attachment handling
├── inngest.ts                 # Background job definitions (embed content, retry billing)
├── mixedbread.ts              # Embedding and reranking client (Mixedbread AI)
├── embedding-store.ts         # Semantic search embedding CRUD
├── chat-store.ts              # Ghost AI conversation persistence
├── repo-data-cache.ts         # Redis cache helpers for repo data
├── repo-data-cache-vc.ts      # Vercel cache layer for repo data
├── readme-cache.ts            # README content cache
├── user-settings-store.ts     # User preferences persistence
├── prompt-request-store.ts    # Prompt request CRUD
├── pinned-repos.ts            # Pinned repos management
├── pinned-items-store.ts      # Pinned items (issues, PRs) management
├── recent-views.ts            # Recently viewed items tracking
├── pr-overview-store.ts       # PR AI analysis cache
├── contributor-score.ts       # Contributor scoring algorithm
├── user-profile-score.ts      # User profile scoring
├── file-tree.ts               # File tree builder from git tree
├── shiki.ts / shiki-client.ts # Syntax highlighter (server and client)
├── diff-preferences.ts        # Diff view preferences
├── extract-snippet.ts         # Code snippet extraction
├── three-way-merge.ts         # Three-way merge for conflict resolution
├── commit-utils.ts            # Commit-related utilities
├── image-upload.ts            # Image upload helpers
├── image-upload-r2.ts         # R2 storage upload
├── resumable-stream.ts        # Resumable AI stream support
├── live-tick.ts               # Live duration ticker
├── mutation-events.ts         # Client-side mutation event system
├── tiptap-mention.ts          # TipTap mention plugin config
├── theme-script.ts            # Theme initialization script
├── utils.ts                   # General utilities (cn, etc.)
├── storage/
│   └── index.ts               # Git storage client (@pierre/storage)
├── billing/
│   ├── config.ts              # Billing constants (welcome credit, cost units, etc.)
│   ├── ai-models.ts           # AI model registry and pricing calculations
│   ├── ai-models.server.ts    # Server-side model helpers
│   ├── openrouter-models.generated.ts  # Auto-generated model catalog
│   ├── credit.ts              # Credit ledger operations
│   ├── spending-limit.ts      # Spending limit management
│   ├── stripe.ts              # Stripe client and metered usage reporting
│   ├── token-usage.ts         # Token usage logging
│   └── usage-limit.ts         # Usage limit checks
├── themes/
│   ├── index.ts               # Theme exports
│   ├── themes.tsx             # Theme definitions
│   ├── types.ts               # Theme type definitions
│   └── border-radius.ts       # Border radius presets
├── auth-plugins/
│   └── pat-signin.ts          # PAT (Personal Access Token) sign-in plugin
├── schemas/                   # (empty — Zod schemas inline)
└── og/                        # OpenGraph image generation helpers
```

## `src/hooks/` -- Custom React Hooks

```
hooks/
├── use-readme.ts              # README content fetching
├── use-is-mobile.ts           # Mobile viewport detection
├── use-server-initial-data.ts # Hydrate server data into client state
├── use-mutation.ts            # Optimistic mutation helper
├── use-mutation-subscription.ts # Subscribe to mutation events
├── use-infinite-scroll.ts     # Infinite scroll pagination
└── use-click-outside.ts       # Click-outside detection
```

## `packages/` -- Browser Extensions

Both extensions share the same architecture:

```
packages/chrome-extension/     # Manifest V3
packages/firefox-extension/    # Manifest V3 (Firefox-compatible)
├── manifest.json              # Extension manifest
├── background.js              # Service worker (URL redirect rules)
├── popup.html / popup.js      # Extension popup UI
├── rules.json                 # Declarative redirect rules
└── icons/                     # Extension icons
```
