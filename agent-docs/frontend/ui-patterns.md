# UI Patterns and Libraries

## Styling

### TailwindCSS 4
The app uses TailwindCSS 4 with PostCSS integration (`@tailwindcss/postcss`). Utility classes are the primary styling method. The `tw-animate-css` package provides animation utilities.

### Class Merging
The `cn()` utility function (from `src/lib/utils.ts`) combines `clsx` and `tailwind-merge`:

```typescript
import { cn } from "@/lib/utils";

<div className={cn("base-class", condition && "conditional-class", className)} />
```

Always use `cn()` when merging class names to avoid Tailwind class conflicts.

### Class Variance Authority (CVA)
Component variants are defined using `class-variance-authority`:

```typescript
import { cva } from "class-variance-authority";

const buttonVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", destructive: "...", outline: "..." },
    size: { default: "...", sm: "...", lg: "..." },
  },
  defaultVariants: { variant: "default", size: "default" },
});
```

## Component Libraries

### Radix UI
Unstyled, accessible primitives used for:
- `Dialog` -- Modal dialogs
- `DropdownMenu` -- Context menus and dropdown menus
- `Popover` -- Popovers
- `Tooltip` -- Tooltips
- `Avatar` -- User avatars with fallback
- `Slot` -- Component composition via slot pattern
- `VisuallyHidden` -- Screen reader only content

All Radix components are re-exported with Better Hub styling from `src/components/ui/`.

### cmdk
Command palette component (`src/components/ui/command.tsx`), triggered with `Cmd+K`. Provides fuzzy search across repos, navigation, theme switching, and actions.

### Motion (Framer Motion)
Used for animations throughout the app. Common patterns:
- Page transitions
- Panel slide-in/out (Ghost chat, notification sheet)
- List item animations
- Loading states

## Syntax Highlighting

### Shiki
Two Shiki configurations exist:

- `src/lib/shiki.ts` -- Server-side highlighter for rendering code blocks during SSR
- `src/lib/shiki-client.ts` -- Client-side highlighter for dynamic code highlighting

Code themes are configurable per user:
- `codeThemeLight` -- Light mode theme (default: `vitesse-light`)
- `codeThemeDark` -- Dark mode theme (default: `vitesse-black`)
- Custom themes can be created and stored in `custom_code_themes` table

### Diff Highlighting
The `/api/highlight-diff` endpoint provides server-side syntax highlighting for PR diffs. The `pr-diff-viewer.tsx` component renders highlighted diffs inline.

## Rich Text Editing

### TipTap
Used for comment and markdown editing:

- `@tiptap/react` -- React integration
- `@tiptap/starter-kit` -- Basic editing features
- `@tiptap/extension-link` -- Link support
- `@tiptap/extension-mention` -- @mention support
- `@tiptap/extension-placeholder` -- Placeholder text
- `@tiptap/suggestion` -- Autocomplete suggestions
- `tiptap-markdown` -- Markdown input/output

The mention suggestion system (`src/lib/tiptap-mention.ts`, `src/components/shared/mention-suggestion.tsx`) provides @username autocomplete with GitHub user search.

## Markdown Rendering

Multiple rendering approaches:

- **Server-side**: `react-markdown` with `remark-gfm`, `remark-rehype`, `rehype-raw`, `rehype-sanitize`, `rehype-stringify` in `markdown-renderer.tsx`
- **Client-side**: `client-markdown.tsx` for dynamic markdown updates
- Both support GitHub-Flavored Markdown (tables, task lists, strikethrough, autolinks)

## Theming

### Color Themes (`src/lib/themes/`)

The app supports multiple color themes beyond standard light/dark:

- `themes.tsx` -- Theme definitions (colors, backgrounds)
- `types.ts` -- Theme type interfaces
- `border-radius.ts` -- Border radius presets
- `index.ts` -- Theme exports

Themes are applied via CSS custom properties. The `ColorThemeProvider` component sets the theme based on user preferences.

### System Theme
`next-themes` handles system-level light/dark mode detection. The user can choose: system, light, or dark mode (`UserSettings.colorMode`).

### Code Font
Users can select from preset code fonts and font sizes (`UserSettings.codeFont`, `UserSettings.codeFontSize`).

## Keyboard Shortcuts

`@tanstack/react-hotkeys` provides keyboard shortcut handling. Key shortcuts:
- `Cmd+K` -- Command palette
- `Cmd+I` -- Toggle Ghost AI
- Various navigation shortcuts within views

## URL State Management

`nuqs` manages URL query parameters as React state:

```typescript
import { useQueryState } from "nuqs";
const [tab, setTab] = useQueryState("tab");
```

The `NuqsAdapter` is mounted in the app layout to enable query state throughout the app.

## Icons

`lucide-react` provides the icon set. Icons are tree-shaken at build time.

## Custom Hooks (`src/hooks/`)

| Hook | Purpose |
|---|---|
| `use-readme.ts` | Fetches and caches README content |
| `use-is-mobile.ts` | Detects mobile viewport |
| `use-server-initial-data.ts` | Hydrates server-fetched data into client state |
| `use-mutation.ts` | Optimistic mutation with rollback |
| `use-mutation-subscription.ts` | Subscribe to mutation events across components |
| `use-infinite-scroll.ts` | Infinite scroll pagination |
| `use-click-outside.ts` | Detect clicks outside an element |

## Data Fetching Patterns

### Server Components
Data is fetched directly in server components using functions from `src/lib/github.ts`. No client-side fetching needed for initial renders.

### React Query
`@tanstack/react-query` is used for client-side data fetching where real-time updates or polling are needed.

### Mutation Events
The `MutationEventProvider` / `use-mutation-subscription.ts` pattern enables cross-component communication:

1. Component A performs a mutation (e.g., merges a PR)
2. Component A dispatches a mutation event
3. Components B and C subscribe to that event type and refetch their data

This avoids prop drilling and keeps components loosely coupled.
