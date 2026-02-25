"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X, Code2, ChevronRight, Ghost, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIChat } from "@/components/shared/ai-chat";
import { useGlobalChat, type InlineContext } from "@/components/shared/global-chat-provider";
import {
	searchRepoFiles,
	fetchFileContentForContext,
} from "@/app/(app)/repos/[owner]/[repo]/file-search-actions";

// ─── Page hints ─────────────────────────────────────────────────────────────

/** Known top-level app routes that are NOT owner/repo paths */
const KNOWN_PREFIXES = new Set([
	"repos",
	"prs",
	"issues",
	"notifications",
	"settings",
	"search",
	"trending",
	"users",
	"orgs",
	"dashboard",
	"api",
	"collections",
]);

/** Try to match /:owner/:repo from a clean pathname (skipping known app prefixes) */
function matchRepoFromPathname(pathname: string): [string, string] | null {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length < 2) return null;
	if (KNOWN_PREFIXES.has(segments[0])) return null;
	return [segments[0], segments[1]];
}

/** Derive smart suggestions, placeholder, and description from the current pathname */
function getPageHints(pathname: string) {
	const repoMatch = matchRepoFromPathname(pathname);
	if (repoMatch) {
		const [owner, repo] = repoMatch;
		const slug = `${owner}/${repo}`;

		if (/\/pulls\/?$/.test(pathname)) {
			return {
				suggestions: [
					"Show open PRs",
					"Show closed PRs",
					`List issues for ${slug}`,
				],
				placeholder: `Ask about ${slug} pull requests...`,
				description: `Ask about pull requests in ${slug}`,
			};
		}
		if (/\/issues\/?$/.test(pathname)) {
			return {
				suggestions: [
					"Show open issues",
					"Show closed issues",
					`Create an issue`,
				],
				placeholder: `Ask about ${slug} issues...`,
				description: `Ask about issues in ${slug}`,
			};
		}
		if (/\/(tree|blob)\//.test(pathname)) {
			return {
				suggestions: [
					`What does this repo do?`,
					"Star this repo",
					"List issues",
				],
				placeholder: `Ask about ${slug}...`,
				description: `Browsing files in ${slug}`,
			};
		}

		return {
			suggestions: [
				"Star this repo",
				"List open issues",
				"List open PRs",
				"Fork this repo",
			],
			placeholder: `Ask about ${slug}...`,
			description: `Ask about ${slug}, star it, browse issues, and more`,
		};
	}

	if (pathname.startsWith("/prs")) {
		return {
			suggestions: ["Show my open PRs", "Search repos", "Go to notifications"],
			placeholder: "Ask about your pull requests...",
			description: "Ask about your pull requests across repos",
		};
	}

	if (pathname.startsWith("/issues")) {
		return {
			suggestions: ["Show my open issues", "Search repos", "Go to notifications"],
			placeholder: "Ask about your issues...",
			description: "Ask about your issues across repos",
		};
	}

	if (pathname.startsWith("/notifications")) {
		return {
			suggestions: ["Show unread", "Mark all as read", "Go to PRs"],
			placeholder: "Ask about notifications...",
			description: "Manage your GitHub notifications",
		};
	}

	if (pathname.startsWith("/repos")) {
		return {
			suggestions: ["Search repos", "Find trending repos", "Go to notifications"],
			placeholder: "Search or ask about repos...",
			description: "Search and discover GitHub repositories",
		};
	}

	return {
		suggestions: ["Search repos", "Show my notifications", "List my PRs"],
		placeholder: "Ask Ghost anything...",
		description: "Your haunted assistant for all things here.",
	};
}

/**
 * Derive a short context-aware label for a new Ghost tab.
 * Format: "Label · detail" where detail is shown dimmer in the UI.
 */
function getTabLabelFromPathname(pathname: string): string {
	const repoMatch = matchRepoFromPathname(pathname);
	if (repoMatch) {
		const repo = repoMatch[1];
		const prMatch = pathname.match(/\/pulls\/(\d+)/);
		if (prMatch) return `PR #${prMatch[1]} · ${repo}`;
		const issueMatch = pathname.match(/\/issues\/(\d+)/);
		if (issueMatch) return `Issue #${issueMatch[1]} · ${repo}`;
		if (/\/pulls\/?$/.test(pathname)) return `PRs · ${repo}`;
		if (/\/issues\/?$/.test(pathname)) return `Issues · ${repo}`;
		if (/\/commits/.test(pathname)) return `Commits · ${repo}`;
		return repo;
	}
	const userMatch = pathname.match(/^\/users\/([^/]+)/);
	if (userMatch) return userMatch[1];
	if (pathname.startsWith("/prs")) return "My PRs";
	if (pathname.startsWith("/issues")) return "My Issues";
	if (pathname.startsWith("/notifications")) return "Notifs";
	if (pathname.startsWith("/repos")) return "Repos";
	if (pathname.startsWith("/trending")) return "Trending";
	if (pathname.startsWith("/search")) return "Search";
	if (pathname === "/" || pathname.startsWith("/dashboard")) return "Home";
	return "";
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export function GlobalChatPanel() {
	const {
		state,
		tabState,
		closeChat,
		registerContextHandler,
		addTab,
		closeTab,
		switchTab,
		renameTab,
		replaceCurrentTab,
	} = useGlobalChat();
	const [contexts, setContexts] = useState<InlineContext[]>([]);
	const prevContextKeyRef = useRef<string | null>(null);
	const pathname = usePathname();
	const searchParams = useSearchParams();

	// Defer rendering until after hydration — this panel starts hidden (translate-x-full)
	// and depends on client-only state (chat history, persisted context), so SSR is pointless
	// and causes hydration mismatches.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// ── Ghost conversation history ──────────────────────────────────────
	const [ghostHistory, setGhostHistory] = useState<
		{ contextKey: string; title: string; updatedAt: string }[]
	>([]);
	useEffect(() => {
		fetch("/api/ai/chat-history?list=ghost")
			.then((res) => res.json())
			.then((data) => {
				if (data.conversations) {
					setGhostHistory(
						data.conversations.map(
							(c: {
								contextKey: string;
								title: string;
								updatedAt: string;
							}) => ({
								contextKey: c.contextKey,
								title: c.title,
								updatedAt: c.updatedAt,
							}),
						),
					);
				}
			})
			.catch(() => {});
	}, []);

	const handleLoadHistory = useCallback(
		(contextKey: string, title: string) => {
			const tabId = contextKey.split("::")[1];
			if (!tabId) return;
			// If a tab with this ID already exists, just switch to it
			const existing = tabState.tabs.find((t) => t.id === tabId);
			if (existing) {
				switchTab(tabId);
				return;
			}
			// Replace the current (empty) tab with the history conversation
			replaceCurrentTab(tabId, title);
		},
		[tabState.tabs, switchTab, replaceCurrentTab],
	);

	// ── Resizable width ────────────────────────────────────────────────────
	const DEFAULT_PANEL_WIDTH = 380;
	const MIN_PANEL_WIDTH = 320;
	const MAX_PANEL_WIDTH = 700;
	const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

	const handleResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragRef.current = { startX: e.clientX, startWidth: panelWidth };
			const onMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				// Dragging left = increasing width (panel anchored to right)
				const delta = dragRef.current.startX - ev.clientX;
				const raw = dragRef.current.startWidth + delta;
				setPanelWidth(
					Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, raw)),
				);
			};
			const onUp = () => {
				dragRef.current = null;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
		},
		[panelWidth],
	);

	// Active file from URL ?file= param (set by PR diff viewer)
	const activeFile = searchParams.get("file") ?? undefined;

	// Extract mentionable files from PR context
	const mentionableFiles = useMemo(() => {
		const prCtx = state.contextBody?.prContext as
			| { files?: { filename: string; patch: string }[] }
			| undefined;
		if (!prCtx?.files) return undefined;
		return prCtx.files;
	}, [state.contextBody]);

	// # file mention: search repo files
	const repoFileSearch = state.repoFileSearch;

	const handleSearchRepoFiles = useCallback(
		async (query: string) => {
			if (!repoFileSearch) return [];
			return searchRepoFiles(
				repoFileSearch.owner,
				repoFileSearch.repo,
				repoFileSearch.ref,
				query,
			);
		},
		[repoFileSearch],
	);

	const handleFetchFileContent = useCallback(
		async (path: string) => {
			if (!repoFileSearch) return null;
			return fetchFileContentForContext(
				repoFileSearch.owner,
				repoFileSearch.repo,
				path,
				repoFileSearch.ref,
			);
		},
		[repoFileSearch],
	);

	// Clear inline contexts when context key changes
	useEffect(() => {
		if (state.contextKey !== prevContextKeyRef.current) {
			setContexts([]);
			prevContextKeyRef.current = state.contextKey;
		}
	}, [state.contextKey]);

	// Handle @ file mention — creates an InlineContext from a PR file
	const handleAddFileContext = useCallback((file: { filename: string; patch: string }) => {
		const lines = file.patch ? file.patch.split("\n") : [];
		const ctx: InlineContext = {
			filename: file.filename,
			startLine: 1,
			endLine: lines.length,
			selectedCode: file.patch,
			side: "RIGHT",
		};
		setContexts((prev) => {
			const exists = prev.some(
				(c) =>
					c.filename === ctx.filename &&
					c.selectedCode === ctx.selectedCode,
			);
			if (exists) return prev;
			return [...prev, ctx];
		});
	}, []);

	// Navigate to a file (and line) in the PR diff viewer
	const handleNavigateToFile = useCallback((filename: string, line?: number) => {
		const url = new URL(window.location.href);
		url.searchParams.set("file", filename);
		window.history.replaceState(null, "", url.toString());
		// Dispatch a custom event so the diff viewer picks up the change
		window.dispatchEvent(
			new CustomEvent("ghost:navigate-to-file", {
				detail: { filename, line },
			}),
		);
	}, []);

	// Register the context handler for "Ask AI" from diff viewer
	const handleAddContext = useCallback((context: InlineContext) => {
		setContexts((prev) => {
			const exists = prev.some(
				(c) =>
					c.filename === context.filename &&
					c.startLine === context.startLine &&
					c.endLine === context.endLine &&
					c.side === context.side,
			);
			if (exists) return prev;
			return [...prev, context];
		});
	}, []);

	useEffect(() => {
		registerContextHandler(handleAddContext);
	}, [registerContextHandler, handleAddContext]);

	// ── Effective context (page-specific or general) ──────────────────────
	// Ghost sessions are shared across all pages — same threads everywhere.
	// The page-specific context (PR, issue, etc.) is passed in the body
	// so the AI still gets the right tools and context for the current page.

	const hasPageContext = !!(state.contextKey && state.contextBody);

	const effectiveContextKey = "ghost";

	const effectiveContextBody = hasPageContext
		? { ...state.contextBody!, pageContext: { pathname } }
		: { pageContext: { pathname } };

	const effectiveChatType = "general";

	const pageHints = getPageHints(pathname);

	const effectivePlaceholder = hasPageContext
		? contexts.length > 0
			? "Ask about this code..."
			: state.placeholder
		: pageHints.placeholder;

	const effectiveEmptyTitle = hasPageContext ? state.emptyTitle : "Ghost";

	const effectiveEmptyDescription = hasPageContext
		? state.emptyDescription
		: pageHints.description;

	const effectiveSuggestions = hasPageContext ? state.suggestions : pageHints.suggestions;

	// ── Tab state (from context, persisted server-side) ────────────────────

	const activeTabId =
		tabState.tabs.find((t) => t.id === tabState.activeTabId)?.id ||
		tabState.tabs[0]?.id;

	// Clear inline contexts when switching tabs
	const prevActiveTabRef = useRef(activeTabId);
	useEffect(() => {
		if (activeTabId !== prevActiveTabRef.current) {
			setContexts([]);
			prevActiveTabRef.current = activeTabId;
		}
	}, [activeTabId]);

	// ── Inline context chips (input prefix) ───────────────────────────────

	const inputPrefix =
		contexts.length > 0 ? (
			<div className="flex items-center gap-1.5 px-2.5 pt-2">
				{contexts.length === 1 ? (
					<span className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground/70 max-w-[200px]">
						<Code2 className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
						<span className="truncate">
							{contexts[0].filename.split("/").pop()}
							<span className="text-muted-foreground">
								:{contexts[0].startLine}
								{contexts[0].endLine !==
									contexts[0].startLine &&
									`\u2013${contexts[0].endLine}`}
							</span>
						</span>
						<button
							type="button"
							onClick={() => setContexts([])}
							className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground transition-colors cursor-pointer shrink-0"
						>
							<X className="w-2 h-2" />
						</button>
					</span>
				) : (
					<span className="inline-flex items-center gap-1.5 pl-1.5 pr-0.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground/70">
						<Code2 className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
						<span className="size-4 rounded-full bg-foreground/10 flex items-center justify-center text-[9px] font-semibold text-muted-foreground/80 tabular-nums">
							{contexts.length}
						</span>
						<span className="text-muted-foreground/50">
							{contexts.length} files
						</span>
						<button
							type="button"
							onClick={() => setContexts([])}
							className="p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground transition-colors cursor-pointer shrink-0"
						>
							<X className="w-2 h-2" />
						</button>
					</span>
				)}
			</div>
		) : null;

	// Merge inline contexts and active file into the context body
	const contextBody = {
		...effectiveContextBody,
		...(contexts.length > 0 ? { inlineContexts: contexts } : {}),
		...(activeFile ? { activeFile } : {}),
	};

	if (!mounted) return null;

	return (
		<>
			<div
				className={cn(
					"fixed top-10 right-0 z-40 h-[calc(100dvh-2.5rem)] w-full",
					"bg-background border-l border-border",
					"flex flex-row shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.08)] dark:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.25)]",
					"transition-transform duration-300 ease-in-out",
					state.isOpen
						? "translate-x-0"
						: "translate-x-full pointer-events-none",
				)}
				style={{ maxWidth: panelWidth }}
			>
				{/* Resize drag handle */}
				<div
					onMouseDown={handleResizeStart}
					className="hidden sm:flex shrink-0 w-1 cursor-col-resize hover:bg-foreground/10 active:bg-foreground/15 transition-colors"
				/>

				{/* Panel content */}
				<div className="flex-1 min-w-0 flex flex-col">
					{/* Side close tab */}
					<button
						type="button"
						onClick={closeChat}
						className={cn(
							"absolute -left-6 top-1/2 -translate-y-1/2 z-10",
							"flex items-center justify-center pl-1 pr-0.5",
							"w-6 h-10 rounded-l-full",
							"bg-background border border-r-0 border-border/15",
							"text-muted-foreground hover:text-foreground",
							"cursor-pointer transition-all duration-200",
							!state.isOpen && "hidden",
						)}
					>
						<ChevronRight className="w-3 h-3" />
					</button>

					{/* Panel header */}
					<div className="group/header shrink-0 flex items-center gap-1.5 pl-3 pr-2 py-1.5 border-b border-border/60">
						<Ghost className="w-3.5 h-3.5 text-foreground/50" />
						<span className="text-xs font-medium text-foreground/70 truncate">
							Ghost
						</span>
						<button
							type="button"
							onClick={closeChat}
							className="ml-auto p-0.5  rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-150 cursor-pointer"
						>
							<X className="w-3 h-3" />
						</button>
					</div>

					{/* Tab bar */}
					<div className="shrink-0 flex items-center px-1.5">
						<div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
							{tabState.tabs.map((tab) => (
								<button
									key={tab.id}
									type="button"
									onClick={() =>
										switchTab(tab.id)
									}
									className={cn(
										"group flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium shrink-0 transition-all duration-150 cursor-pointer border-b-2",
										tab.id ===
											activeTabId
											? "border-foreground/60 text-foreground/70"
											: "border-transparent text-muted-foreground hover:text-muted-foreground/60",
									)}
								>
									<span className="truncate max-w-[120px]">
										{tab.label.includes(
											" · ",
										) ? (
											<>
												{
													tab.label.split(
														" · ",
													)[0]
												}
												<span className="opacity-40">
													{" "}
													·{" "}
													{
														tab.label.split(
															" · ",
														)[1]
													}
												</span>
											</>
										) : (
											tab.label
										)}
									</span>
									{tabState.tabs.length >
										1 && (
										<span
											role="button"
											tabIndex={0}
											onClick={(
												e,
											) => {
												e.stopPropagation();
												closeTab(
													tab.id,
												);
											}}
											onKeyDown={(
												e,
											) => {
												if (
													e.key ===
													"Enter"
												) {
													e.stopPropagation();
													closeTab(
														tab.id,
													);
												}
											}}
											className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-foreground/10 dark:hover:bg-white/10 transition-opacity cursor-pointer"
										>
											<X className="w-2 h-2" />
										</span>
									)}
								</button>
							))}
						</div>
						<button
							type="button"
							onClick={() =>
								addTab(
									getTabLabelFromPathname(
										pathname,
									),
								)
							}
							className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-150 cursor-pointer ml-1"
							title="New tab"
						>
							<Plus className="w-3 h-3" />
						</button>
					</div>

					{/* Chat content — render all tabs, show only active */}
					{tabState.tabs.map((tab) => {
						const isActive = tab.id === activeTabId;
						return (
							<div
								key={tab.id}
								className={cn(
									"flex-1 min-h-0 flex flex-col",
									!isActive && "hidden",
								)}
							>
								<AIChat
									apiEndpoint="/api/ai/ghost"
									contextBody={contextBody}
									contextKey={
										effectiveContextKey
									}
									persistKey={`${effectiveContextKey}::${tab.id}`}
									chatType={effectiveChatType}
									placeholder={
										effectivePlaceholder
									}
									emptyTitle={
										effectiveEmptyTitle
									}
									emptyDescription={
										effectiveEmptyDescription
									}
									suggestions={
										effectiveSuggestions
									}
									inputPrefix={
										isActive
											? inputPrefix
											: null
									}
									onNewChat={() => {
										setContexts([]);
										const label =
											getTabLabelFromPathname(
												pathname,
											);
										if (
											label &&
											activeTabId
										)
											renameTab(
												activeTabId,
												label,
											);
									}}
									mentionableFiles={
										mentionableFiles
									}
									onAddFileContext={
										handleAddFileContext
									}
									attachedContexts={
										isActive
											? contexts
											: []
									}
									onContextsConsumed={() =>
										setContexts([])
									}
									onSearchRepoFiles={
										repoFileSearch
											? handleSearchRepoFiles
											: undefined
									}
									onFetchFileContent={
										repoFileSearch
											? handleFetchFileContent
											: undefined
									}
									hashMentionPrFiles={
										mentionableFiles
									}
									autoFocus={isActive}
									historyItems={ghostHistory}
									onLoadHistory={
										handleLoadHistory
									}
									onNavigateToFile={
										mentionableFiles
											? handleNavigateToFile
											: undefined
									}
								/>
							</div>
						);
					})}
				</div>
			</div>
		</>
	);
}
