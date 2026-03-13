# Data Flow

This document describes how data moves through Better Hub from an incoming HTTP request to a rendered page.

## Request Lifecycle

### 1. Middleware (`src/proxy.ts`)

Every request first passes through Next.js middleware which handles three concerns:

**Git protocol redirect** -- If the URL matches a git service path (`info/refs?service=git-upload-pack`, `git-receive-pack`), the request is redirected to `github.com` with a 307. This lets `git clone` and `git push` work transparently.

**Authentication** -- Public paths (`/`, `/api/auth`, `/api/inngest`) are allowed through. All other paths require a `better-auth` session cookie. Missing sessions redirect to `/`.

**URL rewriting** -- GitHub-compatible URLs are rewritten to internal App Router paths:
- `/:owner/:repo` -> `/repos/:owner/:repo`
- `/:owner/:repo/pull/:number` -> `/repos/:owner/:repo/pulls/:number`
- `/:owner/:repo/commit/:sha` -> `/repos/:owner/:repo/commits/:sha`
- `/:owner/:repo/compare/base...head` -> `/repos/:owner/:repo/pulls/new?base=&head=`

The `APP_ROUTES` set prevents rewriting known first-segment routes (`dashboard`, `repos`, `api`, `_next`, etc.).

### 2. App Layout (`src/app/(app)/layout.tsx`)

The `(app)` route group layout runs for every authenticated page:

1. Calls `getServerSession()` which is wrapped in React `cache()` for request deduplication
2. If no session exists, redirects to `/` with a `?redirect=` parameter
3. Fetches notifications via `getNotifications()`
4. Checks onboarding status and star state for first-run overlay
5. Wraps children in providers: `NuqsAdapter`, `GlobalChatProvider`, `MutationEventProvider`, `ColorThemeProvider`, `GitHubLinkInterceptor`, `TooltipProvider`
6. Renders: navbar, navigation progress bar, nav-aware content area, Ghost chat panel, onboarding overlay

### 3. Repo Layout (`src/app/(app)/repos/[owner]/[repo]/layout.tsx`)

For repository pages, a nested layout provides:

1. Fetches repo page data via `getRepoPageData()` (repo metadata, nav counts, star status, org membership, latest commit)
2. Loads cached data in parallel: file tree, contributor avatars, languages, branches, tags
3. Prefetches PR data in the background via `waitUntil(prefetchPRData())`
4. Renders: sidebar (description, stats, contributors, languages), repo nav tabs, code content wrapper with file tree and branch selector

### 4. Page Components

Individual pages fetch their specific data using functions from `src/lib/github.ts`. These all use the `localFirstGitRead` pattern described below.

## GitHub Data Fetching: `localFirstGitRead` Pattern

The core data-fetching pattern prioritizes local cache for speed while keeping data fresh via background sync:

```
1. Check Redis cache (gh:{userId}:{cacheKey})
   ├── HIT with fresh data → return immediately
   └── MISS or stale
       │
2. Check shared cache (for public data types)
   ├── HIT → return + enqueue background sync job
   └── MISS
       │
3. Fetch from GitHub API (Octokit)
   ├── SUCCESS → update cache, return data
   └── FAILURE (rate limit, network)
       │
4. Fall back to DB cache (github_cache_entries table)
   ├── HIT → return stale data
   └── MISS → return fallback value
```

**Security model**: Only certain data types are shareable across users (branches, tags, releases, issues, PRs, contributors, etc. -- defined in `SHAREABLE_CACHE_TYPES`). Private repo data and user-specific data is always scoped to the requesting user's cache key.

### Background Sync Jobs

When data is served from cache and may be stale, a sync job is enqueued:

1. Jobs are deduplicated by `(userId, dedupeKey)` -- only one pending job per user per data type
2. The `drainGithubSyncJobs()` function claims and processes jobs for a user
3. Jobs are processed with the user's GitHub token, updating both Redis and DB caches
4. Failed jobs are retried up to 8 times with backoff
5. Running jobs have a 10-minute timeout to prevent stuck jobs

## AI Data Flow

### Ghost Chat (`/api/ai/ghost`)

```
Client message
    │
    ├── Check usage limits (credits, spending cap)
    ├── Resolve model (user preference or "auto" → default model)
    ├── Load/create conversation from DB
    │
    ▼
streamText() with tools
    │
    ├── GitHub tools (via user's Octokit)
    │   ├── get_repo_info, list_issues, list_prs
    │   ├── get_issue, get_pull_request, get_file_content
    │   ├── create_issue, create_pr, add_comment
    │   ├── merge_pr, create_branch, update_file
    │   └── ... (~30 tools)
    │
    ├── Search tools
    │   ├── search_repos, search_code, search_issues
    │   └── semantic_search (Mixedbread embeddings + reranking)
    │
    ├── Code execution (E2B sandbox)
    │
    └── Navigation tools (generate Better Hub URLs)
    │
    ▼
Stream response to client
    │
    ├── Save messages to DB (chat_messages)
    ├── Log token usage (ai_call_logs + usage_logs)
    └── Report to Stripe (metered billing)
```

### Embedding Pipeline (Background)

```
User views PR/Issue
    │
    ▼
Inngest event: app/content.viewed
    │
    ▼
embedContent function
    ├── Embed title + body (Mixedbread mxbai-embed-large-v1)
    ├── Embed comments in batches of 20
    ├── Embed reviews
    └── Store in search_embeddings table (with content hash for dedup)
```

## Caching Tiers

| Tier | TTL | Use Case | Key Pattern |
|---|---|---|---|
| Per-user Redis | Varies | User-specific GitHub data | `gh:{userId}:{cacheKey}` |
| Shared Redis | Varies | Public repo data (branches, tags, etc.) | `shared:{cacheKey}` |
| Repo data cache | 24h / 1h / 5min | Languages, branches, file tree, events | `repo_*:{owner}/{repo}` |
| Vercel cache | `unstable_cache` | Server component data revalidation | Function-based |
| DB cache | Permanent | Fallback when GitHub API is unavailable | `github_cache_entries` table |
| README cache | Medium TTL | Rendered README content | `readme:{owner}/{repo}` |

## Mutation Flow

When users perform write actions (create issue, merge PR, add comment), the flow is:

1. Client calls a mutation function (often via `use-mutation.ts` hook)
2. The function calls the GitHub API directly via Octokit
3. On success, relevant caches are invalidated (`invalidateIssueCache`, `invalidatePullRequestCache`, etc.)
4. A mutation event is dispatched via `MutationEventProvider` to update other components on the page
5. `use-mutation-subscription.ts` hooks in other components react to the event and refetch data
