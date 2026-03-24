# Ghost AI Assistant

Ghost is Better Hub's built-in AI assistant. Users toggle it with `Cmd+I`. It can review PRs, navigate code, triage issues, write commit messages, and execute code in sandboxes.

## Key Files

- `apps/web/src/app/api/ai/ghost/route.ts` -- Main Ghost chat endpoint (~3500 lines)
- `apps/web/src/app/api/ai/ghost/[id]/stream/route.ts` -- Stream resume endpoint
- `apps/web/src/app/api/ai/ghost-tabs/route.ts` -- Ghost tab CRUD
- `apps/web/src/app/api/ai/commit-message/route.ts` -- AI commit message generation
- `apps/web/src/app/api/ai/pr-overview/route.ts` -- AI PR analysis/summary
- `apps/web/src/app/api/ai/command/route.ts` -- AI command execution
- `apps/web/src/app/api/ai/rewrite-prompt/route.ts` -- Prompt rewriting
- `apps/web/src/app/api/ai/chat-history/route.ts` -- Chat history retrieval
- `apps/web/src/lib/chat-store.ts` -- Conversation and message persistence (PostgreSQL)
- `apps/web/src/lib/resumable-stream.ts` -- Resumable stream support for AI responses
- `apps/web/src/lib/ai-auth.ts` -- Helper to get Octokit/token from the user's session
- `apps/web/src/components/shared/ai-chat.tsx` -- Chat UI component
- `apps/web/src/components/shared/global-chat-panel.tsx` -- Slide-out Ghost panel
- `apps/web/src/components/shared/global-chat-provider.tsx` -- Chat context provider
- `apps/web/src/components/shared/floating-ghost-button.tsx` -- Floating toggle button
- `apps/web/src/components/shared/chat-page-activator.tsx` -- Sets chat context per page

## Model Configuration

Ghost uses a two-tier model approach:

```typescript
const GHOST_MODELS = {
  default: process.env.GHOST_MODEL || "moonshotai/kimi-k2.5",
  mergeConflict: process.env.GHOST_MERGE_MODEL || "google/gemini-2.5-pro-preview",
};
```

- **"auto" mode** (default): The system picks the model based on the task type. Users see "auto" in settings.
- **User-selected model**: Users can pick a specific model from settings or the command palette. The choice is stored in `UserSettings.ghostModel`.
- **BYOK (Bring Your Own Key)**: Users can provide their own OpenRouter API key via settings (`UserSettings.openrouterApiKey`). When `useOwnApiKey` is true, their key is used instead of the platform key.

All model routing goes through OpenRouter via `@openrouter/ai-sdk-provider`.

## Tool System

Ghost has ~30 tools organized into categories. All tool `execute` functions are wrapped with `withSafeTools()` which catches errors so a single tool failure doesn't crash the stream.

### GitHub Tools (require user's Octokit)
- `get_repo_info` -- Fetch repository metadata
- `list_issues` / `get_issue` -- Browse and read issues
- `list_pull_requests` / `get_pull_request` -- Browse and read PRs
- `get_pull_request_diff` -- Fetch PR diff
- `get_file_content` -- Read file contents from a repo
- `list_repo_files` -- List files in a directory
- `create_issue` -- Create a new issue
- `create_pull_request` -- Create a new PR
- `add_comment` -- Comment on issues/PRs
- `merge_pull_request` -- Merge a PR
- `create_branch` -- Create a new branch
- `update_file` -- Commit file changes
- `create_review` -- Submit a PR review
- `manage_labels` -- Add/remove labels

### Search Tools
- `search_repos` -- Search GitHub repositories
- `search_code` -- Search code across repos
- `search_issues` -- Search issues and PRs
- `semantic_search` -- Search user's viewed content using Mixedbread embeddings and reranking

### Code Execution
- `execute_code` -- Run code in an E2B sandbox. Creates a `Sandbox` instance, writes files, runs commands, and returns output. Billed as a fixed cost.

### Navigation
- `navigate` -- Generate Better Hub URLs for the user to click

## Conversation Persistence

Conversations are stored in PostgreSQL via `chat-store.ts`:

- `ChatConversation` -- Identified by `(userId, contextKey)`. The `contextKey` ties a conversation to a specific context (e.g., `owner/repo` for repo chats, a specific PR URL for PR chats).
- `ChatMessage` -- Messages within a conversation, stored with `role`, `content`, and `partsJson` (for multi-part AI SDK messages).
- `GhostTab` / `GhostTabState` -- Tab management for the Ghost panel (multiple conversations).

The `activeStreamId` on conversations supports resumable streams -- if a response is interrupted, the client can resume from where it left off.

## Semantic Search

Ghost can search the user's previously viewed content:

1. When a user views a PR or issue, an Inngest event (`app/content.viewed`) is fired
2. The `embedContent` function embeds the title, body, comments, and reviews using Mixedbread's `mxbai-embed-large-v1` model
3. Embeddings are stored in the `search_embeddings` table with content hashes for deduplication
4. When Ghost's `semantic_search` tool is called, it:
   - Embeds the query with Mixedbread
   - Searches embeddings using cosine similarity
   - Reranks results with Mixedbread's `mxbai-rerank-large-v1`
   - Returns the top results with snippets

Additionally, SuperMemory (`supermemory` package) provides long-term conversation memory across sessions.

## Usage Tracking

Every Ghost interaction is tracked for billing:

1. `logTokenUsage()` records input/output tokens, model, and calculated cost in `ai_call_logs`
2. Cost is calculated using the model pricing registry in `src/lib/billing/ai-models.ts`
3. A corresponding `usage_logs` entry is created
4. Usage is reported to Stripe as metered billing events
5. Before each request, `checkUsageLimit()` verifies the user has credits and hasn't hit their spending cap

## Cache Invalidation

When Ghost performs write operations (create issue, merge PR, etc.), it invalidates relevant caches:

```typescript
invalidateIssueCache(owner, repo, issueNumber);
invalidateRepoIssuesCache(owner, repo);
invalidatePullRequestCache(owner, repo, prNumber);
invalidateRepoPullRequestsCache(owner, repo);
```

This ensures the UI reflects changes immediately after Ghost acts.
