# GitHub Data Synchronization

The sync system keeps locally cached GitHub data fresh by running background jobs that fetch updated data from the API.

## Key Files

- `apps/web/src/lib/github-sync-store.ts` -- CRUD for sync jobs and cache entries
- `apps/web/src/lib/github.ts` -- Contains `localFirstGitRead()`, `drainGithubSyncJobs()`, and job enqueue logic

## How It Works

### Job Lifecycle

```
Data requested (page load)
    │
    ├── Cache HIT (fresh) → return cached data, done
    │
    └── Cache MISS or stale
        │
        ├── Fetch from GitHub API directly
        ├── Update cache with result
        └── Enqueue sync job for next refresh
            │
            ▼
        GithubSyncJob created
        (status: "pending", dedupeKey prevents duplicates)
            │
            ▼
        drainGithubSyncJobs(userId) picks up job
            │
            ├── Claims job (status: "running")
            ├── Fetches data from GitHub API
            ├── Updates cache (Redis + optionally DB)
            ├── Marks job succeeded (deletes it)
            │
            └── On failure:
                ├── Increments attempts counter
                ├── Records error message
                └── Schedules next attempt (backoff)
```

### Job Deduplication

Jobs are deduplicated by `(userId, dedupeKey)` via a unique constraint on the `github_sync_jobs` table. If a job already exists for the same user and data type, a new one is not created. This prevents flooding the job queue when a user rapidly navigates pages.

### Job Draining

The `drainGithubSyncJobs()` function:

1. Claims a batch of pending jobs for the user (`claimDueGithubSyncJobs`)
2. Processes each job by calling the appropriate GitHub API
3. On success, marks the job completed and updates the cache
4. On failure, marks the job failed with error details
5. Uses a per-user lock (`githubSyncDrainingUsers` Set) to prevent concurrent drains for the same user

Draining is triggered by `waitUntil()` during page loads -- it runs in the background after the response is sent.

## Sync Store Operations

### Cache Entry Operations

```typescript
// Read
getGithubCacheEntry<T>(userId, cacheKey): GithubCacheEntry<T> | null
getSharedCacheEntry<T>(cacheKey): GithubCacheEntry<T> | null

// Write
upsertGithubCacheEntry<T>(userId, cacheKey, cacheType, data, etag?)
upsertSharedCacheEntry<T>(cacheKey, cacheType, data, etag?)

// Touch (update syncedAt without changing data)
touchGithubCacheEntrySyncedAt(userId, cacheKey)
touchSharedCacheEntrySyncedAt(cacheKey)

// Delete
deleteGithubCacheByPrefix(userId, prefix)
deleteSharedCacheByPrefix(prefix)
```

Cache entries are stored in Redis with the structure:

```typescript
interface GithubCacheEntry<T> {
  data: T;
  syncedAt: string;  // ISO timestamp
  etag: string | null;
}
```

### Sync Job Operations

```typescript
// Enqueue
enqueueGithubSyncJob(userId, dedupeKey, jobType, payload)

// Claim (for processing)
claimDueGithubSyncJobs(userId, limit): GithubSyncJob[]

// Complete
markGithubSyncJobSucceeded(jobId)
markGithubSyncJobFailed(jobId, error)
```

## Configuration

| Constant | Value | Purpose |
|---|---|---|
| `MAX_ATTEMPTS` | 8 | Maximum retry attempts before giving up |
| `RUNNING_JOB_TIMEOUT_MS` | 10 minutes | Stuck job detection threshold |

## Job Payload

All sync jobs carry a typed payload:

```typescript
interface GitDataSyncJobPayload {
  owner?: string;
  repo?: string;
  sort?: RepoSort;
  perPage?: number;
  path?: string;
  ref?: string;
  treeSha?: string;
  recursive?: boolean;
  username?: string;
  orgName?: string;
  state?: "open" | "closed" | "all";
  query?: string;
  issueNumber?: number;
  pullNumber?: number;
  language?: string;
  since?: "daily" | "weekly" | "monthly";
}
```

The payload contains all the parameters needed to re-fetch the data from the GitHub API when the job runs.

## ETag Support

Cache entries store GitHub's ETag header value. When refreshing data, the sync job can send the ETag in an `If-None-Match` header. If GitHub returns 304 (Not Modified), the job simply touches the `syncedAt` timestamp without updating the data. This saves bandwidth and API quota.
