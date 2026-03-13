# Environment Variables

All environment variables are defined in `apps/web/.env`. See `apps/web/.env.example` for a template.

## Required Variables

### Authentication

| Variable | Description |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `BETTER_AUTH_SECRET` | 32-char random string for session encryption. Generate with `openssl rand -hex 16` |
| `BETTER_AUTH_URL` | Base URL of the app (e.g., `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_URL` | Public-facing app URL (same as above for local dev) |

### Database

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Docker Compose default: `postgresql://postgres:postgres@localhost:54320/better_hub` |

### Redis

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST API URL. Docker Compose default: `http://localhost:8079` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST API token. Docker Compose default: `local_token` |

## AI (Required for AI Features)

| Variable | Description | Default |
|---|---|---|
| `OPEN_ROUTER_API_KEY` | OpenRouter API key for Ghost AI | (none) |
| `GHOST_MODEL` | Default Ghost model ID | `moonshotai/kimi-k2.5` |
| `GHOST_MERGE_MODEL` | Model for merge conflict resolution | `google/gemini-2.5-pro-preview` |
| `ANTHROPIC_API_KEY` | Anthropic API key for specific tasks | (none) |
| `OPENAPI_KEY` | OpenAI API key (optional, for specific tasks) | (none) |

## Billing (Optional)

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API key. If unset, all billing features are disabled. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_BASE_PRICE_ID` | Stripe Price ID for the base subscription plan |
| `STRIPE_METERED_PRICE_ID` | Stripe Price ID for metered usage |

## Code Execution (Optional)

| Variable | Description |
|---|---|
| `E2B_API_KEY` | E2B API key for sandboxed code execution |
| `E2B_TEMPLATE` | Custom E2B template ID (falls back to default base image) |

## Background Jobs (Optional)

| Variable | Description |
|---|---|
| `INNGEST_EVENT_KEY` | Inngest event key for background job processing |
| `INNGEST_SIGNING_KEY` | Inngest webhook signing key |

## Search and Memory (Optional)

| Variable | Description |
|---|---|
| `MIXEDBREAD_API_KEY` | Mixedbread API key for embeddings and reranking |
| `SUPER_MEMORY_API_KEY` | SuperMemory API key for AI conversation memory |

## Git Storage (Optional)

| Variable | Description |
|---|---|
| `GIT_STORAGE_PRIVATE_KEY` | Private key for `@pierre/storage` Git storage client |

## Integrations (Optional)

| Variable | Description |
|---|---|
| `SLACK_CLIENT_ID` | Slack app client ID for notifications |
| `SLACK_CLIENT_SECRET` | Slack app client secret |
| `VERCEL_OIDC_TOKEN` | Vercel OIDC token for deployment auth |

## Error Tracking (Optional)

| Variable | Description |
|---|---|
| `SENTRY_DSN` | Sentry Data Source Name |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source map uploads |

## Docker Compose Variables

The Docker Compose file uses these with defaults:

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL password |
| `SRH_TOKEN` | `local_token` | Redis REST proxy token |

## Minimal Local Setup

For basic local development, you need at minimum:

```env
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
BETTER_AUTH_SECRET=any_32_character_random_string_here
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:54320/better_hub
UPSTASH_REDIS_REST_URL=http://localhost:8079
UPSTASH_REDIS_REST_TOKEN=local_token
```

AI features require `OPEN_ROUTER_API_KEY` at minimum. All other variables are optional and enable additional features when provided.
