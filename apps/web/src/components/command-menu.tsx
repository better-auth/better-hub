"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import {
	LayoutDashboard,
	FolderGit2,
	GitPullRequest,
	Search,
	Star,
	Settings,
	ExternalLink,
	LogOut,
	Loader2,
	ChevronRight,
	Ghost,
	Palette,
	Check,
	Moon,
	Sun,
	CircleDot,
	History,
	Users,
	Plus,
	X,
	Bot,
	Key,
	FileText,
	GitCommit,
	Shield,
	Activity,
	BarChart3,
	Play,
	Code,
	Eye,
	Pin,
	Square,
} from "lucide-react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { signOut } from "@/lib/auth-client";
import { cn, formatNumber } from "@/lib/utils";
import { getLanguageColor } from "@/lib/github-utils";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";
import { getRecentViews, type RecentViewItem } from "@/lib/recent-views";
import { useColorTheme } from "@/components/theme/theme-provider";
import { BORDER_RADIUS_PRESETS, type BorderRadiusPreset } from "@/lib/themes/border-radius";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import type { MutationEvent } from "@/lib/mutation-events";
import {
	pinToOverview,
	unpinFromOverview,
	getPinnedUrlsForRepo,
} from "@/app/(app)/repos/[owner]/[repo]/pin-actions";
import { SELECTABLE_MODELS } from "@/lib/billing/ai-models";

interface SearchRepo {
	id: number;
	full_name: string;
	description: string | null;
	language: string | null;
	stargazers_count: number;
	owner: {
		login: string;
		avatar_url: string;
	} | null;
}

interface AccountInfo {
	id: string;
	login: string;
	avatarUrl: string;
	label: string;
	active: boolean;
}

interface AccountsData {
	accounts: AccountInfo[];
	oauthLogin: string;
	oauthAvatar: string;
	oauthActive: boolean;
}

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
	"starred",
]);

function matchRepoFromPathname(pathname: string): [string, string] | null {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length < 2) return null;
	if (KNOWN_PREFIXES.has(segments[0])) return null;
	return [segments[0], segments[1]];
}

type Mode =
	| "commands"
	| "search"
	| "theme"
	| "radius"
	| "accounts"
	| "settings"
	| "model"
	| "files";

export function CommandMenu() {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<Mode>("commands");
	const [search, setSearch] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [mounted, setMounted] = useState(false);
	const router = useRouter();
	const pathname = usePathname();
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const globalChat = useGlobalChatOptional();
	const {
		themeId: currentThemeId,
		mode: currentMode,
		borderRadius: currentBorderRadius,
		setTheme: setColorTheme,
		toggleMode,
		setBorderRadius,
		themes: colorThemes,
	} = useColorTheme();
	const { emit } = useMutationEvents();

	// Recently viewed
	const [recentViews, setRecentViews] = useState<RecentViewItem[]>([]);

	// Repo search state
	const userReposRef = useRef<SearchRepo[]>([]);
	const [userReposLoaded, setUserReposLoaded] = useState(false);
	const [githubResults, setGithubResults] = useState<SearchRepo[]>([]);
	const [githubLoading, setGithubLoading] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

	// Accounts state
	const [accountsData, setAccountsData] = useState<AccountsData | null>(null);
	const [accountsLoading, setAccountsLoading] = useState(false);
	const [addingAccount, setAddingAccount] = useState(false);
	const [patInput, setPatInput] = useState("");
	const [patError, setPatError] = useState("");
	const [patSubmitting, setPatSubmitting] = useState(false);

	// Settings state
	const [settingsData, setSettingsData] = useState<{
		ghostModel: string;
		useOwnApiKey: boolean;
	} | null>(null);
	const [settingsLoading, setSettingsLoading] = useState(false);

	// Pin state
	const [pinnedUrls, setPinnedUrls] = useState<string[]>([]);
	const pinnedRepoRef = useRef<string>("");

	// File tree state (for "Go to file" on repo pages)
	const repoContext = useMemo(() => matchRepoFromPathname(pathname), [pathname]);
	const [fileTree, setFileTree] = useState<{ files: string[]; defaultBranch: string } | null>(
		null,
	);
	const [fileTreeLoading, setFileTreeLoading] = useState(false);
	const fileTreeRepoRef = useRef<string>("");
	const prevModeRef = useRef(mode);

	const MODELS = SELECTABLE_MODELS;

	const fetchSettings = useCallback(async () => {
		setSettingsLoading(true);
		try {
			const res = await fetch("/api/user-settings");
			if (res.ok) {
				const data = await res.json();
				setSettingsData({
					ghostModel: data.ghostModel,
					useOwnApiKey: data.useOwnApiKey,
				});
			}
		} catch {
			// silent
		} finally {
			setSettingsLoading(false);
		}
	}, []);

	const updateSetting = useCallback(async (updates: Record<string, unknown>) => {
		try {
			const res = await fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(updates),
			});
			if (res.ok) {
				const data = await res.json();
				setSettingsData({
					ghostModel: data.ghostModel,
					useOwnApiKey: data.useOwnApiKey,
				});
			}
		} catch {
			// silent
		}
	}, []);

	// Fetch settings when entering settings or model mode
	useEffect(() => {
		if (open && (mode === "settings" || mode === "model")) {
			fetchSettings();
		}
	}, [open, mode, fetchSettings]);

	const fetchAccounts = useCallback(async () => {
		setAccountsLoading(true);
		try {
			const res = await fetch("/api/github-accounts");
			if (res.ok) {
				const data = await res.json();
				setAccountsData(data);
			}
		} catch {
			// silent
		} finally {
			setAccountsLoading(false);
		}
	}, []);

	// Fetch accounts when switching to accounts mode
	useEffect(() => {
		if (open && mode === "accounts") {
			fetchAccounts();
		}
	}, [open, mode, fetchAccounts]);

	// Fetch file tree when switching to files mode
	useEffect(() => {
		if (!open || mode !== "files" || !repoContext) return;
		const repoKey = `${repoContext[0]}/${repoContext[1]}`;
		if (fileTreeRepoRef.current === repoKey && fileTree) return;

		let cancelled = false;
		setFileTreeLoading(true);
		setFileTree(null);

		(async () => {
			try {
				const res = await fetch(
					`/api/repo-files?owner=${encodeURIComponent(repoContext[0])}&repo=${encodeURIComponent(repoContext[1])}`,
				);
				if (res.ok && !cancelled) {
					const data = await res.json();
					fileTreeRepoRef.current = repoKey;
					setFileTree(data);
				}
			} catch {
				// silent
			} finally {
				if (!cancelled) setFileTreeLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [open, mode, repoContext]); // eslint-disable-line react-hooks/exhaustive-deps

	// Fetch pinned URLs when menu opens with repo context
	useEffect(() => {
		if (!open || !repoContext) return;
		const repoKey = `${repoContext[0]}/${repoContext[1]}`;
		if (pinnedRepoRef.current === repoKey) return;

		let cancelled = false;
		(async () => {
			try {
				const urls = await getPinnedUrlsForRepo(
					repoContext[0],
					repoContext[1],
				);
				if (!cancelled) {
					pinnedRepoRef.current = repoKey;
					setPinnedUrls(urls);
				}
			} catch {
				// silent
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [open, repoContext]);

	// Subscribe to pin events to keep pinnedUrls in sync
	useMutationSubscription(["pin:added", "pin:removed"], (event: MutationEvent) => {
		if (!repoContext) return;
		if (
			event.type === "pin:added" &&
			event.owner === repoContext[0] &&
			event.repo === repoContext[1]
		) {
			setPinnedUrls((prev) =>
				prev.includes(event.url) ? prev : [...prev, event.url],
			);
		} else if (
			event.type === "pin:removed" &&
			event.owner === repoContext[0] &&
			event.repo === repoContext[1]
		) {
			setPinnedUrls((prev) => prev.filter((u) => u !== event.url));
		}
	});

	useEffect(() => {
		setMounted(true);
	}, []);

	// Listen for external "open accounts" event (from navbar avatar)
	useEffect(() => {
		const handler = () => {
			setMode("accounts");
			setSearch("");
			setSelectedIndex(0);
			setOpen(true);
		};
		window.addEventListener("open-accounts-menu", handler);

		// Generic mode opener (e.g. from /settings redirect)
		const modeHandler = (e: Event) => {
			const mode = (e as CustomEvent).detail as Mode;
			setMode(mode);
			setSearch("");
			setSelectedIndex(0);
			setOpen(true);
		};
		window.addEventListener("open-cmdk-mode", modeHandler);

		return () => {
			window.removeEventListener("open-accounts-menu", handler);
			window.removeEventListener("open-cmdk-mode", modeHandler);
		};
	}, []);

	// Load recent views when menu opens
	useEffect(() => {
		if (open) setRecentViews(getRecentViews());
	}, [open]);

	// Fetch user repos on first open (cached in ref)
	useEffect(() => {
		if (!open || userReposLoaded) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/user-repos");
				if (res.ok && !cancelled) {
					const data = await res.json();
					userReposRef.current = data.repos ?? [];
					setUserReposLoaded(true);
				}
			} catch {
				// silent
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, userReposLoaded]);

	const navigationItems = useMemo(
		() => [
			{ name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
			{ name: "Repositories", path: "/repos", icon: FolderGit2 },
			{ name: "PRs", path: "/prs", icon: GitPullRequest },
			{ name: "Search Code", path: "/search", icon: Search },
		],
		[],
	);

	// Cmd+K, "/", Escape
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
			if (e.key === "/" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				if (open && mode === "search") {
					setOpen(false);
					return;
				}
				setMode("search");
				setSearch("");
				setOpen(true);
			}
			if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
				const target = e.target as HTMLElement;
				if (
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable
				)
					return;
				e.preventDefault();
				setMode("search");
				setSearch("");
				setOpen(true);
			}
			if (e.key === "g" && (e.metaKey || e.ctrlKey)) {
				if (!matchRepoFromPathname(window.location.pathname)) return;
				e.preventDefault();
				if (open && mode === "files") {
					setOpen(false);
					return;
				}
				setMode("files");
				setSearch("");
				setOpen(true);
			}
			if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				const active = document.activeElement as HTMLElement | null;
				if (
					active?.tagName === "INPUT" ||
					active?.tagName === "TEXTAREA" ||
					active?.isContentEditable
				)
					return;
				if (!matchRepoFromPathname(window.location.pathname)) return;
				e.preventDefault();
				setMode("files");
				setSearch("");
				setOpen(true);
			}
			if (e.key === "Escape" && open) {
				setOpen(false);
			}
		};
		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, [open]);

	useEffect(() => {
		if (open) {
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [open]);

	// Auto-advance highlight to second item on open
	useEffect(() => {
		if (open && mode === "commands" && !search) {
			const t = setTimeout(() => setSelectedIndex(1), 250);
			return () => clearTimeout(t);
		}
	}, [open]); // eslint-disable-line react-hooks/exhaustive-deps

	// Lock body scroll when open
	useEffect(() => {
		if (open) {
			document.body.style.overflow = "hidden";
			return () => {
				document.body.style.overflow = "";
			};
		}
	}, [open]);

	// Reset on close
	useEffect(() => {
		if (!open) {
			const t = setTimeout(() => {
				setSearch("");
				setSelectedIndex(0);
				setGithubResults([]);
				setGithubLoading(false);
				setMode("commands");
				setAddingAccount(false);
				setPatInput("");
				setPatError("");
				setPatSubmitting(false);
			}, 150);
			return () => clearTimeout(t);
		}
	}, [open]);

	// Debounced GitHub search only in search mode
	useEffect(() => {
		if (!open || mode !== "search") return;
		if (debounceRef.current) clearTimeout(debounceRef.current);

		const q = search.trim();
		if (!q) {
			setGithubResults([]);
			setGithubLoading(false);
			return;
		}

		setGithubLoading(true);
		debounceRef.current = setTimeout(async () => {
			try {
				const params = new URLSearchParams({ q, per_page: "10" });
				const res = await fetch(`/api/search-repos?${params}`);
				if (res.ok) {
					const data = await res.json();
					const items = (data.items ?? []).map(
						(r: {
							id: number;
							full_name: string;
							description?: string | null;
							language?: string | null;
							stargazers_count?: number;
							owner?: {
								login: string;
								avatar_url: string;
							} | null;
						}) => ({
							id: r.id,
							full_name: r.full_name,
							description: r.description ?? null,
							language: r.language ?? null,
							stargazers_count: r.stargazers_count ?? 0,
							owner: r.owner
								? {
										login: r.owner
											.login,
										avatar_url: r.owner
											.avatar_url,
									}
								: null,
						}),
					);
					setGithubResults(items);
				}
			} catch {
				// silent
			} finally {
				setGithubLoading(false);
			}
		}, 150);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [search, open, mode]);

	const switchMode = useCallback((newMode: Mode) => {
		setMode(newMode);
		setSearch("");
		setSelectedIndex(0);
		setGithubResults([]);
		setGithubLoading(false);
	}, []);

	function derivePinTitle(p: string, base: string, owner: string, repo: string): string {
		const rel = p.replace(base, "");
		const pullMatch = rel.match(/^\/pulls\/(\d+)/);
		if (pullMatch) return `PR #${pullMatch[1]}`;
		const issueMatch = rel.match(/^\/issues\/(\d+)/);
		if (issueMatch) return `Issue #${issueMatch[1]}`;
		const commitMatch = rel.match(/^\/commits?\/([a-f0-9]{7,})/);
		if (commitMatch) return `Commit ${commitMatch[1].slice(0, 7)}`;
		const segments = rel.split("/").filter(Boolean);
		if (segments.length > 0) {
			const section = segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
			return `${section} - ${owner}/${repo}`;
		}
		return `${owner}/${repo}`;
	}

	function derivePinItemType(p: string, base: string): string {
		const rel = p.replace(base, "");
		if (rel.startsWith("/pulls/")) return "pr";
		if (rel.startsWith("/issues/")) return "issue";
		if (rel.match(/^\/commits?\//)) return "commit";
		return "page";
	}

	const tools = useMemo(
		() => [
			...(globalChat
				? [
						{
							name: globalChat.state.isOpen
								? "Close Ghost"
								: "Open Ghost",
							description: "AI assistant",
							keywords: [
								"ai",
								"chat",
								"ask",
								"help",
								"copilot",
								"bot",
							],
							action: () => globalChat.toggleChat(),
							icon: Ghost,
							shortcut: "Mod+I",
						},
					]
				: []),
			...(repoContext
				? [
						{
							name: "Go to File",
							description: `${repoContext[0]}/${repoContext[1]}`,
							keywords: [
								"open",
								"navigate",
								"find file",
								"browse",
							],
							action: () => switchMode("files"),
							icon: FileText,
							keepOpen: true,
							shortcut: "Mod+G",
						},
					]
				: []),
			...(repoContext && pathname === `/${repoContext[0]}/${repoContext[1]}`
				? [
						{
							name: "Preview Public View",
							description:
								"See what visitors see (README only)",
							keywords: [
								"public",
								"visitor",
								"readme",
								"preview",
								"view",
							],
							action: () =>
								window.dispatchEvent(
									new CustomEvent(
										"toggle-public-view",
									),
								),
							icon: Eye,
						},
					]
				: []),
			...(repoContext && pathname !== `/${repoContext[0]}/${repoContext[1]}`
				? [
						{
							name: pinnedUrls.includes(pathname)
								? "Unpin this page"
								: "Pin this page",
							description: `${pinnedUrls.includes(pathname) ? "Remove from" : "Add to"} repo overview`,
							keywords: [
								"pin",
								"bookmark",
								"save",
								"unpin",
							],
							action: () => {
								const [o, r] = repoContext;
								const base = `/${o}/${r}`;
								const isPinned =
									pinnedUrls.includes(
										pathname,
									);
								if (isPinned) {
									setPinnedUrls((prev) =>
										prev.filter(
											(u) =>
												u !==
												pathname,
										),
									);
									unpinFromOverview(
										o,
										r,
										pathname,
									);
									emit({
										type: "pin:removed",
										owner: o,
										repo: r,
										url: pathname,
									});
								} else {
									const title =
										derivePinTitle(
											pathname,
											base,
											o,
											r,
										);
									const itemType =
										derivePinItemType(
											pathname,
											base,
										);
									setPinnedUrls((prev) => [
										...prev,
										pathname,
									]);
									pinToOverview(
										o,
										r,
										pathname,
										title,
										itemType,
									);
									emit({
										type: "pin:added",
										owner: o,
										repo: r,
										url: pathname,
										title,
										itemType,
									});
								}
							},
							icon: Pin,
						},
					]
				: []),
			{
				name: "Search Repos",
				description: "Find repositories",
				keywords: ["find", "lookup", "navigate", "go to", "open repo"],
				action: () => switchMode("search"),
				icon: Search,
				keepOpen: true,
				shortcut: "Mod+/",
			},
			{
				name: "Change Theme",
				description: "Switch color theme",
				keywords: [
					"dark",
					"light",
					"mode",
					"appearance",
					"colors",
					"night",
					"midnight",
					"nord",
					"wave",
					"contrast",
					"style",
					"code",
					"syntax",
				],
				action: () => switchMode("theme"),
				icon: Palette,
				keepOpen: true,
			},
			{
				name: "Set Border Radius",
				description: "Adjust corner rounding",
				keywords: [
					"radius",
					"rounded",
					"corners",
					"square",
					"sharp",
					"soft",
					"rounding",
				],
				action: () => switchMode("radius"),
				icon: Square,
				keepOpen: true,
			},
			{
				name: "Account Settings",
				description: "Profile, accounts & sign out",
				keywords: [
					"user",
					"login",
					"logout",
					"sign out",
					"switch",
					"pat",
					"token",
					"profile",
				],
				action: () => switchMode("accounts"),
				icon: Users,
				keepOpen: true,
			},
			{
				name: "Configuration",
				description: "App settings",
				keywords: [
					"preferences",
					"options",
					"model",
					"ghost",
					"api key",
					"customize",
				],
				action: () => switchMode("settings"),
				icon: Settings,
				keepOpen: true,
			},
			{
				name: "New Repository",
				description: "Create a new repo on GitHub",
				keywords: ["create", "init", "start", "add repo"],
				action: () => window.open("https://github.com/new", "_blank"),
				icon: FolderGit2,
			},
			{
				name: "Open GitHub",
				description: "Go to github.com",
				keywords: ["website", "external", "browser"],
				action: () => window.open("https://github.com", "_blank"),
				icon: ExternalLink,
			},
			{
				name: "Starred Repos",
				description: "View your starred repositories",
				keywords: ["favorites", "bookmarks", "saved", "likes"],
				action: () => router.push("/starred"),
				icon: Star,
			},
		],
		[router, switchMode, globalChat, repoContext, pinnedUrls, pathname, emit],
	);

	// --- Commands mode items ---
	const filteredTools = useMemo(() => {
		if (!search) return tools;
		const s = search.toLowerCase();
		return tools.filter(
			(t) =>
				t.name.toLowerCase().includes(s) ||
				t.description.toLowerCase().includes(s) ||
				t.keywords?.some((k: string) => k.includes(s)),
		);
	}, [search, tools]);

	const hasQuery = search.trim().length > 0;

	const filteredRecentViews = useMemo(() => {
		if (hasQuery) {
			const s = search.toLowerCase();
			return recentViews
				.filter(
					(v) =>
						v.title.toLowerCase().includes(s) ||
						v.subtitle.toLowerCase().includes(s) ||
						(v.number && String(v.number).includes(s)),
				)
				.slice(0, 5);
		}
		return recentViews.slice(0, 5);
	}, [recentViews, search, hasQuery]);

	// Context-aware suggestions shown at top when no search query
	const suggestions = useMemo(() => {
		if (hasQuery) return [];

		const items: {
			id: string;
			name: string;
			description: string;
			icon: typeof Search;
			action: () => void;
			keepOpen?: boolean;
			shortcut?: string;
			image?: string;
		}[] = [];

		if (repoContext) {
			// Repo page: Go to File, Issues, PRs
			items.push({
				id: "suggest-go-to-file",
				name: "Go to File",
				description: `${repoContext[0]}/${repoContext[1]}`,
				icon: FileText,
				action: () => switchMode("files"),
				keepOpen: true,
				shortcut: "Mod+G",
			});
			const base = `/${repoContext[0]}/${repoContext[1]}`;
			items.push({
				id: "suggest-issues",
				name: "Issues",
				description: "Browse issues",
				icon: CircleDot,
				action: () => router.push(`${base}/issues`),
			});
			items.push({
				id: "suggest-pulls",
				name: "Pull Requests",
				description: "Browse pull requests",
				icon: GitPullRequest,
				action: () => router.push(`${base}/pulls`),
			});
		} else {
			// Dashboard / other pages
			items.push({
				id: "suggest-search",
				name: "Search Repos",
				description: "Find repositories",
				icon: Search,
				action: () => switchMode("search"),
				keepOpen: true,
				shortcut: "Mod+/",
			});
			// Top 2 recently visited repos
			const repoViews = recentViews.filter((v) => v.type === "repo").slice(0, 2);
			repoViews.forEach((v) =>
				items.push({
					id: `suggest-${v.url}`,
					name: v.title,
					description: v.subtitle,
					icon: FolderGit2,
					action: () => router.push(v.url),
					image: v.image || undefined,
				}),
			);
			if (globalChat) {
				items.push({
					id: "suggest-ghost",
					name: globalChat.state.isOpen
						? "Close Ghost"
						: "Open Ghost",
					description: "AI assistant",
					icon: Ghost,
					action: () => globalChat.toggleChat(),
					shortcut: "Mod+I",
				});
			}
		}

		return items.slice(0, 4);
	}, [repoContext, recentViews, globalChat, hasQuery, switchMode, router]);

	// When not searching, show limited tools (excluding those already in suggestions)
	const primaryTools = useMemo(() => {
		if (hasQuery) return filteredTools;
		const suggestNames = new Set(suggestions.map((s) => s.name));
		return tools.filter((t) => !suggestNames.has(t.name)).slice(0, 5);
	}, [hasQuery, filteredTools, tools, suggestions]);

	// Deduplicate recent views against suggestions (avoid showing same repo twice)
	const dedupedRecentViews = useMemo(() => {
		const suggestIds = new Set(suggestions.map((s) => s.id));
		return filteredRecentViews.filter((v) => !suggestIds.has(`suggest-${v.url}`));
	}, [filteredRecentViews, suggestions]);

	// Repo navigation items (shown when on a repo page)
	const repoNavItems = useMemo(() => {
		if (!repoContext) return [];
		const base = `/${repoContext[0]}/${repoContext[1]}`;
		const all = [
			{ name: "Overview", href: base, icon: Eye },
			{ name: "Code", href: `${base}/code`, icon: Code },
			{ name: "Commits", href: `${base}/commits`, icon: GitCommit },
			{ name: "Pull Requests", href: `${base}/pulls`, icon: GitPullRequest },
			{ name: "Issues", href: `${base}/issues`, icon: CircleDot },
			{ name: "Actions", href: `${base}/actions`, icon: Play },
			{ name: "Security", href: `${base}/security`, icon: Shield },
			{ name: "Activity", href: `${base}/activity`, icon: Activity },
			{ name: "Insights", href: `${base}/insights`, icon: BarChart3 },
			{ name: "Settings", href: `${base}/settings`, icon: Settings },
		];
		if (!search.trim()) return all;
		const s = search.toLowerCase();
		return all.filter((item) => item.name.toLowerCase().includes(s));
	}, [repoContext, search]);

	const commandItems = useMemo(() => {
		const items: {
			id: string;
			type: "tool" | "recent" | "repo-nav" | "suggestion";
			action: () => void;
			keepOpen?: boolean;
		}[] = [];
		// Suggestions first
		suggestions.forEach((s) =>
			items.push({
				id: s.id,
				type: "suggestion",
				action: s.action,
				keepOpen: s.keepOpen,
			}),
		);
		// Commands (primaryTools when browsing, filteredTools when searching)
		primaryTools.forEach((t) =>
			items.push({
				id: `tool-${t.name}`,
				type: "tool",
				action: t.action,
				keepOpen: t.keepOpen,
			}),
		);
		// Repo navigation (only when searching)
		if (hasQuery) {
			repoNavItems.forEach((item) =>
				items.push({
					id: `repo-nav-${item.name}`,
					type: "repo-nav",
					action: () => router.push(item.href),
				}),
			);
		}
		// Recently viewed
		dedupedRecentViews.forEach((v) =>
			items.push({
				id: `recent-${v.url}`,
				type: "recent",
				action: () => router.push(v.url),
			}),
		);
		// Sign out (only when not searching)
		if (!hasQuery) {
			items.push({
				id: "account-signout",
				type: "tool",
				action: () =>
					signOut({
						fetchOptions: {
							onSuccess: () => {
								window.location.href = "/";
							},
						},
					}),
			});
		}
		return items;
	}, [suggestions, primaryTools, dedupedRecentViews, repoNavItems, hasQuery, router]);

	// --- Search mode items ---
	const filteredUserRepos = useMemo(() => {
		if (mode !== "search" || !search.trim()) return [];
		const s = search.toLowerCase();
		return userReposRef.current
			.filter(
				(r) =>
					r.full_name.toLowerCase().includes(s) ||
					(r.description && r.description.toLowerCase().includes(s)),
			)
			.slice(0, 8);
	}, [search, mode, userReposLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

	const dedupedGithubResults = useMemo(() => {
		if (mode !== "search" || !search.trim()) return [];
		const userRepoNames = new Set(filteredUserRepos.map((r) => r.full_name));
		return githubResults.filter((r) => !userRepoNames.has(r.full_name)).slice(0, 8);
	}, [search, mode, githubResults, filteredUserRepos]);

	// Top repos when search is empty in search mode
	const topUserRepos = useMemo(() => {
		if (mode !== "search" || search.trim()) return [];
		return userReposRef.current.slice(0, 10);
	}, [mode, search, userReposLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

	const searchItems = useMemo(() => {
		const items: { id: string; action: () => void }[] = [];
		if (!search.trim()) {
			topUserRepos.forEach((r) =>
				items.push({
					id: `top-repo-${r.id}`,
					action: () => router.push(`/${r.full_name}`),
				}),
			);
		} else {
			filteredUserRepos.forEach((r) =>
				items.push({
					id: `user-repo-${r.id}`,
					action: () => router.push(`/${r.full_name}`),
				}),
			);
			dedupedGithubResults.forEach((r) =>
				items.push({
					id: `gh-repo-${r.id}`,
					action: () => router.push(`/${r.full_name}`),
				}),
			);
		}
		return items;
	}, [search, topUserRepos, filteredUserRepos, dedupedGithubResults, router]);

	// --- Theme mode items ---
	const { regularThemes, brandedThemes } = useMemo(() => {
		const filterFn = (t: (typeof colorThemes)[0]) => {
			if (!search.trim()) return true;
			const s = search.toLowerCase();
			return (
				t.name.toLowerCase().includes(s) ||
				t.description.toLowerCase().includes(s)
			);
		};

		const regular: typeof colorThemes = [];
		const branded: typeof colorThemes = [];

		for (const theme of colorThemes) {
			if (!filterFn(theme)) continue;
			if (theme.icon) {
				branded.push(theme);
			} else {
				regular.push(theme);
			}
		}

		return { regularThemes: regular, brandedThemes: branded };
	}, [mode, search, colorThemes]);

	const themeItems = useMemo(() => {
		return [...regularThemes, ...brandedThemes].map((t) => ({
			id: `theme-${t.id}`,
			action: () => setColorTheme(t.id),
			keepOpen: true,
		}));
	}, [regularThemes, brandedThemes, setColorTheme]);

	// --- Radius mode items ---
	const RADIUS_OPTIONS: { id: BorderRadiusPreset; label: string; description: string }[] = [
		{ id: "none", label: "None", description: "Sharp corners" },
		{ id: "small", label: "Small", description: "Subtle rounding" },
		{ id: "medium", label: "Medium", description: "Balanced corners" },
		{ id: "large", label: "Large", description: "Soft & rounded" },
	];

	const filteredRadiusOptions = useMemo(() => {
		if (!search.trim()) return RADIUS_OPTIONS;
		const s = search.toLowerCase();
		return RADIUS_OPTIONS.filter(
			(r) =>
				r.label.toLowerCase().includes(s) ||
				r.description.toLowerCase().includes(s),
		);
	}, [search]);

	const radiusItems = useMemo(() => {
		return filteredRadiusOptions.map((r) => ({
			id: `radius-${r.id}`,
			action: () => setBorderRadius(r.id),
			keepOpen: true,
		}));
	}, [filteredRadiusOptions, setBorderRadius]);

	// --- Accounts mode items ---
	const handleSwitchAccount = useCallback(
		async (accountId: string | null) => {
			try {
				await fetch("/api/github-accounts", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ accountId }),
				});
				await fetchAccounts();
				window.dispatchEvent(new Event("github-account-switched"));
				emit({ type: "github-account:switched" });
			} catch {
				// silent
			}
		},
		[fetchAccounts, emit],
	);

	const handleRemoveAccount = useCallback(
		async (accountId: string) => {
			try {
				await fetch("/api/github-accounts", {
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ accountId }),
				});
				await fetchAccounts();
				window.dispatchEvent(new Event("github-account-switched"));
				emit({ type: "github-account:removed" });
			} catch {
				// silent
			}
		},
		[fetchAccounts, emit],
	);

	const handleAddAccount = useCallback(async () => {
		if (!patInput.trim() || patSubmitting) return;
		setPatSubmitting(true);
		setPatError("");
		try {
			const res = await fetch("/api/github-accounts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pat: patInput }),
			});
			const data = await res.json();
			if (!res.ok) {
				setPatError(data.error || "Failed to add account");
				return;
			}
			setPatInput("");
			setAddingAccount(false);
			await fetchAccounts();
			window.dispatchEvent(new Event("github-account-switched"));
			emit({ type: "github-account:added" });
		} catch {
			setPatError("Network error");
		} finally {
			setPatSubmitting(false);
		}
	}, [patInput, patSubmitting, fetchAccounts, emit]);

	const accountItems = useMemo(() => {
		if (mode !== "accounts" || !accountsData) return [];
		const items: { id: string; action: () => void; keepOpen: boolean }[] = [];

		// OAuth account (default)
		items.push({
			id: "account-oauth",
			action: () => handleSwitchAccount(null),
			keepOpen: true,
		});

		// Extra PAT accounts
		accountsData.accounts.forEach((acc) => {
			items.push({
				id: `account-${acc.id}`,
				action: () => handleSwitchAccount(acc.id),
				keepOpen: true,
			});
		});

		// Add account
		items.push({
			id: "account-add",
			action: () => {
				setAddingAccount(true);
				setPatInput("");
				setPatError("");
			},
			keepOpen: true,
		});

		// Quick links
		const activeLogin =
			accountsData.accounts.find((a) => a.active)?.login ||
			accountsData.oauthLogin;
		items.push({
			id: "account-config",
			action: () => switchMode("settings"),
			keepOpen: true,
		});
		items.push({
			id: "account-signout",
			action: () =>
				signOut({
					fetchOptions: {
						onSuccess: () => {
							window.location.href = "/";
						},
					},
				}),
			keepOpen: false,
		});
		items.push({
			id: "account-profile",
			action: () => window.open(`https://github.com/${activeLogin}`, "_blank"),
			keepOpen: false,
		});
		items.push({
			id: "account-set-pat",
			action: () => {
				setAddingAccount(true);
				setPatInput("");
				setPatError("");
			},
			keepOpen: true,
		});

		return items;
	}, [mode, accountsData, handleSwitchAccount, router]);

	// --- Settings mode items ---
	const settingsItems = useMemo(() => {
		const items: { id: string; action: () => void; keepOpen: boolean }[] = [
			{ id: "settings-theme", action: () => switchMode("theme"), keepOpen: true },
			{
				id: "settings-radius",
				action: () => switchMode("radius"),
				keepOpen: true,
			},
			{ id: "settings-model", action: () => switchMode("model"), keepOpen: true },
			{
				id: "settings-accounts",
				action: () => switchMode("accounts"),
				keepOpen: true,
			},
		];
		return items;
	}, [switchMode]);

	// --- Model mode items ---
	const filteredModels = useMemo(() => {
		if (mode !== "model") return MODELS;
		if (!search.trim()) return MODELS;
		const s = search.toLowerCase();
		return MODELS.filter(
			(m) =>
				m.label.toLowerCase().includes(s) ||
				m.desc.toLowerCase().includes(s) ||
				m.id.toLowerCase().includes(s),
		);
	}, [mode, search]);

	const modelItems = useMemo(() => {
		return filteredModels.map((m) => ({
			id: `model-${m.id}`,
			action: () => updateSetting({ ghostModel: m.id }),
			keepOpen: true,
		}));
	}, [filteredModels, updateSetting]);

	// --- Files mode items ---
	const filteredFiles = useMemo(() => {
		if (mode !== "files" || !fileTree) return [];
		const q = search.toLowerCase().trim();
		if (!q) return fileTree.files.slice(0, 30);

		return fileTree.files
			.map((path) => {
				const lower = path.toLowerCase();
				if (!lower.includes(q)) return null;
				const filename = (path.split("/").pop() ?? "").toLowerCase();
				const isExact = filename === q;
				const isFilenameMatch = filename.includes(q);
				const score = isExact ? 3 : isFilenameMatch ? 2 : 1;
				return { path, score };
			})
			.filter(Boolean)
			.sort((a, b) => b!.score - a!.score)
			.slice(0, 30)
			.map((s) => s!.path);
	}, [mode, fileTree, search]);

	const fileItems = useMemo(() => {
		if (mode !== "files" || !repoContext || !fileTree) return [];
		return filteredFiles.map((path) => ({
			id: `file-${path}`,
			action: () =>
				router.push(
					`/${repoContext[0]}/${repoContext[1]}/blob/${fileTree.defaultBranch}/${path}`,
				),
		}));
	}, [filteredFiles, repoContext, fileTree, router, mode]);

	const allItems =
		mode === "commands"
			? commandItems
			: mode === "search"
				? searchItems
				: mode === "theme"
					? themeItems
					: mode === "radius"
						? radiusItems
						: mode === "accounts"
							? accountItems
							: mode === "settings"
								? settingsItems
								: mode === "model"
									? modelItems
									: fileItems;

	useEffect(() => {
		setSelectedIndex(0);
	}, [allItems.length, search]);

	// Auto-select and scroll to current theme when entering theme mode
	useEffect(() => {
		const enteredThemeMode = mode === "theme" && prevModeRef.current !== "theme";
		prevModeRef.current = mode;

		if (enteredThemeMode && !search.trim()) {
			const allThemes = [...regularThemes, ...brandedThemes];
			const currentThemeIndex = allThemes.findIndex(
				(t) => t.id === currentThemeId,
			);
			if (currentThemeIndex !== -1) {
				setSelectedIndex(currentThemeIndex);
			}
		}
	}, [mode, search, regularThemes, brandedThemes, currentThemeId]);

	useEffect(() => {
		if (!listRef.current) return;
		const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
		if (el) el.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	const runCommand = useCallback((command: () => void) => {
		setOpen(false);
		command();
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Tab cycles modes: commands → search → theme → radius → accounts → settings → commands
			if (e.key === "Tab") {
				e.preventDefault();
				if (mode === "commands") switchMode("search");
				else if (mode === "search") switchMode("theme");
				else if (mode === "theme") switchMode("radius");
				else if (mode === "radius") switchMode("accounts");
				else if (mode === "accounts") switchMode("settings");
				else switchMode("commands");
				return;
			}

			// "/" in commands mode switches to search
			if (e.key === "/" && mode === "commands" && !search) {
				e.preventDefault();
				switchMode("search");
				return;
			}

			// Backspace on empty goes back
			if (e.key === "Backspace" && mode !== "commands" && !search) {
				e.preventDefault();
				// Sub-modes go back to settings, others go to commands
				switchMode(mode === "model" ? "settings" : "commands");
				return;
			}

			if (allItems.length === 0) return;
			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((i) => (i + 1) % allItems.length);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex(
						(i) => (i - 1 + allItems.length) % allItems.length,
					);
					break;
				case "Enter":
					e.preventDefault();
					if (allItems[selectedIndex]) {
						const item = allItems[selectedIndex];
						if ("keepOpen" in item && item.keepOpen) {
							item.action();
						} else {
							runCommand(item.action);
						}
					}
					break;
			}
		},
		[allItems, selectedIndex, hasQuery, router, switchMode, runCommand, mode, search],
	);

	// Render helpers — track item indices
	let currentItemIndex = -1;
	const getNextIndex = () => ++currentItemIndex;

	if (!mounted) return null;

	return (
		<>
			{createPortal(
				<>
					{/* Backdrop */}
					<div
						onClick={() => setOpen(false)}
						className={cn(
							"fixed inset-0 z-50 bg-black/25 dark:bg-black/70 transition-opacity duration-150",
							open
								? "opacity-100"
								: "opacity-0 pointer-events-none",
						)}
					/>

					{/* Panel */}
					<div
						ref={panelRef}
						role="dialog"
						aria-label="Command Menu"
						data-state={open ? "open" : "closed"}
						className={cn(
							"fixed z-50 left-1/2 -translate-x-1/2 w-full rounded-lg border shadow-lg overflow-hidden",
							"border-border/60 dark:border-white/6 bg-background",
							"transition-all duration-150",
							open
								? "opacity-100 scale-100 translate-y-0"
								: "opacity-0 scale-[0.98] -translate-y-1 pointer-events-none",
							"max-w-xl top-[20%]",
						)}
						style={{ maxWidth: "36rem" }}
					>
						<span className="sr-only">Command Menu</span>

						<>
							{/* Input area */}
							<div className="flex items-center border-b border-border dark:border-white/6 px-3 gap-2">
								{mode === "search" ? (
									<Search className="size-4 text-muted-foreground/50 shrink-0" />
								) : mode === "files" ? (
									<FileText className="size-4 text-muted-foreground/50 shrink-0" />
								) : mode === "theme" ? (
									<Palette className="size-4 text-muted-foreground/50 shrink-0" />
								) : mode === "radius" ? (
									<Square className="size-4 text-muted-foreground/50 shrink-0" />
								) : mode === "accounts" ? (
									<Users className="size-4 text-muted-foreground/50 shrink-0" />
								) : mode === "settings" ? (
									<Settings className="size-4 text-muted-foreground/50 shrink-0" />
								) : mode === "model" ? (
									<Bot className="size-4 text-muted-foreground/50 shrink-0" />
								) : (
									<Search className="size-4 text-muted-foreground/30 shrink-0" />
								)}
								<input
									ref={inputRef}
									value={search}
									onChange={(e) =>
										setSearch(
											e.target
												.value,
										)
									}
									onKeyDown={handleKeyDown}
									placeholder={
										mode === "search"
											? "Search repos and content..."
											: mode ===
												  "files"
												? "Search files..."
												: mode ===
													  "theme"
													? "Search themes..."
													: mode ===
														  "radius"
														? "Select border radius..."
														: mode ===
															  "accounts"
															? "Filter accounts..."
															: mode ===
																  "settings"
																? "Configuration..."
																: mode ===
																	  "model"
																	? "Search models..."
																	: "Type a command..."
									}
									className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground py-3 text-sm outline-none"
								/>
								<div className="flex items-center gap-1">
									{(githubLoading ||
										fileTreeLoading) && (
										<Loader2 className="size-3.5 text-muted-foreground animate-spin shrink-0" />
									)}
									{mode === "commands" && (
										<button
											onClick={() =>
												switchMode(
													"search",
												)
											}
											className="inline-flex h-5.5 items-center gap-1 rounded-sm border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 px-1.5 text-[10px] text-muted-foreground/60 cursor-pointer hover:text-foreground hover:border-foreground/15 transition-colors"
										>
											/
										</button>
									)}
								</div>
							</div>

							{/* Results */}
							<div
								ref={listRef}
								className="overflow-y-auto max-h-[400px]"
							>
								{mode === "commands" ? (
									<>
										{/* Suggestions (context-aware, only when not searching) */}
										{suggestions.length >
											0 && (
											<CommandGroup title="Suggestions">
												{suggestions.map(
													(
														item,
													) => {
														const idx =
															getNextIndex();
														return (
															<CommandItemButton
																key={
																	item.id
																}
																index={
																	idx
																}
																selected={
																	selectedIndex ===
																	idx
																}
																onClick={() =>
																	item.keepOpen
																		? item.action()
																		: runCommand(
																				item.action,
																			)
																}
															>
																{item.image ? (
																	<img
																		src={
																			item.image
																		}
																		alt=""
																		className="size-4 rounded-full shrink-0"
																	/>
																) : (
																	<item.icon className="size-3.5 text-muted-foreground/50 shrink-0" />
																)}
																<span className="text-[13px] text-foreground flex-1">
																	{
																		item.name
																	}
																</span>
																<span className="text-[11px] text-muted-foreground hidden sm:block">
																	{
																		item.description
																	}
																</span>
																{item.shortcut && (
																	<kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 px-1.5 font-mono text-[10px] text-muted-foreground/50 shrink-0">
																		{formatForDisplay(
																			item.shortcut,
																		)}
																	</kbd>
																)}
															</CommandItemButton>
														);
													},
												)}
											</CommandGroup>
										)}

										{/* Commands (limited when not searching) */}
										{primaryTools.length >
											0 && (
											<CommandGroup title="Commands">
												{primaryTools.map(
													(
														tool,
													) => {
														const idx =
															getNextIndex();
														return (
															<CommandItemButton
																key={
																	tool.name
																}
																index={
																	idx
																}
																selected={
																	selectedIndex ===
																	idx
																}
																onClick={() =>
																	tool.keepOpen
																		? tool.action()
																		: runCommand(
																				tool.action,
																			)
																}
															>
																<tool.icon className="size-3.5 text-muted-foreground/50 shrink-0" />
																<span className="text-[13px] text-foreground flex-1">
																	{
																		tool.name
																	}
																</span>
																<span className="text-[11px] text-muted-foreground hidden sm:block">
																	{
																		tool.description
																	}
																</span>
																{tool.shortcut && (
																	<kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border/60 dark:border-white/8 bg-muted/50 dark:bg-white/3 px-1.5 font-mono text-[10px] text-muted-foreground/50 shrink-0">
																		{formatForDisplay(
																			tool.shortcut,
																		)}
																	</kbd>
																)}
															</CommandItemButton>
														);
													},
												)}
											</CommandGroup>
										)}

										{/* Repo navigation — only shown when searching */}
										{hasQuery &&
											repoNavItems.length >
												0 && (
												<CommandGroup title="Go to">
													{repoNavItems.map(
														(
															item,
														) => {
															const idx =
																getNextIndex();
															return (
																<CommandItemButton
																	key={
																		item.name
																	}
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() =>
																		runCommand(
																			() =>
																				router.push(
																					item.href,
																				),
																		)
																	}
																>
																	<item.icon className="size-3.5 text-muted-foreground/50 shrink-0" />
																	<span className="text-[13px] text-foreground">
																		{
																			item.name
																		}
																	</span>
																</CommandItemButton>
															);
														},
													)}
												</CommandGroup>
											)}

										{/* Recently viewed */}
										{dedupedRecentViews.length >
											0 && (
											<CommandGroup title="Recently viewed">
												{dedupedRecentViews.map(
													(
														item,
													) => {
														const idx =
															getNextIndex();
														return (
															<CommandItemButton
																key={
																	item.url
																}
																index={
																	idx
																}
																selected={
																	selectedIndex ===
																	idx
																}
																onClick={() =>
																	runCommand(
																		() =>
																			router.push(
																				item.url,
																			),
																	)
																}
															>
																{item.type ===
																"pr" ? (
																	<GitPullRequest
																		className={cn(
																			"size-3.5 shrink-0",
																			item.state ===
																				"merged"
																				? "text-alert-important"
																				: item.state ===
																					  "open"
																					? "text-success"
																					: "text-muted-foreground/50",
																		)}
																	/>
																) : item.type ===
																  "issue" ? (
																	<CircleDot
																		className={cn(
																			"size-3.5 shrink-0",
																			item.state ===
																				"open"
																				? "text-success"
																				: "text-muted-foreground/50",
																		)}
																	/>
																) : item.image ? (
																	<img
																		src={
																			item.image
																		}
																		alt=""
																		className="size-4 rounded-full shrink-0"
																	/>
																) : (
																	<History className="size-3.5 text-muted-foreground/50 shrink-0" />
																)}
																<span className="text-[13px] text-foreground flex-1 truncate">
																	{
																		item.title
																	}
																	{item.number && (
																		<span className="text-muted-foreground/50 ml-1">
																			#
																			{
																				item.number
																			}
																		</span>
																	)}
																</span>
																<span className="text-[11px] text-muted-foreground hidden sm:block truncate max-w-[160px]">
																	{
																		item.subtitle
																	}
																</span>
															</CommandItemButton>
														);
													},
												)}
											</CommandGroup>
										)}

										{/* Account group */}
										{!hasQuery && (
											<CommandGroup title="Account">
												{(() => {
													const idx =
														getNextIndex();
													return (
														<CommandItemButton
															index={
																idx
															}
															selected={
																selectedIndex ===
																idx
															}
															onClick={() =>
																runCommand(
																	() =>
																		signOut(
																			{
																				fetchOptions:
																					{
																						onSuccess: () => {
																							window.location.href =
																								"/";
																						},
																					},
																			},
																		),
																)
															}
														>
															<LogOut className="size-3.5 text-muted-foreground/50 shrink-0" />
															<span className="text-[13px] text-foreground">
																Sign
																Out
															</span>
														</CommandItemButton>
													);
												})()}
											</CommandGroup>
										)}

										{/* No results */}
										{hasQuery &&
											primaryTools.length ===
												0 &&
											dedupedRecentViews.length ===
												0 &&
											repoNavItems.length ===
												0 && (
												<div className="py-8 text-center text-sm text-muted-foreground/70">
													No
													commands
													match
													&quot;
													{
														search
													}
													&quot;
												</div>
											)}
									</>
								) : mode === "search" ? (
									/* Search mode */
									<>
										{/* Recent / your repos (when no query) */}
										{!hasQuery &&
											topUserRepos.length >
												0 && (
												<CommandGroup title="Recent repositories">
													{topUserRepos.map(
														(
															repo,
														) => {
															const idx =
																getNextIndex();
															return (
																<RepoItem
																	key={
																		repo.id
																	}
																	repo={
																		repo
																	}
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() =>
																		runCommand(
																			() =>
																				router.push(
																					`/${repo.full_name}`,
																				),
																		)
																	}
																/>
															);
														},
													)}
												</CommandGroup>
											)}

										{/* Your Repos (with query) */}
										{hasQuery &&
											filteredUserRepos.length >
												0 && (
												<CommandGroup title="Your repos">
													{filteredUserRepos.map(
														(
															repo,
														) => {
															const idx =
																getNextIndex();
															return (
																<RepoItem
																	key={
																		repo.id
																	}
																	repo={
																		repo
																	}
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() =>
																		runCommand(
																			() =>
																				router.push(
																					`/${repo.full_name}`,
																				),
																		)
																	}
																/>
															);
														},
													)}
												</CommandGroup>
											)}

										{/* GitHub results */}
										{hasQuery &&
											(dedupedGithubResults.length >
												0 ||
												githubLoading) && (
												<CommandGroup
													title={
														githubLoading &&
														dedupedGithubResults.length ===
															0
															? "GitHub (searching...)"
															: "GitHub"
													}
												>
													{dedupedGithubResults.map(
														(
															repo,
														) => {
															const idx =
																getNextIndex();
															return (
																<RepoItem
																	key={
																		repo.id
																	}
																	repo={
																		repo
																	}
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() =>
																		runCommand(
																			() =>
																				router.push(
																					`/${repo.full_name}`,
																				),
																		)
																	}
																/>
															);
														},
													)}
													{githubLoading &&
														dedupedGithubResults.length ===
															0 && (
															<div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground/60">
																<Loader2 className="size-3.5 animate-spin" />
																<span className="text-xs">
																	Searching
																	GitHub...
																</span>
															</div>
														)}
												</CommandGroup>
											)}

										{/* No results */}
										{hasQuery &&
											filteredUserRepos.length ===
												0 &&
											dedupedGithubResults.length ===
												0 &&
											!githubLoading && (
												<div className="py-8 text-center text-sm text-muted-foreground/70">
													No
													results
													for
													&quot;
													{
														search
													}
													&quot;
												</div>
											)}

										{/* Empty search mode hint */}
										{!hasQuery &&
											topUserRepos.length ===
												0 && (
												<div className="py-8 text-center text-sm text-muted-foreground">
													Start
													typing
													to
													search
													repositories
												</div>
											)}
									</>
								) : mode === "theme" ? (
									/* Theme mode */
									<>
										{/* Mode toggle at the top */}
										<div className="px-3 py-2 border-b border-border/50">
											<button
												type="button"
												className="flex items-center justify-between w-full px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
												onClick={() =>
													toggleMode()
												}
											>
												<span className="flex items-center gap-2 text-sm text-muted-foreground">
													{currentMode ===
													"dark" ? (
														<Moon className="size-3.5" />
													) : (
														<Sun className="size-3.5" />
													)}
													<span>
														{currentMode ===
														"dark"
															? "Dark"
															: "Light"}{" "}
														mode
													</span>
												</span>
												<span className="text-xs text-muted-foreground/60">
													Click
													to
													toggle
												</span>
											</button>
										</div>
										{regularThemes.length >
											0 && (
											<CommandGroup title="Themes">
												{regularThemes.map(
													(
														theme,
													) => {
														const idx =
															getNextIndex();
														const isActive =
															currentThemeId ===
															theme.id;
														const variant =
															theme[
																currentMode
															];
														return (
															<CommandItemButton
																key={
																	theme.id
																}
																index={
																	idx
																}
																selected={
																	selectedIndex ===
																	idx
																}
																onClick={() =>
																	setColorTheme(
																		theme.id,
																	)
																}
															>
																{theme.icon ? (
																	<div className="min-w-[28px] flex items-center justify-center">
																		<theme.icon className="size-4 shrink-0" />
																	</div>
																) : (
																	<span className="flex items-center gap-1 shrink-0">
																		<span
																			className="w-3 h-3 rounded-full border border-border/40"
																			style={{
																				backgroundColor:
																					variant.bgPreview,
																			}}
																		/>
																		<span
																			className="w-3 h-3 rounded-full border border-border/40"
																			style={{
																				backgroundColor:
																					variant.accentPreview,
																			}}
																		/>
																	</span>
																)}
																<span className="text-[13px] text-foreground flex-1">
																	{
																		theme.name
																	}
																</span>
																<span className="text-[11px] text-muted-foreground hidden sm:block">
																	{
																		theme.description
																	}
																</span>
																{isActive && (
																	<Check className="size-3.5 text-success shrink-0" />
																)}
															</CommandItemButton>
														);
													},
												)}
											</CommandGroup>
										)}
										{brandedThemes.length >
											0 && (
											<CommandGroup title="Brands">
												{brandedThemes.map(
													(
														theme,
													) => {
														const idx =
															getNextIndex();
														const isActive =
															currentThemeId ===
															theme.id;
														return (
															<CommandItemButton
																key={
																	theme.id
																}
																index={
																	idx
																}
																selected={
																	selectedIndex ===
																	idx
																}
																onClick={() =>
																	setColorTheme(
																		theme.id,
																	)
																}
															>
																{theme.icon && (
																	<div className="min-w-[28px] flex items-center justify-center">
																		<theme.icon className="size-4 shrink-0" />
																	</div>
																)}
																<span className="text-[13px] text-foreground flex-1">
																	{
																		theme.name
																	}
																</span>
																<span className="text-[11px] text-muted-foreground hidden sm:block">
																	{
																		theme.description
																	}
																</span>
																{isActive && (
																	<Check className="size-3.5 text-success shrink-0" />
																)}
															</CommandItemButton>
														);
													},
												)}
											</CommandGroup>
										)}
										{hasQuery &&
											regularThemes.length ===
												0 &&
											brandedThemes.length ===
												0 && (
												<div className="py-8 text-center text-sm text-muted-foreground/70">
													No
													themes
													match
													&quot;
													{
														search
													}
													&quot;
												</div>
											)}
									</>
								) : mode === "radius" ? (
									/* Border Radius mode */
									<>
										<CommandGroup title="Border Radius">
											{filteredRadiusOptions.map(
												(
													option,
												) => {
													const idx =
														getNextIndex();
													const isActive =
														currentBorderRadius ===
														option.id;
													const presetValues =
														BORDER_RADIUS_PRESETS[
															option
																.id
														];
													return (
														<CommandItemButton
															key={
																option.id
															}
															index={
																idx
															}
															selected={
																selectedIndex ===
																idx
															}
															onClick={() =>
																setBorderRadius(
																	option.id,
																)
															}
														>
															<span
																className="w-6 h-6 border border-border/60 bg-muted/30 shrink-0"
																style={{
																	borderRadius:
																		presetValues[
																			"--radius-md"
																		],
																}}
															/>
															<span className="text-[13px] text-foreground flex-1">
																{
																	option.label
																}
															</span>
															<span className="text-[11px] text-muted-foreground hidden sm:block">
																{
																	option.description
																}
															</span>
															{isActive && (
																<Check className="size-3.5 text-success shrink-0" />
															)}
														</CommandItemButton>
													);
												},
											)}
										</CommandGroup>
										{hasQuery &&
											filteredRadiusOptions.length ===
												0 && (
												<div className="py-8 text-center text-sm text-muted-foreground/70">
													No
													options
													match
													&quot;
													{
														search
													}
													&quot;
												</div>
											)}
									</>
								) : mode === "accounts" ? (
									/* Accounts mode */
									<>
										{accountsLoading &&
										!accountsData ? (
											<div className="flex items-center justify-center py-8">
												<Loader2 className="size-4 text-muted-foreground animate-spin" />
											</div>
										) : accountsData ? (
											<>
												{/* Account Settings links */}
												{!search.trim() && (
													<CommandGroup title="Account Settings">
														{(() => {
															const idx =
																getNextIndex();
															return (
																<CommandItemButton
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() =>
																		switchMode(
																			"settings",
																		)
																	}
																>
																	<Settings className="size-3.5 text-muted-foreground/50 shrink-0" />
																	<span className="text-[13px] text-foreground flex-1">
																		Configuration
																	</span>
																	<span className="text-[11px] text-muted-foreground hidden sm:block">
																		Theme,
																		model
																		&
																		more
																	</span>
																	<ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
																</CommandItemButton>
															);
														})()}
														{(() => {
															const idx =
																getNextIndex();
															return (
																<CommandItemButton
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() =>
																		runCommand(
																			() =>
																				signOut(
																					{
																						fetchOptions:
																							{
																								onSuccess: () => {
																									window.location.href =
																										"/";
																								},
																							},
																					},
																				),
																		)
																	}
																>
																	<LogOut className="size-3.5 text-muted-foreground/50 shrink-0" />
																	<span className="text-[13px] text-foreground">
																		Sign
																		Out
																	</span>
																</CommandItemButton>
															);
														})()}
														{(() => {
															const activeLogin =
																accountsData.accounts.find(
																	(
																		a,
																	) =>
																		a.active,
																)
																	?.login ||
																accountsData.oauthLogin;
															const idx =
																getNextIndex();
															return (
																<CommandItemButton
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() =>
																		runCommand(
																			() =>
																				window.open(
																					`https://github.com/${activeLogin}`,
																					"_blank",
																				),
																		)
																	}
																>
																	<ExternalLink className="size-3.5 text-muted-foreground/50 shrink-0" />
																	<span className="text-[13px] text-foreground">
																		Go
																		to
																		GitHub
																		Profile
																	</span>
																	<span className="text-[11px] text-muted-foreground hidden sm:block">
																		{
																			activeLogin
																		}
																	</span>
																</CommandItemButton>
															);
														})()}
														{(() => {
															const idx =
																getNextIndex();
															return (
																<CommandItemButton
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() => {
																		setAddingAccount(
																			true,
																		);
																		setPatInput(
																			"",
																		);
																		setPatError(
																			"",
																		);
																	}}
																>
																	<Key className="size-3.5 text-muted-foreground/50 shrink-0" />
																	<span className="text-[13px] text-foreground">
																		Set
																		PAT
																	</span>
																	<span className="text-[11px] text-muted-foreground hidden sm:block">
																		Rate
																		limit
																		fallback
																	</span>
																</CommandItemButton>
															);
														})()}
													</CommandGroup>
												)}

												{/* Switch Account */}
												<CommandGroup title="Switch Account">
													{/* OAuth default account */}
													{(() => {
														const matchesFilter =
															!search.trim() ||
															accountsData.oauthLogin
																.toLowerCase()
																.includes(
																	search.toLowerCase(),
																);
														if (
															!matchesFilter
														)
															return null;
														const idx =
															getNextIndex();
														return (
															<CommandItemButton
																key="oauth"
																index={
																	idx
																}
																selected={
																	selectedIndex ===
																	idx
																}
																onClick={() =>
																	handleSwitchAccount(
																		null,
																	)
																}
															>
																{accountsData.oauthAvatar ? (
																	<img
																		src={
																			accountsData.oauthAvatar
																		}
																		alt=""
																		className="size-5 rounded-full shrink-0"
																	/>
																) : (
																	<div className="size-5 rounded-full bg-muted/50 shrink-0" />
																)}
																<span className="text-[13px] text-foreground flex-1">
																	{
																		accountsData.oauthLogin
																	}
																</span>
																<span className="text-[10px] font-mono text-muted-foreground bg-muted/50 dark:bg-white/[0.04] px-1.5 py-0.5 rounded-sm">
																	OAuth
																</span>
																{accountsData.oauthActive && (
																	<Check className="size-3.5 text-success shrink-0" />
																)}
															</CommandItemButton>
														);
													})()}

													{/* PAT accounts */}
													{accountsData.accounts.map(
														(
															acc,
														) => {
															const matchesFilter =
																!search.trim() ||
																acc.login
																	.toLowerCase()
																	.includes(
																		search.toLowerCase(),
																	) ||
																acc.label
																	.toLowerCase()
																	.includes(
																		search.toLowerCase(),
																	);
															if (
																!matchesFilter
															)
																return null;
															const idx =
																getNextIndex();
															return (
																<div
																	key={
																		acc.id
																	}
																	className="group/account relative"
																>
																	<CommandItemButton
																		index={
																			idx
																		}
																		selected={
																			selectedIndex ===
																			idx
																		}
																		onClick={() =>
																			handleSwitchAccount(
																				acc.id,
																			)
																		}
																	>
																		<img
																			src={
																				acc.avatarUrl
																			}
																			alt=""
																			className="size-5 rounded-full shrink-0"
																		/>
																		<span className="text-[13px] text-foreground flex-1">
																			{
																				acc.login
																			}
																			{acc.label !==
																				acc.login && (
																				<span className="text-muted-foreground ml-1.5 text-[11px]">
																					{
																						acc.label
																					}
																				</span>
																			)}
																		</span>
																		<span className="text-[10px] font-mono text-muted-foreground bg-muted/50 dark:bg-white/[0.04] px-1.5 py-0.5 rounded-sm">
																			PAT
																		</span>
																		{acc.active && (
																			<Check className="size-3.5 text-success shrink-0" />
																		)}
																		<button
																			onClick={(
																				e,
																			) => {
																				e.stopPropagation();
																				handleRemoveAccount(
																					acc.id,
																				);
																			}}
																			className="opacity-0 group-hover/account:opacity-100 ml-1 p-0.5 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
																			title="Remove account"
																		>
																			<X className="size-3" />
																		</button>
																	</CommandItemButton>
																</div>
															);
														},
													)}

													{/* Add account (inline) */}
													{addingAccount ? (
														<div className="px-4 py-2.5">
															<div className="flex items-center gap-2">
																<input
																	type="password"
																	value={
																		patInput
																	}
																	onChange={(
																		e,
																	) => {
																		setPatInput(
																			e
																				.target
																				.value,
																		);
																		setPatError(
																			"",
																		);
																	}}
																	onKeyDown={(
																		e,
																	) => {
																		if (
																			e.key ===
																			"Enter"
																		) {
																			e.preventDefault();
																			e.stopPropagation();
																			handleAddAccount();
																		}
																		if (
																			e.key ===
																			"Escape"
																		) {
																			e.stopPropagation();
																			setAddingAccount(
																				false,
																			);
																		}
																	}}
																	placeholder="ghp_... (Personal Access Token)"
																	autoFocus
																	className="flex-1 border border-border bg-transparent px-2 py-1.5 text-xs font-mono placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground/30"
																/>
																<button
																	onClick={
																		handleAddAccount
																	}
																	disabled={
																		patSubmitting ||
																		!patInput.trim()
																	}
																	className="border border-border px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer disabled:opacity-40"
																>
																	{patSubmitting ? (
																		<Loader2 className="size-3 animate-spin" />
																	) : (
																		"Add"
																	)}
																</button>
																<button
																	onClick={() =>
																		setAddingAccount(
																			false,
																		)
																	}
																	className="p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
																>
																	<X className="size-3.5" />
																</button>
															</div>
															{patError && (
																<p className="mt-1.5 text-[10px] font-mono text-destructive">
																	{
																		patError
																	}
																</p>
															)}
															<p className="mt-1.5 text-[10px] font-mono text-muted-foreground">
																Paste
																a
																GitHub
																PAT
																to
																add
																another
																account.
															</p>
														</div>
													) : (
														(() => {
															const idx =
																getNextIndex();
															return (
																<CommandItemButton
																	index={
																		idx
																	}
																	selected={
																		selectedIndex ===
																		idx
																	}
																	onClick={() => {
																		setAddingAccount(
																			true,
																		);
																		setPatInput(
																			"",
																		);
																		setPatError(
																			"",
																		);
																	}}
																>
																	<Plus className="size-3.5 text-muted-foreground/50 shrink-0" />
																	<span className="text-[13px] text-foreground">
																		Add
																		Account
																	</span>
																	<span className="text-[11px] text-muted-foreground hidden sm:block">
																		via
																		Personal
																		Access
																		Token
																	</span>
																</CommandItemButton>
															);
														})()
													)}
												</CommandGroup>
											</>
										) : (
											<div className="py-8 text-center text-sm text-muted-foreground/70">
												Failed
												to
												load
												accounts
											</div>
										)}
									</>
								) : mode === "settings" ? (
									/* Settings mode */
									<>
										<CommandGroup title="Configuration">
											{(() => {
												const idx =
													getNextIndex();
												return (
													<CommandItemButton
														key="settings-theme"
														index={
															idx
														}
														selected={
															selectedIndex ===
															idx
														}
														onClick={() =>
															switchMode(
																"theme",
															)
														}
													>
														<Palette className="size-3.5 text-muted-foreground/50 shrink-0" />
														<span className="text-[13px] text-foreground flex-1">
															Theme
														</span>
														<span className="text-[11px] text-muted-foreground hidden sm:block">
															{colorThemes.find(
																(
																	t,
																) =>
																	t.id ===
																	currentThemeId,
															)
																?.name ??
																"Theme"}
														</span>
														<ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
													</CommandItemButton>
												);
											})()}
											{(() => {
												const idx =
													getNextIndex();
												const radiusLabel =
													currentBorderRadius
														.charAt(
															0,
														)
														.toUpperCase() +
													currentBorderRadius.slice(
														1,
													);
												return (
													<CommandItemButton
														key="settings-radius"
														index={
															idx
														}
														selected={
															selectedIndex ===
															idx
														}
														onClick={() =>
															switchMode(
																"radius",
															)
														}
													>
														<Square className="size-3.5 text-muted-foreground/50 shrink-0" />
														<span className="text-[13px] text-foreground flex-1">
															Border
															Radius
														</span>
														<span className="text-[11px] text-muted-foreground hidden sm:block">
															{
																radiusLabel
															}
														</span>
														<ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
													</CommandItemButton>
												);
											})()}
											{(() => {
												const idx =
													getNextIndex();
												const currentModel =
													settingsData?.ghostModel ??
													"";
												const modelLabel =
													MODELS.find(
														(
															m,
														) =>
															m.id ===
															currentModel,
													)
														?.label ??
													currentModel
														.split(
															"/",
														)
														.pop() ??
													"—";
												return (
													<CommandItemButton
														key="settings-model"
														index={
															idx
														}
														selected={
															selectedIndex ===
															idx
														}
														onClick={() =>
															switchMode(
																"model",
															)
														}
													>
														<Bot className="size-3.5 text-muted-foreground/50 shrink-0" />
														<span className="text-[13px] text-foreground flex-1">
															Ghost
															Model
														</span>
														<span className="text-[11px] text-muted-foreground hidden sm:block">
															{settingsLoading
																? "…"
																: modelLabel}
														</span>
														<ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
													</CommandItemButton>
												);
											})()}
											{(() => {
												const idx =
													getNextIndex();
												return (
													<CommandItemButton
														key="settings-accounts"
														index={
															idx
														}
														selected={
															selectedIndex ===
															idx
														}
														onClick={() =>
															switchMode(
																"accounts",
															)
														}
													>
														<Users className="size-3.5 text-muted-foreground/50 shrink-0" />
														<span className="text-[13px] text-foreground flex-1">
															Account
															Settings
														</span>
														<span className="text-[11px] text-muted-foreground hidden sm:block">
															Profile,
															accounts
															&
															sign
															out
														</span>
														<ChevronRight className="size-3 text-muted-foreground/30 shrink-0" />
													</CommandItemButton>
												);
											})()}
										</CommandGroup>
									</>
								) : mode === "files" ? (
									/* Files mode */
									<>
										{fileTreeLoading ? (
											<div className="flex items-center justify-center py-8 gap-2">
												<Loader2 className="size-4 text-muted-foreground animate-spin" />
												<span className="text-xs text-muted-foreground">
													Loading
													file
													tree...
												</span>
											</div>
										) : filteredFiles.length >
										  0 ? (
											<CommandGroup
												title={
													hasQuery
														? "Files"
														: "Repository Files"
												}
											>
												{filteredFiles.map(
													(
														filePath,
													) => {
														const idx =
															getNextIndex();
														return (
															<FileItem
																key={
																	filePath
																}
																path={
																	filePath
																}
																index={
																	idx
																}
																selected={
																	selectedIndex ===
																	idx
																}
																onClick={() =>
																	runCommand(
																		() =>
																			router.push(
																				`/${repoContext![0]}/${repoContext![1]}/blob/${fileTree!.defaultBranch}/${filePath}`,
																			),
																	)
																}
															/>
														);
													},
												)}
											</CommandGroup>
										) : hasQuery ? (
											<div className="py-8 text-center text-sm text-muted-foreground/70">
												No
												files
												match
												&quot;
												{
													search
												}
												&quot;
											</div>
										) : !fileTree ? (
											<div className="py-8 text-center text-sm text-muted-foreground">
												Could
												not
												load
												file
												tree
											</div>
										) : (
											<div className="py-8 text-center text-sm text-muted-foreground">
												Start
												typing
												to
												search
												files
											</div>
										)}
									</>
								) : (
									/* Model mode */
									<>
										<CommandGroup title="Ghost Model">
											{filteredModels.map(
												(
													model,
												) => {
													const idx =
														getNextIndex();
													const isActive =
														settingsData?.ghostModel ===
														model.id;
													return (
														<CommandItemButton
															key={
																model.id
															}
															index={
																idx
															}
															selected={
																selectedIndex ===
																idx
															}
															onClick={() =>
																updateSetting(
																	{
																		ghostModel: model.id,
																	},
																)
															}
														>
															<Bot className="size-3.5 text-muted-foreground/50 shrink-0" />
															<span className="text-[13px] text-foreground flex-1">
																{
																	model.label
																}
															</span>
															<span className="text-[11px] text-muted-foreground hidden sm:block">
																{
																	model.desc
																}
															</span>
															{isActive && (
																<Check className="size-3.5 text-success shrink-0" />
															)}
														</CommandItemButton>
													);
												},
											)}
										</CommandGroup>
										{hasQuery &&
											filteredModels.length ===
												0 && (
												<div className="py-8 text-center text-sm text-muted-foreground/70">
													No
													models
													match
													&quot;
													{
														search
													}
													&quot;
												</div>
											)}
									</>
								)}
							</div>

							{/* Footer */}
							<div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border/60 dark:border-white/4">
								<div className="flex items-center gap-2.5 text-[10px] text-muted-foreground/50">
									<div className="flex items-center gap-1.5">
										<div className="flex gap-0.5">
											<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-muted/60 dark:bg-white/[0.06] px-1 font-mono text-[9px] text-muted-foreground/60 shadow-[0_1px_0_0] shadow-border/80 dark:shadow-white/[0.06]">
												↑
											</kbd>
											<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-muted/60 dark:bg-white/[0.06] px-1 font-mono text-[9px] text-muted-foreground/60 shadow-[0_1px_0_0] shadow-border/80 dark:shadow-white/[0.06]">
												↓
											</kbd>
										</div>
										<span>
											navigate
										</span>
									</div>
									<div className="flex items-center gap-1.5">
										<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-muted/60 dark:bg-white/[0.06] px-1 font-mono text-[9px] text-muted-foreground/60 shadow-[0_1px_0_0] shadow-border/80 dark:shadow-white/[0.06]">
											↵
										</kbd>
										<span>select</span>
									</div>
									{mode === "commands" ? (
										<div className="flex items-center gap-1.5">
											<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-muted/60 dark:bg-white/[0.06] px-1 font-mono text-[9px] text-muted-foreground/60 shadow-[0_1px_0_0] shadow-border/80 dark:shadow-white/[0.06]">
												/
											</kbd>
											<span>
												repos
											</span>
										</div>
									) : (
										<div className="flex items-center gap-1.5">
											<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-muted/60 dark:bg-white/[0.06] px-1 font-mono text-[9px] text-muted-foreground/60 shadow-[0_1px_0_0] shadow-border/80 dark:shadow-white/[0.06]">
												⌫
											</kbd>
											<span>
												back
											</span>
										</div>
									)}
									<div className="flex items-center gap-1.5">
										<kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] bg-muted/60 dark:bg-white/[0.06] px-1.5 font-mono text-[9px] text-muted-foreground/60 shadow-[0_1px_0_0] shadow-border/80 dark:shadow-white/[0.06]">
											esc
										</kbd>
										<span>close</span>
									</div>
								</div>
								<div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
									<kbd className="inline-flex h-[18px] items-center justify-center rounded-[4px] bg-muted/60 dark:bg-white/[0.06] px-1.5 font-mono text-[9px] text-muted-foreground/60 shadow-[0_1px_0_0] shadow-border/80 dark:shadow-white/[0.06]">
										Tab
									</kbd>
									<span>switch</span>
								</div>
							</div>
						</>
					</div>
				</>,
				document.body,
			)}
		</>
	);
}

function RepoItem({
	repo,
	index,
	selected,
	onClick,
}: {
	repo: SearchRepo;
	index: number;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			data-index={index}
			className={cn(
				"w-full group flex items-center gap-3 px-4 py-2 text-left transition-colors duration-100 cursor-pointer",
				"hover:bg-accent dark:hover:bg-white/3 focus:outline-none",
				selected && "bg-accent dark:bg-white/3",
			)}
		>
			{repo.owner ? (
				<img
					src={repo.owner.avatar_url}
					alt={repo.owner.login}
					className="w-4 h-4 rounded-full shrink-0"
				/>
			) : (
				<div className="w-4 h-4 rounded-full bg-muted/50 shrink-0" />
			)}
			<div className="flex-1 min-w-0">
				<span className="text-sm text-foreground font-mono">
					{repo.full_name}
				</span>
				{repo.description && (
					<p className="text-[11px] text-muted-foreground mt-0.5 truncate">
						{repo.description}
					</p>
				)}
			</div>
			<div className="flex items-center gap-2.5 shrink-0">
				{repo.language && (
					<span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
						<span
							className="w-2 h-2 rounded-full"
							style={{
								backgroundColor: getLanguageColor(
									repo.language,
								),
							}}
						/>
						{repo.language}
					</span>
				)}
				{repo.stargazers_count > 0 && (
					<span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/70">
						<Star className="w-3 h-3" />
						{formatNumber(repo.stargazers_count)}
					</span>
				)}
				<ChevronRight className="w-3 h-3 text-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" />
			</div>
		</button>
	);
}

function FileItem({
	path,
	index,
	selected,
	onClick,
}: {
	path: string;
	index: number;
	selected: boolean;
	onClick: () => void;
}) {
	const parts = path.split("/");
	const filename = parts.pop() ?? path;
	const dir = parts.join("/");

	return (
		<button
			onClick={onClick}
			data-index={index}
			className={cn(
				"w-full group flex items-center gap-3 px-4 py-2 text-left transition-colors duration-100 cursor-pointer",
				"hover:bg-accent dark:hover:bg-white/3 focus:outline-none",
				selected && "bg-accent dark:bg-white/3",
			)}
		>
			<FileText className="size-3.5 text-muted-foreground shrink-0" />
			<div className="flex-1 min-w-0 truncate font-mono text-sm">
				{dir && <span className="text-muted-foreground">{dir}/</span>}
				<span className="text-foreground">{filename}</span>
			</div>
		</button>
	);
}

function CommandGroup({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="py-1">
			<div className="px-4 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider select-none">
				{title}
			</div>
			{children}
		</div>
	);
}

function CommandItemButton({
	children,
	onClick,
	className,
	index,
	selected,
}: {
	children: React.ReactNode;
	onClick: () => void;
	className?: string;
	index?: number;
	selected?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			data-index={index}
			className={cn(
				"w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-100 cursor-pointer",
				"hover:bg-accent dark:hover:bg-white/3 focus:outline-none",
				selected && "bg-accent dark:bg-white/3",
				className,
			)}
		>
			{children}
		</button>
	);
}
