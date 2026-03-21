# Caching

Better Hub uses a multi-tier caching strategy to minimize GitHub API calls and maximize page load speed.

## Key Files

- `apps/web/src/lib/redis.ts` -- Upstash Redis client
- `apps/web/src/lib/repo-data-cache.ts` -- Redis cache helpers for repository data (write path)
- `apps/web/src/lib/repo-data-cache-vc.ts` -- Vercel `unstable_cache` wrappers (read path)
- `apps/web/src/lib/github-sync-store.ts` -- Per-user GitHub cache entries (Redis + DB)
- `apps/web/src/lib/readme-cache.ts` -- README content cache
- `apps/web/src/lib/github.ts` -- Contains the `localFirstGitRead` function that orchestrates all cache layers

## Redis Client

```typescript
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

In local development, Docker Compose provides Redis + a serverless-redis-http proxy on port 8079 that emulates the Upstash REST API.

## Cache Tiers

### Tier 1: Per-User GitHub Cache (Redis)

**Key pattern**: `gh:{userId}:{cacheKey}`

Used for user-specific GitHub data (repos, notifications, etc.). Each user gets their own cache namespace to prevent private data leakage.

Operations in `github-sync-store.ts`:
- `getGithubCacheEntry(userId, cacheKey)` -- Read from Redis
- `upsertGithubCacheEntry(userId, cacheKey, type, data, etag)` -- Write to Redis
- `touchGithubCacheEntrySyncedAt(userId, cacheKey)` -- Update timestamp
- `deleteGithubCacheByPrefix(userId, prefix)` -- Invalidate by prefix

### Tier 2: Shared Cache (Redis)

**Key pattern**: `shared:{cacheKey}`

Used for public data types that are safe to share across users (see `SHAREABLE_CACHE_TYPES` in `github.ts`). This dramatically reduces API calls for popular repos.

Operations:
- `getSharedCacheEntry(cacheKey)` -- Read
- `upsertSharedCacheEntry(cacheKey, type, data, etag)` -- Write
- `touchSharedCacheEntrySyncedAt(cacheKey)` -- Update timestamp
- `deleteSharedCacheByPrefix(prefix)` -- Invalidate

### Tier 3: Repo Data Cache (Redis with TTL)

**Key pattern**: `{suffix}:{owner}/{repo}` (e.g., `repo_languages:vercel/next.js`)

Purpose-built cache for specific repo data with TTL tiers:

| TTL Tier | Duration | Data Types |
|---|---|---|
| `slow` | 24 hours | Languages, contributor avatars |
| `medium` | 1 hour | Branches, tags, file tree, page data |
| `fast` | 5 minutes | PRs, issues, events, CI status |

Cache functions in `repo-data-cache.ts`:
- `setCachedRepoLanguages(owner, repo, data)`
- `setCachedContributorAvatars(owner, repo, data)`
- `setCachedBranches(owner, repo, data)`
- `setCachedTags(owner, repo, data)`
- `setCachedRepoTree(owner, repo, data)`
- `setCachedAuthorDossier(owner, repo, login, data)`
- And corresponding `getCached*` functions

Some cache entries also support per-user scoping: `{suffix}:{userId}:{owner}/{repo}`.

### Tier 4: Vercel Cache (Server Component Caching)

Read wrappers in `repo-data-cache-vc.ts` use Next.js `unstable_cache` with revalidation tags:

```typescript
getCachedRepoTree(owner, repo)       // tag: "repo-tree:{owner}/{repo}"
getCachedContributorAvatars(owner, repo)
getCachedRepoLanguages(owner, repo)
getCachedBranches(owner, repo)
getCachedTags(owner, repo)
```

These read from the Redis cache but add a Vercel-level cache layer for server components, reducing Redis calls during page renders.

### Tier 5: DB Cache (PostgreSQL -- Fallback)

The `github_cache_entries` table serves as the last-resort fallback. If Redis is down or the entry has been evicted, the system falls back to the DB.

This tier has no TTL -- data persists until explicitly overwritten. It ensures the app can still render (with stale data) even when GitHub's API is completely unavailable.

## Cache Invalidation

### Automatic (TTL-based)
Redis entries expire automatically based on their TTL tier.

### Manual (After Mutations)
When users perform write operations, specific caches are invalidated:

```typescript
// After creating/updating an issue
invalidateIssueCache(owner, repo, issueNumber);
invalidateRepoIssuesCache(owner, repo);

// After merging/updating a PR
invalidatePullRequestCache(owner, repo, pullNumber);
invalidateRepoPullRequestsCache(owner, repo);
```

These functions delete the relevant cache entries from both per-user and shared caches.

### Force Refresh
The `forceRefresh` flag on `GitHubAuthContext` bypasses all caches and fetches directly from the GitHub API. This is triggered by explicit user refresh actions.

## Cache Warming

The repo layout pre-warms caches for data that will be needed:

1. `getCachedRepoTree` -- File tree for the sidebar
2. `getCachedContributorAvatars` -- Contributor faces
3. `getCachedRepoLanguages` -- Language breakdown
4. `getCachedBranches` / `getCachedTags` -- Branch/tag selectors
5. `prefetchPRData()` -- Background warmup of PR and issue caches via `waitUntil()`

## GitHub User Data Cache

GitHub user profile data is cached in Redis per access token:

```typescript
redis.set(`github_user:${tokenHash}`, JSON.stringify(userData), { ex: 3600 });
```

This avoids repeated `/user` API calls during a session. The token is hashed before being used as a cache key.
