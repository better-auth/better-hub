# Pull Request Reviews

The PR review experience is one of Better Hub's core differentiators. It includes inline diffs, AI-powered summaries, threaded review comments, merge conflict resolution, and CI status integration.

## Key Files

### Pages
- `apps/web/src/app/(app)/repos/[owner]/[repo]/pulls/page.tsx` -- PR listing
- `apps/web/src/app/(app)/repos/[owner]/[repo]/pulls/[number]/page.tsx` -- PR detail
- `apps/web/src/app/(app)/repos/[owner]/[repo]/pulls/[number]/[...sub]/page.tsx` -- PR sub-pages (files, commits, checks)
- `apps/web/src/app/(app)/repos/[owner]/[repo]/pulls/new/page.tsx` -- Create PR

### Components (`src/components/pr/`)

**Layout and Navigation**
- `pr-detail-layout.tsx` -- Main PR detail page layout
- `pr-header.tsx` -- PR title, status, metadata header
- `editable-pr-title.tsx` -- Inline-editable PR title
- `editable-base-branch.tsx` -- Change base branch
- `pr-status-indicator.tsx` -- Open/merged/closed status badge

**Diff Viewing**
- `pr-diff-viewer.tsx` -- Main diff rendering component
- `pr-diff-list.tsx` -- List of changed files with diffs
- `pr-files-list.tsx` -- File listing for "Files changed" tab
- `diff-file-tree.tsx` -- Tree view of changed files
- `diff-snippet-table.tsx` -- Individual diff snippet rendering

**Conversation and Comments**
- `pr-conversation.tsx` -- Full PR conversation timeline
- `pr-comment-form.tsx` -- Comment input (uses TipTap rich text editor)
- `pr-optimistic-comments-provider.tsx` -- Optimistic UI for new comments
- `deleted-comments-context.tsx` -- Tracks deleted comments
- `chat-message-wrapper.tsx` -- Wraps individual messages
- `message-actions-menu.tsx` -- Actions menu on comments (edit, delete, quote)
- `collapsible-description.tsx` -- Collapsible PR description
- `collapsible-review-card.tsx` -- Collapsible review summary card

**Reviews**
- `pr-reviews-panel.tsx` -- Review submissions panel
- `pr-review-form.tsx` -- Submit review form (approve, request changes, comment)

**Merge and CI**
- `pr-merge-panel.tsx` -- Merge controls (merge, squash, rebase)
- `pr-conflict-resolver.tsx` -- Merge conflict resolution UI
- `pr-checks-panel.tsx` -- CI check status listing
- `check-status-badge.tsx` -- Individual check status badge

**AI Integration**
- `pr-overview-panel.tsx` -- AI-generated PR summary/analysis
- `pr-author-dossier.tsx` -- AI-generated author context
- `pr-author-dossier-lazy.tsx` -- Lazy-loaded variant

**Activity Groups**
- `commit-activity-group.tsx` -- Grouped commit activity in timeline
- `bot-activity-group.tsx` -- Grouped bot activity in timeline

## PR Data Flow

### Loading a PR Detail Page

1. The page component calls `getPullRequest(owner, repo, number)` which fetches:
   - PR metadata (title, body, state, author, labels, assignees)
   - PR files (changed files with patches)
   - PR reviews and review comments
   - PR commits
   - PR check status
2. Data is fetched using the `localFirstGitRead` pattern (cache-first)
3. The `prefetchPRData()` function is called in the repo layout to warm caches

### PR Overview (AI Analysis)

The AI PR overview is generated via `/api/ai/pr-overview`:

1. Client requests an overview for a specific PR
2. Server checks the `pr_overview_analyses` table for a cached analysis matching the current `headSha`
3. If no cache or SHA mismatch, generates a new analysis using the AI model
4. The analysis is streamed to the client and cached in the DB
5. The `pr-overview-panel.tsx` component displays: summary, key changes, risk assessment, and suggested reviewers

### Creating a PR

The create PR flow (`pulls/new/page.tsx`) supports:
- GitHub Desktop / `gh pr create` compatible URLs via middleware rewriting of `/compare/base...head`
- Pre-filling title and body from URL query parameters
- Branch comparison view with diff preview

### Merge Panel

The `pr-merge-panel.tsx` supports three merge strategies:
- **Merge commit** -- Standard merge
- **Squash and merge** -- Squash all commits
- **Rebase and merge** -- Rebase onto base branch

It also shows merge requirements (required reviews, CI checks) and handles merge conflicts.

### Conflict Resolution

The `pr-conflict-resolver.tsx` provides an in-browser conflict resolution experience:
- Uses `three-way-merge.ts` for merge conflict detection
- Can invoke Ghost AI (using the `mergeConflict` model, defaulting to Gemini 2.5 Pro) to suggest resolutions
- Presents a side-by-side view of conflicting changes

## Related API Routes

- `/api/merge-conflicts` -- Fetches merge conflict data for a PR
- `/api/check-status` -- Fetches CI check status for a PR
- `/api/highlight-diff` -- Server-side syntax highlighting for diff content
- `/api/ai/pr-overview` -- AI-generated PR analysis
- `/api/ai/commit-message` -- AI commit message suggestions
