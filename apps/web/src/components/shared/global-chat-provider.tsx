"use client";

import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useRef,
	type ReactNode,
} from "react";
import type { GhostTabState } from "@/lib/chat-store";

export interface InlineContext {
	filename: string;
	startLine: number;
	endLine: number;
	selectedCode: string;
	side: "LEFT" | "RIGHT";
}

export interface ChatConfig {
	chatType: "pr" | "issue" | "general";
	contextKey: string;
	contextBody: Record<string, unknown>;
	suggestions?: string[];
	placeholder?: string;
	emptyTitle?: string;
	emptyDescription?: string;
	inputPrefix?: ReactNode;
	repoFileSearch?: { owner: string; repo: string; ref: string };
}

export interface GlobalChatState {
	isOpen: boolean;
	isWorking: boolean;
	chatType: "pr" | "issue" | "general" | null;
	contextKey: string | null;
	contextBody: Record<string, unknown> | null;
	suggestions: string[];
	placeholder: string;
	emptyTitle: string;
	emptyDescription: string;
	repoFileSearch: { owner: string; repo: string; ref: string } | null;
}

export type AddCodeContextFn = (context: InlineContext) => void;

interface GlobalChatContextValue {
	state: GlobalChatState;
	tabState: GhostTabState;
	openChat: (config: ChatConfig) => void;
	setContext: (config: ChatConfig) => void;
	clearContext: () => void;
	closeChat: () => void;
	toggleChat: () => void;
	/** @deprecated Use setWorkingSource instead */
	setIsWorking: (working: boolean) => void;
	/** Register a named working source. isWorking is true when any source is active. */
	setWorkingSource: (key: string, active: boolean) => void;
	addCodeContext: (context: InlineContext) => void;
	registerContextHandler: (fn: AddCodeContextFn) => void;
	addTab: (label?: string, customTabId?: string) => void;
	closeTab: (tabId: string) => void;
	switchTab: (tabId: string) => void;
	renameTab: (tabId: string, label: string) => void;
	replaceCurrentTab: (newId: string, label: string) => void;
	/** Register refetch for ghost history (called when panel mounts). Pass null to unregister. */
	registerGhostHistoryRefetch: (fn: (() => void) | null) => void;
	/** Notify that ghost history changed (e.g. after persist); triggers refetch. */
	notifyGhostHistoryChanged: () => void;
}

// ── Pathname helpers for context-change detection ────────────────────────────

const KNOWN_APP_PREFIXES = new Set([
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

/** Extract a repo context identifier (e.g. "vercel/next.js") from a pathname, or a page category */
function getPageContext(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length >= 2 && !KNOWN_APP_PREFIXES.has(segments[0])) {
		return `${segments[0]}/${segments[1]}`;
	}
	return segments[0] || "home";
}

/** Derive a short context-aware label for a Ghost tab from the current pathname */
function getTabLabelForPathname(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length >= 2 && !KNOWN_APP_PREFIXES.has(segments[0])) {
		const repo = segments[1];
		const prMatch = pathname.match(/\/pulls\/(\d+)/);
		if (prMatch) return `PR #${prMatch[1]} · ${repo}`;
		const issueMatch = pathname.match(/\/issues\/(\d+)/);
		if (issueMatch) return `Issue #${issueMatch[1]} · ${repo}`;
		if (/\/pulls\/?$/.test(pathname)) return `PRs · ${repo}`;
		if (/\/issues\/?$/.test(pathname)) return `Issues · ${repo}`;
		return repo;
	}
	if (pathname.startsWith("/prs")) return "My PRs";
	if (pathname.startsWith("/issues")) return "My Issues";
	if (pathname.startsWith("/notifications")) return "Notifs";
	if (pathname.startsWith("/repos")) return "Repos";
	return "New chat";
}

const GlobalChatContext = createContext<GlobalChatContextValue | null>(null);

export function useGlobalChat() {
	const ctx = useContext(GlobalChatContext);
	if (!ctx) {
		throw new Error("useGlobalChat must be used within GlobalChatProvider");
	}
	return ctx;
}

export function useGlobalChatOptional() {
	return useContext(GlobalChatContext);
}

interface GlobalChatProviderProps {
	children: ReactNode;
	initialTabState: GhostTabState;
}

export function GlobalChatProvider({ children, initialTabState }: GlobalChatProviderProps) {
	const [state, setState] = useState<GlobalChatState>({
		isOpen: false,
		isWorking: false,
		chatType: null,
		contextKey: null,
		contextBody: null,
		suggestions: [],
		placeholder: "Ask Ghost...",
		emptyTitle: "Ghost",
		emptyDescription: "Your haunted assistant for all things here.",
		repoFileSearch: null,
	});

	const [tabState, setTabState] = useState<GhostTabState>(initialTabState);

	const contextHandlerRef = useRef<AddCodeContextFn | null>(null);
	// Track open state for synchronous keyboard shortcut checks
	const isOpenRef = useRef(false);
	// Track the pathname when the panel was last closed, so we can detect repo/page changes on reopen
	const lastClosedPathnameRef = useRef<string | null>(null);
	// Multiple sources can contribute to "isWorking" (e.g. chat streaming, prompt processing)
	const workingSourcesRef = useRef<Set<string>>(new Set());

	// ── Tab mutations (optimistic + fire-and-forget POST) ──────────────

	const addTab = useCallback(
		(contextLabel?: string, customTabId?: string) => {
			const id =
				customTabId ||
				`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
			let label = "";
			let counter = 0;
			setTabState((prev) => {
				counter = prev.counter + 1;
				label =
					contextLabel ||
					state.emptyTitle ||
					state.contextKey ||
					"New chat";
				return {
					tabs: [...prev.tabs, { id, label }],
					activeTabId: id,
					counter,
				};
			});
			// Fire-and-forget persist with client-generated ID
			// Use setTimeout so the setter has resolved and counter/label are set
			setTimeout(() => {
				fetch("/api/ai/ghost-tabs", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "add",
						tabId: id,
						label,
						counter,
					}),
				}).catch(() => {});
			}, 0);
		},
		[state.emptyTitle, state.contextKey],
	);

	const closeTab = useCallback((tabId: string) => {
		let newDefault: { id: string; label: string; counter: number } | undefined;
		setTabState((prev) => {
			const idx = prev.tabs.findIndex((t) => t.id === tabId);
			const remaining = prev.tabs.filter((t) => t.id !== tabId);
			if (remaining.length === 0) {
				const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
				const fallback = "New chat";
				newDefault = { id, label: fallback, counter: 1 };
				return {
					tabs: [{ id, label: fallback }],
					activeTabId: id,
					counter: 1,
				};
			}
			let newActiveId = prev.activeTabId;
			if (prev.activeTabId === tabId) {
				const newIdx = Math.min(idx, remaining.length - 1);
				newActiveId = remaining[newIdx].id;
			}
			return { ...prev, tabs: remaining, activeTabId: newActiveId };
		});
		// Fire-and-forget persist
		setTimeout(() => {
			fetch("/api/ai/ghost-tabs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "close", tabId, newDefault }),
			}).catch(() => {});
		}, 0);
	}, []);

	const switchTab = useCallback((tabId: string) => {
		setTabState((prev) => ({ ...prev, activeTabId: tabId }));
		// Persist (fire-and-forget, no reconciliation needed for switch)
		fetch("/api/ai/ghost-tabs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "switch", tabId }),
		}).catch(() => {});
	}, []);

	const renameTab = useCallback((tabId: string, label: string) => {
		setTabState((prev) => ({
			...prev,
			tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
		}));
		fetch("/api/ai/ghost-tabs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "rename", tabId, label }),
		}).catch(() => {});
	}, []);

	/** Replace the active tab's ID and label (used to load a history conversation) */
	const replaceCurrentTab = useCallback((newId: string, label: string) => {
		setTabState((prev) => ({
			...prev,
			tabs: prev.tabs.map((t) =>
				t.id === prev.activeTabId ? { id: newId, label } : t,
			),
			activeTabId: newId,
		}));
	}, []);

	// ── Existing chat state logic ──────────────────────────────────────

	const setContext = useCallback((config: ChatConfig) => {
		setState((prev) => ({
			...prev,
			chatType: config.chatType,
			contextKey: config.contextKey,
			contextBody: config.contextBody,
			suggestions: config.suggestions ?? [],
			placeholder: config.placeholder ?? "Ask Ghost...",
			emptyTitle: config.emptyTitle ?? "Ghost",
			emptyDescription:
				config.emptyDescription ??
				"Your haunted assistant for all things here.",
			repoFileSearch: config.repoFileSearch ?? null,
		}));
	}, []);

	const clearContext = useCallback(() => {
		setState((prev) => ({
			...prev,
			chatType: null,
			contextKey: null,
			contextBody: null,
			suggestions: [],
			placeholder: "Ask Ghost...",
			emptyTitle: "Ghost",
			emptyDescription: "Your haunted assistant for all things here.",
			repoFileSearch: null,
		}));
	}, []);

	const focusGhostInput = useCallback(() => {
		setTimeout(() => {
			const el =
				document.querySelector<HTMLTextAreaElement>("[data-ghost-input]");
			el?.focus();
		}, 100);
	}, []);

	const openChat = useCallback(
		(config: ChatConfig) => {
			setContext(config);
			setState((prev) => ({ ...prev, isOpen: true }));
			isOpenRef.current = true;
			focusGhostInput();
		},
		[setContext, focusGhostInput],
	);

	const closeChat = useCallback(() => {
		lastClosedPathnameRef.current = window.location.pathname;
		setState((prev) => ({ ...prev, isOpen: false }));
		isOpenRef.current = false;
	}, []);

	const toggleChat = useCallback(() => {
		setState((prev) => {
			const opening = !prev.isOpen;
			isOpenRef.current = opening;
			if (opening) {
				const currentPathname = window.location.pathname;
				// If the page context (repo) changed since last close, open a new tab
				if (lastClosedPathnameRef.current !== null) {
					const lastCtx = getPageContext(
						lastClosedPathnameRef.current,
					);
					const currentCtx = getPageContext(currentPathname);
					if (lastCtx !== currentCtx) {
						addTab(getTabLabelForPathname(currentPathname));
					}
				}
				focusGhostInput();
			} else {
				lastClosedPathnameRef.current = window.location.pathname;
			}
			return { ...prev, isOpen: opening };
		});
	}, [focusGhostInput, addTab]);

	const syncIsWorking = useCallback(() => {
		const working = workingSourcesRef.current.size > 0;
		setState((prev) =>
			prev.isWorking === working ? prev : { ...prev, isWorking: working },
		);
	}, []);

	const setWorkingSource = useCallback(
		(key: string, active: boolean) => {
			if (active) {
				workingSourcesRef.current.add(key);
			} else {
				workingSourcesRef.current.delete(key);
			}
			syncIsWorking();
		},
		[syncIsWorking],
	);

	// Backward compat — maps to the "chat" source key
	const setIsWorking = useCallback(
		(working: boolean) => {
			setWorkingSource("chat", working);
		},
		[setWorkingSource],
	);

	const addCodeContext = useCallback(
		(context: InlineContext) => {
			setState((prev) => ({ ...prev, isOpen: true }));
			setTimeout(() => {
				contextHandlerRef.current?.(context);
			}, 50);
			focusGhostInput();
		},
		[focusGhostInput],
	);

	const registerContextHandler = useCallback((fn: AddCodeContextFn) => {
		contextHandlerRef.current = fn;
	}, []);

	const ghostHistoryRefetchRef = useRef<(() => void) | null>(null);
	const registerGhostHistoryRefetch = useCallback((fn: (() => void) | null) => {
		ghostHistoryRefetchRef.current = fn;
	}, []);
	const notifyGhostHistoryChanged = useCallback(() => {
		ghostHistoryRefetchRef.current?.();
	}, []);

	// Cmd+I / Ctrl+I to toggle AI panel, Cmd+N to add tab when open
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "i") {
				e.preventDefault();
				toggleChat();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "n" && isOpenRef.current) {
				e.preventDefault();
				addTab();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [addTab, toggleChat]);

	return (
		<GlobalChatContext.Provider
			value={{
				state,
				tabState,
				openChat,
				setContext,
				clearContext,
				closeChat,
				toggleChat,
				setIsWorking,
				setWorkingSource,
				addCodeContext,
				registerContextHandler,
				addTab,
				closeTab,
				switchTab,
				renameTab,
				replaceCurrentTab,
				registerGhostHistoryRefetch,
				notifyGhostHistoryChanged,
			}}
		>
			{children}
		</GlobalChatContext.Provider>
	);
}
