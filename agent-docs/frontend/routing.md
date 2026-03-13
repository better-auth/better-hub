# Routing

Better Hub implements GitHub-compatible URLs so users can swap `github.com` with `better-hub.com` in any URL. This is achieved through middleware URL rewriting.

## Key Files

- `apps/web/src/proxy.ts` -- Next.js middleware (auth + URL rewriting)
- `apps/web/next.config.ts` -- `rewrites()` config as a fallback layer

## URL Rewriting Strategy

There are two layers of URL rewriting, both achieving the same goal:

### Layer 1: Middleware (`proxy.ts`)

The middleware handles specific GitHub URL patterns that require transformation beyond simple path prefixing:

| GitHub URL | Better Hub Internal Route |
|---|---|
| `/:owner/:repo` | `/repos/:owner/:repo` |
| `/:owner/:repo/pull/:number` | `/repos/:owner/:repo/pulls/:number` |
| `/:owner/:repo/commit/:sha` | `/repos/:owner/:repo/commits/:sha` |
| `/:owner/:repo/actions/runs/:runId` | `/repos/:owner/:repo/actions/:runId` |
| `/:owner/:repo/compare/base...head` | `/repos/:owner/:repo/pulls/new?base=&head=` |

The middleware uses `NextResponse.rewrite()` for transparent rewrites (URL stays the same in the browser) and `NextResponse.redirect()` for the compare URL (which changes the URL).

### Layer 2: Next.js Config Rewrites (`next.config.ts`)

The `beforeFiles` rewrites in `next.config.ts` handle the generic case:

```typescript
rewrites: {
  beforeFiles: [
    // /:owner/:repo/:path* → /repos/:owner/:repo/:path*
    // /:owner/:repo → /repos/:owner/:repo
    // Only when first segment is NOT a known route
  ],
}
```

### Known Routes Exclusion

Both layers maintain a list of first-segment routes that should NOT be rewritten:

**Middleware (`APP_ROUTES`)**:
`dashboard`, `repos`, `issues`, `prs`, `stars`, `settings`, `search`, `trending`, `notifications`, `orgs`, `users`, `api`, `debug`, `_next`

**Next.js Config (`KNOWN_ROUTES`)**:
`api`, `dashboard`, `debug`, `extension`, `issues`, `notifications`, `orgs`, `prompt`, `repos`, `search`, `stars`, `trending`, `users`, `_next`

If the first URL segment matches a known route, the URL is passed through unmodified. Otherwise, it's assumed to be an `/:owner/:repo` pattern and gets rewritten.

## Git Protocol Handling

The middleware detects git client requests and redirects them to GitHub:

```typescript
// Detects: /:owner/:repo/info/refs?service=git-upload-pack
// Detects: /:owner/:repo/git-upload-pack
// Detects: /:owner/:repo/git-receive-pack
// → Redirects to https://github.com/... (307)
```

This ensures `git clone`, `git fetch`, and `git push` work correctly when pointed at Better Hub URLs.

## GitHub Link Interception

The `GitHubLinkInterceptor` component (`src/components/shared/github-link-interceptor.tsx`) intercepts clicks on `github.com` links within the app and rewrites them to Better Hub URLs. Links with `data-no-github-intercept` attribute bypass this behavior.

The `toAppUrl()` function in `github-utils.ts` converts GitHub URLs to Better Hub internal URLs.

## Route Groups

The App Router uses route groups for layout organization:

- `(app)/` -- All authenticated pages. Wrapped in the app layout with navbar, Ghost panel, providers.
- `debug/` -- Debug pages (outside the app group).

## Dynamic Segments

Key dynamic route segments:

| Segment | Purpose |
|---|---|
| `[owner]` | GitHub user or organization login |
| `[repo]` | Repository name |
| `[number]` | Issue or PR number |
| `[sha]` | Commit SHA |
| `[...path]` | File or directory path (catch-all) |
| `[runId]` | CI/CD workflow run ID |
| `[jobId]` | CI/CD job ID |
| `[tag]` | Release tag |
| `[ghsaId]` | GitHub Security Advisory ID |
| `[username]` | GitHub username |
| `[org]` | Organization name |
| `[id]` | Generic ID (prompt requests) |
| `[...sub]` | Sub-pages (catch-all for PR tabs, new PR sub-views) |

## Middleware Matcher

```typescript
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|[^/]+\\.[^/]+$).*)"],
};
```

The middleware runs on all paths except:
- `/api/*` (API routes handle their own auth)
- `/_next/static/*` and `/_next/image/*` (static assets)
- `/favicon.ico` and other root-level files with extensions
