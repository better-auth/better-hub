# Deployment

## Hosting

Better Hub is deployed on **Vercel**. The production URL is `https://www.better-hub.com`.

## CI/CD

### GitHub Actions (`.github/workflows/ci.yml`)

The CI pipeline runs on pushes to `main` and on pull requests:

```
lint ──┐
format ├──► build
typecheck┘
```

| Job | Command | Purpose |
|---|---|---|
| `Lint` | `bun lint` | oxlint checks |
| `Format` | `bun fmt:check` | oxfmt formatting verification |
| `Typecheck` | `bun typecheck` | TypeScript type checking |
| `Build` | `bun run build` | Full production build (depends on all above passing) |

All jobs use:
- `actions/checkout@v4`
- `oven-sh/setup-bun@v2`
- `bun install --frozen-lockfile`

The build job sets `SKIP_ENV_VALIDATION=true` to allow building without real environment variables.

## Error Tracking

### Sentry (`@sentry/nextjs` v10)

Configured in `next.config.ts` via `withSentryConfig()`:

- **Org**: `better-hub`
- **Project**: `javascript-nextjs`
- **Tunnel route**: `/monitoring` -- Routes browser Sentry requests through Next.js to circumvent ad-blockers
- **Source maps**: Uploaded with `widenClientFileUpload: true` for better stack traces
- **Silent mode**: Only prints source map upload logs in CI (`!process.env.CI`)
- **Tree-shaking**: Debug logging is removed from production bundles

### Vercel Cron Monitors
`automaticVercelMonitors: true` enables automatic instrumentation of Vercel Cron jobs.

## Security Headers

All responses include security headers (configured in `next.config.ts`):

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |

## Image Optimization

Remote image patterns are allowlisted in `next.config.ts`:

- `avatars.githubusercontent.com`
- `*.githubusercontent.com`
- `github.com`
- `opengraph.githubassets.com`
- `raw.githubusercontent.com`
- `user-images.githubusercontent.com`
- `repository-images.githubusercontent.com`
- `better-hub.com`
- `images.better-auth.com`

Image optimization timeout: 3 seconds (`imgOptTimeoutInSeconds`).

## Caching Configuration

Next.js experimental stale times:
- `dynamic`: 300 seconds (5 minutes)
- `static`: 180 seconds (3 minutes)

These control how long dynamically and statically rendered pages can be served from the Vercel edge cache before revalidation.

## OAuth Proxy

For Vercel preview deployments, the `oAuthProxy` plugin redirects OAuth callbacks through the production URL:

```typescript
oAuthProxy({ productionURL: "https://www.better-hub.com" })
```

This is only enabled when `process.env.VERCEL` is set.

## Build Process

The web app build command:

```bash
prisma generate && next build
```

1. Generate the Prisma client from the schema
2. Run the Next.js production build (compiles pages, API routes, generates static assets)

## Background Jobs

Inngest handles background job processing. The webhook endpoint is at `/api/inngest`. In production, Inngest calls this endpoint to trigger functions. The two functions defined:

1. `embed-content` -- Embed PR/issue content when viewed (event-driven)
2. `retry-unreported-usage` -- Retry failed Stripe usage reports (cron: every 10 minutes)
