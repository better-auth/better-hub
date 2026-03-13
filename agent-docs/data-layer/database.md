# Database

Better Hub uses PostgreSQL as its primary database, accessed through Prisma ORM with a native `pg` adapter for connection pooling.

## Key Files

- `apps/web/prisma/schema.prisma` -- Database schema (20 models)
- `apps/web/prisma/migrations/` -- Prisma migrations
- `apps/web/src/lib/db.ts` -- Prisma client initialization and connection pool config
- `apps/web/src/generated/prisma/` -- Auto-generated Prisma client

## Connection Pool

The pool is configured in `db.ts` with environment-aware settings:

| Setting | Development | Production |
|---|---|---|
| `max` connections | 20 | 5 |
| `idleTimeoutMillis` | 10,000 | 30,000 |
| `connectionTimeoutMillis` | 0 (unlimited) | 5,000 |

Development uses a larger pool because Next.js spawns 10-15 child processes, each needing its own connections. Docker Compose sets `max_connections=300` on PostgreSQL. Production sits behind a managed pooler (PgBouncer/Neon).

The pool is attached to `process` as a singleton (`_proc.__dbPool`) to survive HMR in development.

## Schema Overview

### Authentication (managed by better-auth)

| Model | Purpose |
|---|---|
| `User` | User accounts. Extended with `githubPat`, `onboardingDone`, `aiMessageCount`, `stripeCustomerId`, ban fields |
| `Session` | Active sessions with token, expiry, IP, user agent. Supports impersonation (`impersonatedBy`) |
| `Account` | OAuth accounts (GitHub). Stores encrypted access/refresh tokens, scopes |
| `Verification` | Email/token verification records |

### GitHub Data Sync

| Model | Purpose |
|---|---|
| `GithubCacheEntry` | DB-level cache for GitHub API responses. Keyed by `(userId, cacheKey)`. Stores JSON data + etag + syncedAt |
| `GithubSyncJob` | Background sync job queue. Deduplicated by `(userId, dedupeKey)`. Tracks status, attempts, errors |

### AI / Chat

| Model | Purpose |
|---|---|
| `ChatConversation` | Ghost AI conversations. Keyed by `(userId, contextKey)`. Tracks active stream ID for resumability |
| `ChatMessage` | Individual messages in a conversation. Stores role, content, and `partsJson` for multi-part AI SDK messages |
| `GhostTab` | Ghost panel tab state (tab ID, label, position) |
| `GhostTabState` | Per-user active tab and counter |

### Search

| Model | Purpose |
|---|---|
| `SearchEmbedding` | Semantic search embeddings for viewed PRs/issues. Stores embedding vectors as JSON, content hashes for dedup |

### User Preferences

| Model | Purpose |
|---|---|
| `UserSettings` | User preferences: theme, color theme, Ghost model, code theme, font, API keys, onboarding status |
| `CustomCodeTheme` | User-created custom code syntax themes |
| `PinnedItem` | Pinned issues/PRs per repo per user |

### Billing

| Model | Purpose |
|---|---|
| `Subscription` | Stripe subscription state (plan, status, period, cancellation) |
| `UsageLog` | Per-AI-call billing records. Links to `AiCallLog`. Tracks Stripe reporting status |
| `AiCallLog` | Detailed AI call logs: provider, model, token counts, cost breakdown |
| `CreditLedger` | Credit transactions (grants and expirations) |
| `SpendingLimit` | Per-user monthly spending cap |

### Prompt Requests

| Model | Purpose |
|---|---|
| `PromptRequest` | Community prompt requests tied to repos. Has title, body, status (open/accepted/closed) |
| `PromptRequestComment` | Comments on prompt requests |
| `PromptRequestReaction` | Reactions (emoji) on prompt requests |

### PR Analysis

| Model | Purpose |
|---|---|
| `PrOverviewAnalysis` | Cached AI-generated PR analysis. Keyed by `(owner, repo, pullNumber)`, invalidated when `headSha` changes |

## Prisma Commands

```bash
cd apps/web

# Generate Prisma client (run after schema changes)
bunx prisma generate

# Create a migration
bunx prisma migrate dev --name your_migration_name

# Apply migrations
bunx prisma migrate dev

# Reset database (destructive)
bunx prisma migrate reset

# Open Prisma Studio
bunx prisma studio
```

The `postinstall` script in `apps/web/package.json` runs `prisma generate` automatically on `bun install`. The `build` script also runs `prisma generate` before `next build`.

## Accessing the Database

Always import the Prisma client from `@/lib/db`:

```typescript
import { prisma } from "@/lib/db";

const user = await prisma.user.findUnique({ where: { id: userId } });
```

Never create a new `PrismaClient` instance directly -- the singleton in `db.ts` manages the connection pool.
