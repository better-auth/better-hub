# GitHub Integration

Better Hub is a client for the GitHub API. All repository data, issues, PRs, notifications, and user information comes from GitHub's REST API via Octokit.

## Key Files

- `apps/web/src/lib/github.ts` -- Primary GitHub API layer (~7300 lines). Contains all data fetching functions.
- `apps/web/src/lib/github-types.ts` -- TypeScript interfaces for GitHub entities (IssueItem, RepoItem, NotificationItem, ActivityEvent, etc.)
- `apps/web/src/lib/github-utils.ts` -- Utility functions: language colors, URL converters (GitHub <-> Better Hub), formatting helpers
- `apps/web/src/lib/github-scopes.ts` -- OAuth scope groups and their descriptions
- `apps/web/src/lib/github-sync-store.ts` -- Persistence layer for cache entries and sync jobs
- `apps/web/src/lib/github-user-attachments.ts` -- User attachment handling
- `apps/web/src/lib/ai-auth.ts` -- Helper to get authenticated Octokit from session

## Authentication Context

Every GitHub API call requires a `GitHubAuthContext`:

```typescript
interface GitHubAuthContext {
  userId: string;
  token: string;
  octokit: Octokit;
  forceRefresh: boolean;
  githubUser: $Session["githubUser"];
}
```

This is constructed from the user's session. The `token` is the OAuth access token stored (encrypted) in the `account` table by better-auth.

## Data Sync Job Types

The system defines ~30 job types for background data synchronization:

| Job Type | Description |
|---|---|
| `user_repos` | User's repositories |
| `repo` | Repository metadata |
| `repo_contents` | Repository file listing |
| `repo_tree` | Git tree (recursive) |
| `repo_branches` | Branch listing |
| `repo_tags` | Tag listing |
| `repo_releases` | Release listing |
| `file_content` | Single file content |
| `repo_readme` | Repository README |
| `repo_issues` | Issue listing |
| `repo_pull_requests` | PR listing |
| `issue` | Single issue detail |
| `issue_comments` | Issue comments |
| `pull_request` | Single PR detail |
| `pull_request_files` | PR changed files |
| `pull_request_comments` | PR review comments |
| `pull_request_reviews` | PR reviews |
| `pull_request_commits` | PR commit history |
| `pr_bundle` | Bundled PR data fetch |
| `repo_contributors` | Contributor listing |
| `repo_workflows` | CI/CD workflow definitions |
| `repo_workflow_runs` | Workflow run history |
| `repo_nav_counts` | Counts for nav tabs (open issues, PRs, active runs) |
| `repo_discussions` | Discussion listing |
| `authenticated_user` | Current user profile |
| `user_orgs` | User's organizations |
| `org` | Organization detail |
| `org_repos` | Organization repositories |
| `org_members` | Organization members |
| `notifications` | User notifications |
| `search_issues` | Issue/PR search |
| `user_events` | User activity events |
| `starred_repos` | Starred repositories |
| `contributions` | Contribution data |
| `trending_repos` | Trending repositories |
| `user_profile` | Public user profile |
| `user_public_repos` | User's public repos |
| `user_public_orgs` | User's public orgs |
| `person_repo_activity` | Person's activity in a repo |

## Shared vs Per-User Caching

The caching system has a critical security distinction:

**Per-user cache**: Data that may contain private information is cached per-user. The cache key includes the user ID: `gh:{userId}:{cacheKey}`. This prevents data from one user's private repos leaking to another user.

**Shared cache**: Public data types defined in `SHAREABLE_CACHE_TYPES` can be shared across users. These include:
- `repo_branches`, `repo_tags`, `repo_releases`
- `repo_issues`, `repo_pull_requests`
- `issue`, `issue_comments`
- `pull_request`, `pull_request_files`, `pull_request_comments`, `pull_request_reviews`, `pull_request_commits`
- `repo_contributors`, `repo_workflows`, `repo_workflow_runs`, `repo_nav_counts`
- `user_profile`, `user_public_repos`, `user_public_orgs`, `user_events`
- `org`, `org_repos`, `org_members`
- `trending_repos`

This distinction is enforced by `isShareableCacheType()`. Any data from repos (code, contents, trees) is **excluded** from the shared cache because private-repo data fetched by one authorized user would leak to others.

## The `localFirstGitRead` Pattern

This is the core data-fetching pattern used by all GitHub data functions:

```typescript
interface LocalFirstGitReadOptions<T> {
  authCtx: GitHubAuthContext | null;
  cacheKey: string;
  cacheType: string;
  fallback: T;
  jobType: GitDataSyncJobType;
  jobPayload: GitDataSyncJobPayload;
  fetchRemote: (octokit: Octokit) => Promise<T>;
}
```

The function:
1. Checks Redis for cached data (per-user, then shared if applicable)
2. If cache miss, fetches from GitHub API directly
3. Updates the cache on successful fetch
4. Enqueues a background sync job for future freshness
5. If the API call fails (rate limit, etc.), falls back to the DB cache
6. If all else fails, returns the provided `fallback` value

## Rate Limit Handling

The `GitHubRateLimitError` class captures rate limit details:

```typescript
class GitHubRateLimitError extends Error {
  readonly resetAt: number;  // unix timestamp (seconds)
  readonly limit: number;
  readonly used: number;
}
```

When a 403 rate limit response is received, the error is thrown and caught at the page level. The `/api/rate-limit` endpoint exposes the current rate limit status to the client.

## GitHub OAuth Scopes

Scopes are organized into groups in `github-scopes.ts`:

- **profile** (required): `user`, `user:email`, `user:follow`
- **public_repos** (required): `public_repo`, `repo:status`, `repo_deployment`, `read:org`
- **private_repos** (optional): `repo` (full access to private repositories)
- **notifications** (optional): `notifications`
- **gist** (optional): `gist`
- **admin** (optional): `admin:repo_hook`, `admin:org`
- **workflow** (optional): `workflow`
- **delete_repo** (optional): `delete_repo`

Users can opt into additional scopes during sign-in or later in settings. The sign-in UI shows each group with its description and reason.

## Repository Permissions

The `extractRepoPermissions()` function normalizes GitHub's permission object:

```typescript
type RepoPermissions = {
  admin: boolean;
  push: boolean;
  pull: boolean;
  maintain: boolean;
  triage: boolean;
};
```

These permissions drive UI decisions like showing merge buttons, edit controls, and settings access.

## Key Data Fetching Functions

The most important functions exported from `github.ts` (non-exhaustive):

- `getRepoPageData(owner, repo)` -- Fetches everything needed for the repo layout
- `getRepoTree(owner, repo, ref, recursive)` -- Git tree for file explorer
- `getFileContent(owner, repo, path, ref)` -- Single file content
- `getRepoPullRequests(owner, repo, state, page)` -- PR listing
- `getPullRequest(owner, repo, number)` -- PR detail with full data
- `getPullRequestFiles(owner, repo, number)` -- Changed files in a PR
- `getRepoIssues(owner, repo, state, page)` -- Issue listing
- `getIssue(owner, repo, number)` -- Issue detail
- `getNotifications(perPage)` -- User notifications
- `getUserRepos(sort, perPage)` -- User's repositories
- `getStarredRepos(username, page)` -- Starred repos
- `getTrendingRepos(language, since)` -- Trending repos
- `prefetchPRData(owner, repo, opts)` -- Background prefetch for PR data
- `checkIsStarred(owner, repo)` -- Check if user starred a repo
- `getForkSyncStatus(owner, repo, branch)` -- Fork behind/ahead status
