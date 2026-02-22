"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
	Search,
	Loader2,
	ChevronLeft,
	ChevronRight,
	Star,
	GitFork,
	Users,
	Code,
	BookOpen,
	GitPullRequest,
	CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLanguageColor } from "@/lib/github-utils";

type SearchCategory = "code" | "repos" | "issues" | "prs" | "users";

const categories: { key: SearchCategory; label: string; icon: typeof Code }[] = [
	{ key: "code", label: "Code", icon: Code },
	{ key: "repos", label: "Repos", icon: BookOpen },
	{ key: "issues", label: "Issues", icon: CircleDot },
	{ key: "prs", label: "PRs", icon: GitPullRequest },
	{ key: "users", label: "Users", icon: Users },
];

const popularLanguages = [
	"TypeScript",
	"JavaScript",
	"Python",
	"Go",
	"Rust",
	"Java",
	"Ruby",
	"C++",
	"PHP",
	"Swift",
	"Kotlin",
	"Shell",
];

const categoryEndpoints: Record<SearchCategory, string> = {
	code: "/api/search-code",
	repos: "/api/search-repos",
	issues: "/api/search-issues",
	prs: "/api/search-prs",
	users: "/api/search-users",
};

// --- Types ---

interface TextMatch {
	fragment: string;
	matches: { text: string; indices: number[] }[];
}

interface CodeSearchItem {
	name: string;
	path: string;
	html_url: string;
	repository: {
		full_name: string;
		owner: {
			login: string;
			avatar_url: string;
		};
	};
	text_matches?: TextMatch[];
}

interface RepoSearchItem {
	full_name: string;
	description: string | null;
	stargazers_count: number;
	forks_count: number;
	language: string | null;
	owner: {
		login: string;
		avatar_url: string;
	};
}

interface IssueSearchItem {
	number: number;
	title: string;
	state: string;
	created_at: string;
	updated_at: string;
	pull_request?: { merged_at: string | null };
	repository_url: string;
	user: {
		login: string;
		avatar_url: string;
	} | null;
	labels: { name: string; color: string | null }[];
}

interface UserSearchItem {
	login: string;
	avatar_url: string;
	html_url: string;
	type: string;
	bio?: string | null;
	name?: string | null;
	followers?: number;
}

type SearchItem = CodeSearchItem | RepoSearchItem | IssueSearchItem | UserSearchItem;

interface SearchResponse {
	total_count: number;
	items: SearchItem[];
}

// --- Highlight helpers ---

function highlightFragment(fragment: string, matches: { text: string; indices: number[] }[]) {
	if (!matches || matches.length === 0) return fragment;

	const highlighted = new Set<number>();
	for (const match of matches) {
		let searchFrom = 0;
		const text = match.text;
		while (searchFrom < fragment.length) {
			const pos = fragment.indexOf(text, searchFrom);
			if (pos === -1) break;
			for (let i = pos; i < pos + text.length; i++) {
				highlighted.add(i);
			}
			searchFrom = pos + text.length;
		}
	}

	const segments: { text: string; isMatch: boolean }[] = [];
	let i = 0;
	while (i < fragment.length) {
		const isMatch = highlighted.has(i);
		let j = i;
		while (j < fragment.length && highlighted.has(j) === isMatch) {
			j++;
		}
		segments.push({ text: fragment.slice(i, j), isMatch });
		i = j;
	}

	return segments;
}

// --- Result renderers ---

function CodeFragment({ fragment, matches }: { fragment: string; matches: TextMatch["matches"] }) {
	const segments = highlightFragment(fragment, matches);
	const lines = typeof segments === "string" ? segments.split("\n") : null;

	if (lines) {
		return (
			<pre className="text-[12px] leading-5 font-mono overflow-x-auto">
				{lines.map((line, i) => (
					<div key={i} className="flex">
						<span className="select-none text-muted-foreground/30 w-8 text-right pr-3 shrink-0">
							{i + 1}
						</span>
						<span>{line}</span>
					</div>
				))}
			</pre>
		);
	}

	const lineGroups: { text: string; isMatch: boolean }[][] = [[]];
	for (const seg of segments as { text: string; isMatch: boolean }[]) {
		const parts = seg.text.split("\n");
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) lineGroups.push([]);
			if (parts[i]) {
				lineGroups[lineGroups.length - 1].push({
					text: parts[i],
					isMatch: seg.isMatch,
				});
			}
		}
	}

	return (
		<pre className="text-[12px] leading-5 font-mono overflow-x-auto">
			{lineGroups.map((lineSegs, i) => (
				<div key={i} className="flex">
					<span className="select-none text-muted-foreground/30 w-8 text-right pr-3 shrink-0">
						{i + 1}
					</span>
					<span>
						{lineSegs.map((seg, j) =>
							seg.isMatch ? (
								<mark
									key={j}
									className="bg-warning/25 text-foreground rounded-sm px-px"
								>
									{seg.text}
								</mark>
							) : (
								<span key={j}>{seg.text}</span>
							),
						)}
					</span>
				</div>
			))}
		</pre>
	);
}

function CodeResultItem({ item }: { item: CodeSearchItem }) {
	return (
		<div className="border border-border rounded-md overflow-hidden">
			<div className="flex items-center gap-2 px-3 py-2 bg-muted/20 dark:bg-white/[0.015] border-b border-border">
				<img
					src={item.repository.owner.avatar_url}
					alt={item.repository.owner.login}
					className="w-4 h-4 rounded-full shrink-0"
				/>
				<a
					href={`/${item.repository.full_name}`}
					className="text-[12px] font-mono text-foreground hover:underline"
				>
					{item.repository.full_name}
				</a>
				<span className="text-muted-foreground/30 text-[12px]">
					&rsaquo;
				</span>
				<a
					href={`/${item.repository.full_name}/blob/HEAD/${item.path}`}
					className="text-[12px] font-mono text-muted-foreground/70 hover:text-foreground hover:underline truncate"
				>
					{item.path}
				</a>
			</div>
			{item.text_matches && item.text_matches.length > 0 ? (
				<div className="divide-y divide-border/60">
					{item.text_matches.slice(0, 3).map((tm, j) => (
						<div key={j} className="px-3 py-2 overflow-x-auto">
							<CodeFragment
								fragment={tm.fragment}
								matches={tm.matches}
							/>
						</div>
					))}
				</div>
			) : (
				<div className="px-3 py-2 text-xs text-muted-foreground/50 font-mono">
					{item.path}
				</div>
			)}
		</div>
	);
}

function RepoResultItem({ item }: { item: RepoSearchItem }) {
	return (
		<a
			href={`/${item.full_name}`}
			className="block border border-border rounded-md p-4 hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors"
		>
			<div className="flex items-start gap-3">
				<img
					src={item.owner.avatar_url}
					alt={item.owner.login}
					className="w-5 h-5 rounded-full shrink-0 mt-0.5"
				/>
				<div className="min-w-0 flex-1">
					<div className="text-sm font-mono text-foreground">
						{item.full_name}
					</div>
					{item.description && (
						<p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
							{item.description}
						</p>
					)}
					<div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground/50 font-mono">
						{item.language && (
							<span className="flex items-center gap-1.5">
								<span
									className="w-2 h-2 rounded-full shrink-0"
									style={{
										backgroundColor:
											getLanguageColor(
												item.language,
											),
									}}
								/>
								{item.language}
							</span>
						)}
						<span className="flex items-center gap-1">
							<Star className="w-3 h-3" />
							{item.stargazers_count.toLocaleString()}
						</span>
						<span className="flex items-center gap-1">
							<GitFork className="w-3 h-3" />
							{item.forks_count.toLocaleString()}
						</span>
					</div>
				</div>
			</div>
		</a>
	);
}

function repoFromUrl(repositoryUrl: string): string {
	// repository_url is like "https://api.github.com/repos/owner/repo"
	const match = repositoryUrl.match(/repos\/(.+)$/);
	return match ? match[1] : "";
}

function IssueResultItem({ item }: { item: IssueSearchItem }) {
	const repo = repoFromUrl(item.repository_url);
	const isOpen = item.state === "open";

	return (
		<a
			href={`/${repo}/issues/${item.number}`}
			className="flex items-start gap-3 border border-border rounded-md p-4 hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors"
		>
			<CircleDot
				className={cn(
					"w-4 h-4 shrink-0 mt-0.5",
					isOpen ? "text-success" : "text-alert-important",
				)}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-[11px] font-mono text-muted-foreground/50">
						{repo}
					</span>
					<span className="text-muted-foreground/30 text-[11px]">
						#{item.number}
					</span>
				</div>
				<div className="text-sm text-foreground mt-0.5">{item.title}</div>
				<div className="flex items-center gap-2 mt-1.5 flex-wrap">
					<span
						className={cn(
							"text-[10px] font-mono px-1.5 py-0.5 rounded-full border",
							isOpen
								? "text-success border-success/30 bg-success/10"
								: "text-alert-important border-alert-important/30 bg-alert-important/10",
						)}
					>
						{isOpen ? "open" : "closed"}
					</span>
					{item.labels.slice(0, 3).map((label) => (
						<span
							key={label.name}
							className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-border text-muted-foreground/60"
							style={
								label.color
									? {
											backgroundColor: `#${label.color}20`,
											borderColor: `#${label.color}40`,
											color: `#${label.color}`,
										}
									: undefined
							}
						>
							{label.name}
						</span>
					))}
					<span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">
						{new Date(item.updated_at).toLocaleDateString()}
					</span>
				</div>
			</div>
		</a>
	);
}

function PRResultItem({ item }: { item: IssueSearchItem }) {
	const repo = repoFromUrl(item.repository_url);
	const isMerged = item.pull_request?.merged_at != null;
	const isOpen = item.state === "open";
	const stateLabel = isMerged ? "merged" : isOpen ? "open" : "closed";

	return (
		<a
			href={`/${repo}/pulls/${item.number}`}
			className="flex items-start gap-3 border border-border rounded-md p-4 hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors"
		>
			<GitPullRequest
				className={cn(
					"w-4 h-4 shrink-0 mt-0.5",
					isMerged
						? "text-alert-important"
						: isOpen
							? "text-success"
							: "text-destructive",
				)}
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-[11px] font-mono text-muted-foreground/50">
						{repo}
					</span>
					<span className="text-muted-foreground/30 text-[11px]">
						#{item.number}
					</span>
				</div>
				<div className="text-sm text-foreground mt-0.5">{item.title}</div>
				<div className="flex items-center gap-2 mt-1.5 flex-wrap">
					<span
						className={cn(
							"text-[10px] font-mono px-1.5 py-0.5 rounded-full border",
							isMerged
								? "text-alert-important border-alert-important/30 bg-alert-important/10"
								: isOpen
									? "text-success border-success/30 bg-success/10"
									: "text-destructive border-destructive/30 bg-destructive/10",
						)}
					>
						{stateLabel}
					</span>
					{item.labels.slice(0, 3).map((label) => (
						<span
							key={label.name}
							className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-border text-muted-foreground/60"
							style={
								label.color
									? {
											backgroundColor: `#${label.color}20`,
											borderColor: `#${label.color}40`,
											color: `#${label.color}`,
										}
									: undefined
							}
						>
							{label.name}
						</span>
					))}
					<span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">
						{new Date(item.updated_at).toLocaleDateString()}
					</span>
				</div>
			</div>
		</a>
	);
}

function UserResultItem({ item }: { item: UserSearchItem }) {
	return (
		<a
			href={`/users/${item.login}`}
			className="flex items-center gap-4 border border-border rounded-md p-4 hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors"
		>
			<img
				src={item.avatar_url}
				alt={item.login}
				className="w-10 h-10 rounded-full shrink-0"
			/>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-mono text-foreground">
					{item.login}
				</div>
				{item.name && (
					<div className="text-xs text-muted-foreground/60 mt-0.5">
						{item.name}
					</div>
				)}
				{item.bio && (
					<p className="text-xs text-muted-foreground/50 mt-1 line-clamp-1">
						{item.bio}
					</p>
				)}
			</div>
			{item.followers != null && (
				<div className="text-xs font-mono text-muted-foreground/40 shrink-0 flex items-center gap-1">
					<Users className="w-3 h-3" />
					{item.followers.toLocaleString()}
				</div>
			)}
		</a>
	);
}

// --- Main component ---

export function SearchContent({
	initialQuery,
	initialLanguage,
	initialPage,
	initialType = "code",
}: {
	initialQuery: string;
	initialLanguage: string;
	initialPage: number;
	initialType?: SearchCategory;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [language, setLanguage] = useState(initialLanguage);
	const [page, setPage] = useState(initialPage);
	const [category, setCategory] = useState<SearchCategory>(initialType);
	const [results, setResults] = useState<SearchResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const perPage = 30;

	const showLanguageFilters = category === "code" || category === "repos";

	const doSearch = useCallback(
		async (q: string, lang: string, p: number, cat: SearchCategory) => {
			if (!q.trim()) {
				setResults(null);
				setLoading(false);
				return;
			}

			if (abortRef.current) abortRef.current.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			setLoading(true);

			try {
				const params = new URLSearchParams({
					q,
					page: String(p),
					per_page: String(perPage),
				});
				if (lang && (cat === "code" || cat === "repos"))
					params.set("language", lang);

				const res = await fetch(`${categoryEndpoints[cat]}?${params}`, {
					signal: controller.signal,
				});

				if (res.ok) {
					const data: SearchResponse = await res.json();
					setResults(data);
				}
			} catch (e: unknown) {
				if (e instanceof Error && e.name !== "AbortError") {
					// silent
				}
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		},
		[perPage],
	);

	const updateUrl = useCallback((q: string, lang: string, p: number, cat: SearchCategory) => {
		const params = new URLSearchParams();
		if (q) params.set("q", q);
		if (cat !== "code") params.set("type", cat);
		if (lang && (cat === "code" || cat === "repos")) params.set("lang", lang);
		if (p > 1) params.set("page", String(p));
		const search = params.toString();
		window.history.replaceState(null, "", search ? `?${search}` : "/search");
	}, []);

	// Initial search
	useEffect(() => {
		if (initialQuery) {
			doSearch(initialQuery, initialLanguage, initialPage, initialType);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Debounced search on query change
	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);

		debounceRef.current = setTimeout(() => {
			const newPage = 1;
			setPage(newPage);
			updateUrl(query, language, newPage, category);
			doSearch(query, language, newPage, category);
		}, 300);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [query]);

	const handleLanguageChange = useCallback(
		(lang: string) => {
			const newLang = language === lang ? "" : lang;
			setLanguage(newLang);
			const newPage = 1;
			setPage(newPage);
			updateUrl(query, newLang, newPage, category);
			doSearch(query, newLang, newPage, category);
		},
		[language, query, category, doSearch, updateUrl],
	);

	const handleCategoryChange = useCallback(
		(cat: SearchCategory) => {
			setCategory(cat);
			setPage(1);
			setResults(null);
			updateUrl(query, language, 1, cat);
			doSearch(query, language, 1, cat);
		},
		[query, language, doSearch, updateUrl],
	);

	const handlePageChange = useCallback(
		(newPage: number) => {
			setPage(newPage);
			updateUrl(query, language, newPage, category);
			doSearch(query, language, newPage, category);
			window.scrollTo({ top: 0, behavior: "smooth" });
		},
		[query, language, category, doSearch, updateUrl],
	);

	const totalPages = results ? Math.ceil(Math.min(results.total_count, 1000) / perPage) : 0;

	const renderResults = () => {
		if (!results || results.items.length === 0) return null;

		switch (category) {
			case "code":
				return (results.items as CodeSearchItem[]).map((item, i) => (
					<CodeResultItem
						key={`${item.repository.full_name}-${item.path}-${i}`}
						item={item}
					/>
				));
			case "repos":
				return (results.items as RepoSearchItem[]).map((item) => (
					<RepoResultItem key={item.full_name} item={item} />
				));
			case "issues":
				return (results.items as IssueSearchItem[]).map((item) => (
					<IssueResultItem
						key={`${item.repository_url}-${item.number}`}
						item={item}
					/>
				));
			case "prs":
				return (results.items as IssueSearchItem[]).map((item) => (
					<PRResultItem
						key={`${item.repository_url}-${item.number}`}
						item={item}
					/>
				));
			case "users":
				return (results.items as UserSearchItem[]).map((item) => (
					<UserResultItem key={item.login} item={item} />
				));
		}
	};

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header */}
			<div className="shrink-0 mb-6">
				<h1 className="text-xl font-medium tracking-tight mb-4">Search</h1>

				{/* Search input */}
				<div className="relative max-w-2xl">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
					<input
						ref={inputRef}
						type="text"
						placeholder="Search across GitHub..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="w-full bg-transparent border border-border pl-10 pr-10 py-2.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
					/>
					{loading && (
						<Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 animate-spin" />
					)}
				</div>

				{/* Category tabs */}
				<div className="flex items-center gap-1 mt-3 border-b border-border">
					{categories.map(({ key, label, icon: Icon }) => (
						<button
							key={key}
							onClick={() => handleCategoryChange(key)}
							className={cn(
								"flex items-center gap-1.5 px-3 py-2 text-[12px] font-mono transition-colors cursor-pointer -mb-px border-b-2",
								category === key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground/60 hover:text-foreground/80",
							)}
						>
							<Icon className="w-3.5 h-3.5" />
							{label}
						</button>
					))}
				</div>

				{/* Language filters */}
				{showLanguageFilters && (
					<div className="flex items-center gap-1.5 mt-3 flex-wrap">
						{popularLanguages.map((lang) => (
							<button
								key={lang}
								onClick={() =>
									handleLanguageChange(lang)
								}
								className={cn(
									"flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border transition-colors cursor-pointer rounded-full",
									language === lang
										? "border-foreground/30 bg-muted/50 dark:bg-white/6 text-foreground"
										: "border-border text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
								)}
							>
								<span
									className="w-2 h-2 rounded-full shrink-0"
									style={{
										backgroundColor:
											getLanguageColor(
												lang,
											),
									}}
								/>
								{lang}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Results count */}
			{results && query.trim() && (
				<div className="shrink-0 mb-3 text-xs text-muted-foreground/60 font-mono">
					{results.total_count.toLocaleString()} results
				</div>
			)}

			{/* Results */}
			{!query.trim() ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<div className="text-center">
						<Search className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
						<p className="text-sm text-muted-foreground/50 font-mono">
							Search across GitHub
						</p>
						<p className="text-xs text-muted-foreground/30 mt-2 font-mono">
							Try &quot;useState hooks&quot; or
							&quot;async await fetch&quot;
						</p>
					</div>
				</div>
			) : results && results.items.length === 0 && !loading ? (
				<div className="flex-1 min-h-0 flex items-center justify-center">
					<div className="text-center">
						<Search className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
						<p className="text-sm text-muted-foreground/50 font-mono">
							No matches for &quot;{query}&quot;
						</p>
					</div>
				</div>
			) : results && results.items.length > 0 ? (
				<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
					{renderResults()}

					{/* Pagination */}
					{totalPages > 1 && (
						<div className="flex items-center justify-center gap-3 py-6">
							<button
								onClick={() =>
									handlePageChange(page - 1)
								}
								disabled={page <= 1}
								className={cn(
									"flex items-center gap-1 px-3 py-1.5 text-xs font-mono border border-border rounded-md transition-colors cursor-pointer",
									page <= 1
										? "opacity-30 cursor-not-allowed"
										: "hover:bg-muted/50 dark:hover:bg-white/4 text-foreground",
								)}
							>
								<ChevronLeft className="w-3 h-3" />
								Prev
							</button>
							<span className="text-xs font-mono text-muted-foreground/60">
								Page {page} of {totalPages}
							</span>
							<button
								onClick={() =>
									handlePageChange(page + 1)
								}
								disabled={page >= totalPages}
								className={cn(
									"flex items-center gap-1 px-3 py-1.5 text-xs font-mono border border-border rounded-md transition-colors cursor-pointer",
									page >= totalPages
										? "opacity-30 cursor-not-allowed"
										: "hover:bg-muted/50 dark:hover:bg-white/4 text-foreground",
								)}
							>
								Next
								<ChevronRight className="w-3 h-3" />
							</button>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}
