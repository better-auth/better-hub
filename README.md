![Better Hub](readme.png)

# Better Hub

Re-imagining code collaboration — a better place to collaborate on code, for humans and agents.

## Why

At Better Auth, we spend a lot of our time on GitHub. So we decided to build the experience we actually wanted. Better Hub improves everything from the home page to repo overview, PR reviews, and AI integration — faster and more pleasant overall.

## Features

- **Repo overview** — cleaner layout with README rendering, file tree, activity feed
- **PR reviews** — inline diffs, AI-powered summaries, review comments
- **Issue management** — triage, filter, and act on issues faster
- **Ghost (AI assistant)** — review PRs, navigate code, triage issues, write commit messages (`⌘I` to toggle)
- **Command center** — search repos, switch themes, navigate anywhere (`⌘K`)x
- **CI/CD status** — view workflow runs and compare across branches
- **Security advisories** — track vulnerabilities per repo
- **Keyboard-first** — most actions accessible via shortcuts
- **Chrome extension** — adds a "Open in Better Hub" button on GitHub pages

## Tech Stack

| Layer           | Technology                                          |
| --------------- | --------------------------------------------------- |
| Framework       | Next.js 16 + React 19                               |
| Auth            | Better Auth (GitHub OAuth)                          |
| Database        | PostgreSQL (Prisma ORM)                             |
| Cache           | Upstash Redis                                       |
| AI              | Vercel AI SDK, OpenRouter, Anthropic, E2B sandboxes |
| Styling         | Tailwind CSS 4                                      |
| Background jobs | Inngest                                             |
| Memory          | SuperMemory                                         |
| Search          | Mixedbread embeddings                               |
| Package manager | pnpm (monorepo)                                     |

## Quick Start

```bash
# Clone
git clone https://github.com/better-auth/better-hub.git
cd better-hub

# Start PostgreSQL and Redis
docker compose up -d

# Set up environment
cp apps/web/.env.example apps/web/.env
# └─ Edit apps/web/.env with your values

# Install dependencies
pnpm install

# Run database migrations
cd apps/web && npx prisma migrate dev && cd ../..

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
better-hub/
├── apps/
│   └── web/                  # Next.js application
│       ├── prisma/           # Database schema & migrations
│       └── src/
│           ├── app/          # App router pages
│           │   ├── (app)/    # Protected routes (dashboard, repos, PRs, issues)
│           │   └── api/      # API routes (auth, AI, webhooks)
│           ├── components/   # React components
│           ├── hooks/        # Custom React hooks
│           └── lib/          # Utilities (auth, github, redis, db)
├── docker-compose.yml        # PostgreSQL + Redis for local dev
├── pnpm-workspace.yaml       # Monorepo config
└── package.json              # Root scripts (lint, fmt, typecheck)
```

## Environment Variables

See [`apps/web/.env.example`](apps/web/.env.example) for the full list with descriptions. The required variables are:

| Variable                   | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`             | PostgreSQL connection string                                         |
| `UPSTASH_REDIS_REST_URL`   | Redis REST URL (`http://localhost:8079` for docker)                   |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST token (`local_token` for docker)                          |
| `BETTER_AUTH_SECRET`       | 32-char random string for session encryption                         |
| `BETTER_AUTH_URL`          | App base URL (`http://localhost:3000` for dev)                       |
| `GITHUB_CLIENT_ID`        | GitHub OAuth app client ID                                           |
| `GITHUB_CLIENT_SECRET`    | GitHub OAuth app client secret                                       |

## Chrome Extension

Better Hub includes a Chrome extension that adds an "Open in Better Hub" button to GitHub pages.

See the [`apps/web/src/app/(app)/extension`](<apps/web/src/app/(app)/extension>) page in the app for installation instructions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, PR workflow, and code style guidelines.

## License

[MIT](LICENSE)
