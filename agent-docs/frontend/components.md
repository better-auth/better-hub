# Component Organization

Components live in `apps/web/src/components/` and are organized by feature domain. The app uses React Server Components by default (Next.js App Router), with client components marked explicitly with `"use client"`.

## Directory Structure

### `layout/` -- App Shell (3 files)

- `navbar.tsx` -- Top navigation bar with user menu, notifications, command palette trigger
- `nav-aware-content.tsx` -- Content wrapper that adjusts for navbar visibility
- `notification-sheet.tsx` -- Slide-out notification panel

### `repo/` -- Repository Views (39 files)

The largest component group, covering all repository UI:

**Layout**

- `repo-layout-wrapper.tsx` -- Outer wrapper managing sidebar + content split
- `repo-sidebar.tsx` -- Left sidebar: description, stats, topics, license, links, contributors, languages
- `repo-sidebar-identity.tsx` -- Shared repo header (breadcrumb, owner avatar image, description, badges) used by `repo-sidebar.tsx` and `storage-repo-sidebar.tsx`
- `storage-repo-sidebar.tsx` -- Git storage (`/s/...`) sidebar; same identity block as GitHub repos, plus storage-specific info
- `repo-nav.tsx` -- Tab navigation (Code, Issues, PRs, Actions, Discussions, etc.)
- `code-content-wrapper.tsx` -- Wraps code views with file tree and branch selector

**Code Browsing**

- `code-viewer.tsx` / `code-viewer-client.tsx` -- File content display with syntax highlighting
- `file-list.tsx` -- Directory listing (table of files)
- `file-explorer-tree.tsx` -- Sidebar file tree
- `markdown-blob-view.tsx` -- Rendered markdown file view
- `notebook-viewer.tsx` / `notebook-viewer-client.tsx` -- Jupyter notebook rendering
- `document-outline.tsx` -- Markdown heading outline

**Repository Info**

- `repo-overview.tsx` -- Main repo page (README + file list)
- `repo-badge.tsx` -- Repo visibility badge (public/private)
- `repo-breadcrumb.tsx` / `breadcrumb-nav.tsx` -- Path breadcrumbs
- `repo-settings.tsx` -- Repo settings view
- `repo-activity-view.tsx` -- Activity feed
- `insights-view.tsx` -- Repository insights

**Branch/Tag Management**

- `branch-selector.tsx` -- Branch/tag dropdown
- `sidebar-branch-switcher.tsx` -- Sidebar branch switcher
- `tags-list.tsx` -- Tags listing page

**Releases and Commits**

- `releases-list.tsx` -- Releases listing
- `release-detail.tsx` -- Individual release view
- `commits-list.tsx` -- Commit history
- `commit-detail.tsx` -- Individual commit view
- `latest-commit-section.tsx` -- Latest commit display in code view

**Sidebar Sections**

- `sidebar-contributors.tsx` -- Top contributors with avatars
- `sidebar-languages.tsx` -- Language breakdown bar
- `sidebar-used-by.tsx` -- "Used by" section

**Actions**

- `star-button.tsx` -- Star/unstar repo
- `fork-button.tsx` -- Fork repo
- `fork-sync-button.tsx` -- Sync fork with upstream
- `pin-button.tsx` -- Pin repo
- `create-repo-dialog.tsx` -- Create new repo dialog
- `code-toolbar.tsx` -- Code view toolbar
- `readme-toolbar.tsx` -- README view toolbar

**Utilities**

- `repo-revalidator.tsx` -- Triggers background data revalidation

### `pr/` -- Pull Request UI (30 files)

See [features/pr-reviews.md](../features/pr-reviews.md) for detailed documentation.

### `issue/` -- Issue Detail

Components for viewing and interacting with individual issues.

### `issues/` -- Issue Listing

Components for the issues list view with filtering and sorting.

### `prs/` -- PR Listing

Components for the pull requests list view.

### `shared/` -- Cross-Cutting Components (32 files)

Reusable components used across multiple features:

**AI**

- `ai-chat.tsx` -- Chat interface component
- `global-chat-panel.tsx` -- Ghost AI slide-out panel
- `global-chat-provider.tsx` -- Chat state context provider
- `floating-ghost-button.tsx` -- Floating Ghost toggle
- `chat-page-activator.tsx` -- Sets chat context based on current page

**Markdown**

- `markdown-renderer.tsx` -- Server-side markdown rendering
- `client-markdown.tsx` -- Client-side markdown rendering
- `markdown-editor.tsx` -- TipTap-based markdown editor
- `markdown-mention-tooltips.tsx` -- @mention tooltips in markdown
- `markdown-copy-handler.tsx` -- Copy-to-clipboard for code blocks in markdown
- `github-emoji.tsx` -- GitHub emoji rendering

**Code**

- `highlighted-code-block.tsx` -- Syntax-highlighted code block
- `reactive-code-blocks.tsx` -- Interactive code blocks with copy buttons

**Comments**

- `comment.tsx` -- Individual comment component
- `comment-thread.tsx` -- Threaded comment display

**GitHub UI**

- `github-avatar.tsx` -- GitHub user avatar with fallback
- `github-link-interceptor.tsx` -- Rewrites github.com links to Better Hub
- `user-tooltip.tsx` -- User info tooltip on hover
- `label-badge.tsx` -- Issue/PR label badge
- `permission-badge.tsx` -- Repo permission badge
- `reaction-display.tsx` -- Emoji reaction display and picker

**Navigation**

- `navigation-progress.tsx` -- Top loading bar
- `nav-visibility-provider.tsx` -- Navbar visibility context

**Actions**

- `refresh-button.tsx` -- Force refresh button
- `copy-link-button.tsx` -- Copy URL to clipboard
- `pin-button.tsx` -- Pin item button
- `track-view.tsx` -- View tracking component

**Utilities**

- `list-controls.tsx` -- List filtering/sorting controls
- `mention-suggestion.tsx` -- @mention autocomplete
- `mutation-event-provider.tsx` -- Mutation event bus context
- `commit-dialog.tsx` -- Commit creation dialog
- `file-icon.tsx` -- File type icon

### `ui/` -- Base Primitives (14 files)

Low-level UI components, mostly wrapping Radix UI:

- `button.tsx` -- Button with variants (CVA)
- `badge.tsx` -- Badge component
- `dialog.tsx` -- Modal dialog (Radix)
- `sheet.tsx` -- Slide-out sheet (Radix)
- `dropdown-menu.tsx` -- Dropdown menu (Radix)
- `tooltip.tsx` -- Tooltip (Radix)
- `command.tsx` -- Command palette (cmdk)
- `resize-handle.tsx` -- Draggable resize handle
- `time-ago.tsx` -- Relative time display
- `live-duration.tsx` -- Live updating duration
- `logo.tsx` -- Better Hub logo
- `agent-icon.tsx` -- AI agent icon
- `github-background.tsx` -- GitHub-style background pattern
- `halftone-background.tsx` -- Halftone dot background

### Other Feature Directories

| Directory                  | Purpose                         |
| -------------------------- | ------------------------------- |
| `dashboard/`               | Dashboard page widgets          |
| `search/`                  | Search UI and results           |
| `settings/`                | User settings panels            |
| `settings/tabs/`           | Individual settings tab content |
| `actions/`                 | CI/CD workflow views            |
| `discussion/`              | Discussion UI                   |
| `notifications/`           | Notification list and items     |
| `onboarding/`              | First-run onboarding overlay    |
| `orgs/`                    | Organization views              |
| `people/`                  | People/contributors views       |
| `security/`                | Security advisory views         |
| `trending/`                | Trending repos view             |
| `users/`                   | User profile views              |
| `users/activity-timeline/` | Activity timeline components    |
| `repos/`                   | Repository listing views        |
| `prompt-request/`          | Prompt request UI               |
| `extension/`               | Browser extension promo         |
| `providers/`               | React context providers         |
| `pwa/`                     | PWA support                     |
| `theme/`                   | Theme provider and selector     |

## Component Patterns

### Server vs Client Components

- **Server components** (default): Used for data fetching, database access, rendering with session context. No `"use client"` directive.
- **Client components**: Used for interactivity (event handlers, state, effects). Marked with `"use client"` at the top.

### Data Passing

Server components fetch data and pass it as props to client components. The `use-server-initial-data.ts` hook pattern hydrates server-fetched data into client state without refetching.

### Optimistic Updates

The `use-mutation.ts` hook provides optimistic update support. `MutationEventProvider` and `use-mutation-subscription.ts` enable cross-component communication after mutations.
