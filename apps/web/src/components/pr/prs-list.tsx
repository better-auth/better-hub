"use client";

import { useState, useMemo, useRef, useCallback, useTransition, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
	GitPullRequest,
	GitPullRequestClosed,
	GitMerge,
	MessageSquare,
	Clock,
	GitBranch,
	FileCode2,
	X,
	Loader2,
} from "lucide-react";
import type { CheckStatus, PRPageResult } from "@/lib/github";
import { CheckStatusBadge } from "@/components/pr/check-status-badge";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { useClickOutside } from "@/hooks/use-click-outside";
import {
	ListSearchInput,
	SortCycleButton,
	FiltersButton,
	ClearFiltersButton,
	LoadingOverlay,
} from "@/components/shared/list-controls";
import { LabelBadge } from "@/components/shared/label-badge";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerInitialData } from "@/hooks/use-server-initial-data";
import { UserTooltip } from "@/components/shared/user-tooltip";

interface PRUser {
	login: string;
	avatar_url: string;
}

interface PR {
	id: number;
	number: number;
	title: string;
	state: string;
	draft: boolean;
	updated_at: string;
	created_at: string;
	comments: number;
	review_comments: number;
	user: PRUser | null;
	labels: Array<{ name?: string; color?: string }>;
	merged_at: string | null;
	head: { ref: string; sha: string };
	base: { ref: string };
	requested_reviewers: PRUser[];
	assignees: PRUser[];
	additions: number;
	deletions: number;
	changed_files: number;
	checkStatus?: CheckStatus;
}

function useBatchCheckStatuses(
	owner: string,
	repo: string,
	openPRs: PR[],
	onFetchAllCheckStatuses?: (
		owner: string,
		repo: string,
		prNumbers: number[],
	) => Promise<Record<number, CheckStatus>>,
) {
	const prNumbers = useMemo(() => openPRs.map((pr) => pr.number), [openPRs]);

	const { data: statusMap = {}, isFetched: loaded } = useQuery({
		queryKey: ["pr-check-statuses", owner, repo, prNumbers],
		queryFn: () => onFetchAllCheckStatuses!(owner, repo, prNumbers),
		enabled: !!onFetchAllCheckStatuses && openPRs.length > 0,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	return { statusMap, loaded };
}

function PRCheckStatus({
	pr,
	owner,
	repo,
	resolvedStatus,
	loaded,
}: {
	pr: PR;
	owner: string;
	repo: string;
	resolvedStatus: CheckStatus | undefined;
	loaded: boolean;
}) {
	if (pr.checkStatus) {
		return <CheckStatusBadge checkStatus={pr.checkStatus} owner={owner} repo={repo} />;
	}

	if (!loaded && pr.state === "open") {
		return (
			<span className="flex items-center gap-1 animate-pulse">
				<span className="w-3 h-3 rounded-full bg-muted-foreground/15" />
				<span className="w-6 h-2.5 rounded-sm bg-muted-foreground/10" />
			</span>
		);
	}

	if (resolvedStatus) {
		return <CheckStatusBadge checkStatus={resolvedStatus} owner={owner} repo={repo} />;
	}

	return null;
}

type SortType = "updated" | "newest" | "oldest" | "comments";
type DraftFilter = "all" | "ready" | "draft";
type ReviewFilter = "all" | "has_reviewers" | "no_reviewers";
type AssigneeFilter = "all" | "assigned" | "unassigned";

const sortLabels: Record<SortType, string> = {
	updated: "Updated",
	newest: "Newest",
	oldest: "Oldest",
	comments: "Comments",
};

const sortCycle: SortType[] = ["updated", "newest", "oldest", "comments"];

type FetchPRPageFn = (
	owner: string,
	repo: string,
	state: "open" | "closed" | "all",
	cursor: string | null,
) => Promise<{ prs: PRPageResult["prs"]; pageInfo: PRPageResult["pageInfo"] }>;

export function PRsList({
	owner,
	repo,
	initialOpenPRs,
	initialPageInfo,
	mergedPreview: initialMergedPreview,
	closedPreview: initialClosedPreview,
	openCount,
	closedCount,
	mergedCount,
	onAuthorFilter,
	onFetchAllCheckStatuses,
	onPrefetchPRDetail,
	onFetchPRPage,
	currentUserLogin,
}: {
	owner: string;
	repo: string;
	initialOpenPRs: PR[];
	initialPageInfo: PRPageResult["pageInfo"];
	mergedPreview?: PR[];
	closedPreview?: PR[];
	openCount: number;
	closedCount: number;
	mergedCount: number;
	onAuthorFilter?: (
		owner: string,
		repo: string,
		author: string,
	) => Promise<{ open: PR[]; closed: PR[] }>;
	onFetchAllCheckStatuses?: (
		owner: string,
		repo: string,
		prNumbers: number[],
	) => Promise<Record<number, CheckStatus>>;
	onPrefetchPRDetail?: (
		owner: string,
		repo: string,
		pullNumber: number,
		authorLogin?: string | null,
	) => Promise<void>;
	onFetchPRPage?: FetchPRPageFn;
	currentUserLogin?: string | null;
}) {
	type TabState = "open" | "merged" | "closed";
	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");
	const initialTab: TabState =
		tabParam === "merged" || tabParam === "closed" ? tabParam : "open";
	const [state, setState] = useState<TabState>(initialTab);
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortType>("updated");
	const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
	const [authorSearch, setAuthorSearch] = useState("");
	const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
	const authorRef = useRef<HTMLDivElement>(null);
	const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
	const [authorPRs, setAuthorPRs] = useState<{
		open: PR[];
		closed: PR[];
	} | null>(null);
	const [isPending, startTransition] = useTransition();
	const [showFilters, setShowFilters] = useState(false);
	const [draftFilter, setDraftFilter] = useState<DraftFilter>("all");
	const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
	const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
	const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
	const [countAdjustments, setCountAdjustments] = useState({ open: 0, merged: 0, closed: 0 });

	type PRPage = { prs: PR[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };

	const queryClient = useQueryClient();

	const openDataFingerprint = useMemo(() => {
		if (initialOpenPRs.length === 0) return "empty";
		const ids = initialOpenPRs
			.slice(0, 5)
			.map((pr) => pr.id)
			.join("-");
		return `${ids}:${initialOpenPRs.length}:${initialPageInfo.endCursor ?? ""}`;
	}, [initialOpenPRs, initialPageInfo]);

	const openQueryKey = useMemo(() => ["prs", owner, repo, "open"], [owner, repo]);
	const closedQueryKey = useMemo(() => ["prs", owner, repo, "closed"], [owner, repo]);

	useServerInitialData(
		openQueryKey,
		{
			pages: [{ prs: initialOpenPRs, pageInfo: initialPageInfo }],
			pageParams: [null],
		},
		openDataFingerprint,
	);

	// When open data changes (e.g. a PR was merged/closed), also clear the
	// stale closed-query cache so it re-fetches when the user switches tabs.
	useEffect(() => {
		queryClient.removeQueries({ queryKey: closedQueryKey });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [openDataFingerprint]);

	const openQuery = useInfiniteQuery<
		PRPage,
		Error,
		{ pages: PRPage[]; pageParams: (string | null)[] },
		string[],
		string | null
	>({
		queryKey: openQueryKey,
		queryFn: async ({ pageParam }) => {
			if (!onFetchPRPage)
				return {
					prs: [],
					pageInfo: { hasNextPage: false, endCursor: null },
				};
			return onFetchPRPage(owner, repo, "open", pageParam) as Promise<PRPage>;
		},
		initialPageParam: null,
		initialData: {
			pages: [{ prs: initialOpenPRs, pageInfo: initialPageInfo }],
			pageParams: [null],
		},
		getNextPageParam: (lastPage) =>
			lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
		enabled: false,
	});

	const closedQuery = useInfiniteQuery<
		PRPage,
		Error,
		{ pages: PRPage[]; pageParams: (string | null)[] },
		string[],
		string | null
	>({
		queryKey: closedQueryKey,
		queryFn: async ({ pageParam }) => {
			if (!onFetchPRPage)
				return {
					prs: [],
					pageInfo: { hasNextPage: false, endCursor: null },
				};
			return onFetchPRPage(owner, repo, "closed", pageParam) as Promise<PRPage>;
		},
		initialPageParam: null,
		getNextPageParam: (lastPage) =>
			lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined,
		enabled: false,
	});

	const openPRs = useMemo(
		() => openQuery.data?.pages.flatMap((p) => p.prs) ?? initialOpenPRs,
		[openQuery.data, initialOpenPRs],
	);

	const closedAllPRs = useMemo(
		() => closedQuery.data?.pages.flatMap((p) => p.prs) ?? [],
		[closedQuery.data],
	);

	const closedPRsLoaded = closedQuery.data !== undefined;

	// Fetch closed PRs on mount if URL has ?tab=merged or ?tab=closed
	useEffect(() => {
		if (initialTab !== "open" && !closedQuery.data && !closedQuery.isFetching) {
			closedQuery.refetch();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleTabChange = useCallback(
		(tab: TabState) => {
			setState(tab);
			const url = new URL(window.location.href);
			if (tab === "open") {
				url.searchParams.delete("tab");
			} else {
				url.searchParams.set("tab", tab);
			}
			window.history.replaceState(null, "", url.toString());
			if (tab !== "open" && !closedQuery.data && !closedQuery.isFetching) {
				closedQuery.refetch();
			}
		},
		[closedQuery],
	);

	const { statusMap, loaded: checkStatusesLoaded } = useBatchCheckStatuses(
		owner,
		repo,
		openPRs,
		onFetchAllCheckStatuses,
	);

	const prefetchedRef = useRef(new Set<number>());
	const handlePRHover = useCallback(
		(prNumber: number, authorLogin?: string | null) => {
			if (!onPrefetchPRDetail || prefetchedRef.current.has(prNumber)) return;
			prefetchedRef.current.add(prNumber);
			onPrefetchPRDetail(owner, repo, prNumber, authorLogin);
		},
		[owner, repo, onPrefetchPRDetail],
	);

	useEffect(() => {
		setCountAdjustments({ open: 0, merged: 0, closed: 0 });
	}, [openPRs, closedAllPRs]);

	useMutationSubscription(
		["pr:merged", "pr:closed", "pr:reopened"],
		(event: MutationEvent) => {
			if (!isRepoEvent(event, owner, repo)) return;
			setCountAdjustments((prev) => {
				switch (event.type) {
					case "pr:merged":
						return {
							...prev,
							open: prev.open - 1,
							merged: prev.merged + 1,
						};
					case "pr:closed":
						return {
							...prev,
							open: prev.open - 1,
							closed: prev.closed + 1,
						};
					case "pr:reopened":
						return {
							...prev,
							open: prev.open + 1,
							closed: prev.closed - 1,
						};
					default:
						return prev;
				}
			});
		},
	);

	const allPRs = useMemo(() => [...openPRs, ...closedAllPRs], [openPRs, closedAllPRs]);

	const authors = useMemo(() => {
		const seen = new Map<string, PRUser>();
		for (const pr of allPRs) {
			if (pr.user && !seen.has(pr.user.login)) {
				seen.set(pr.user.login, pr.user);
			}
		}
		return [...seen.values()];
	}, [allPRs]);

	const filteredAuthors = useMemo(() => {
		if (!authorSearch) return authors.slice(0, 8);
		const q = authorSearch.toLowerCase();
		return authors.filter((a) => a.login.toLowerCase().includes(q)).slice(0, 8);
	}, [authors, authorSearch]);

	const selectedAuthorData = useMemo(
		() => authors.find((a) => a.login === selectedAuthor) ?? null,
		[authors, selectedAuthor],
	);

	useClickOutside(
		authorRef,
		useCallback(() => setAuthorDropdownOpen(false), []),
	);

	const labels = useMemo(() => {
		const seen = new Map<string, { name: string; color: string }>();
		for (const pr of allPRs) {
			for (const label of pr.labels) {
				if (label.name && !seen.has(label.name)) {
					seen.set(label.name, {
						name: label.name,
						color: label.color || "888",
					});
				}
			}
		}
		return [...seen.values()].slice(0, 10);
	}, [allPRs]);

	const baseBranches = useMemo(() => {
		const seen = new Set<string>();
		for (const pr of allPRs) {
			if (pr.base?.ref) seen.add(pr.base.ref);
		}
		return [...seen].slice(0, 8);
	}, [allPRs]);

	const activeFilterCount =
		(draftFilter !== "all" ? 1 : 0) +
		(reviewFilter !== "all" ? 1 : 0) +
		(assigneeFilter !== "all" ? 1 : 0) +
		(selectedBranch ? 1 : 0) +
		(selectedAuthor ? 1 : 0) +
		(selectedLabel ? 1 : 0);

	const clearAllFilters = () => {
		setSearch("");
		setSelectedAuthor(null);
		setAuthorSearch("");
		setAuthorPRs(null);
		setSelectedLabel(null);
		setDraftFilter("all");
		setReviewFilter("all");
		setAssigneeFilter("all");
		setSelectedBranch(null);
	};

	const currentOpenPRs = authorPRs ? authorPRs.open : openPRs;
	const currentClosedPRs = authorPRs ? authorPRs.closed : closedAllPRs;

	const mergedPRs = useMemo(
		() =>
			authorPRs
				? currentClosedPRs.filter((pr) => !!pr.merged_at)
				: closedPRsLoaded
					? currentClosedPRs.filter((pr) => !!pr.merged_at)
					: (initialMergedPreview ?? []),
		[authorPRs, currentClosedPRs, closedPRsLoaded, initialMergedPreview],
	);
	const closedUnmergedPRs = useMemo(
		() =>
			authorPRs
				? currentClosedPRs.filter((pr) => !pr.merged_at)
				: closedPRsLoaded
					? currentClosedPRs.filter((pr) => !pr.merged_at)
					: (initialClosedPreview ?? []),
		[authorPRs, currentClosedPRs, closedPRsLoaded, initialClosedPreview],
	);

	const basePRs =
		state === "open"
			? currentOpenPRs
			: state === "merged"
				? mergedPRs
				: closedUnmergedPRs;

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		return basePRs
			.filter((pr) => {
				if (q) {
					const matchesSearch =
						pr.number.toString().includes(q) ||
						pr.title.toLowerCase().includes(q) ||
						pr.user?.login.toLowerCase().includes(q) ||
						(pr.head?.ref?.toLowerCase().includes(q) ??
							false) ||
						(pr.base?.ref?.toLowerCase().includes(q) ??
							false) ||
						pr.labels.some((l) =>
							l.name?.toLowerCase().includes(q),
						);
					if (!matchesSearch) return false;
				}
				if (
					!authorPRs &&
					selectedAuthor &&
					pr.user?.login !== selectedAuthor
				)
					return false;
				if (
					selectedLabel &&
					!pr.labels.some((l) => l.name === selectedLabel)
				)
					return false;
				if (draftFilter === "ready" && pr.draft) return false;
				if (draftFilter === "draft" && !pr.draft) return false;
				if (
					reviewFilter === "has_reviewers" &&
					(pr.requested_reviewers?.length ?? 0) === 0
				)
					return false;
				if (
					reviewFilter === "no_reviewers" &&
					(pr.requested_reviewers?.length ?? 0) > 0
				)
					return false;
				if (
					assigneeFilter === "assigned" &&
					(pr.assignees?.length ?? 0) === 0
				)
					return false;
				if (
					assigneeFilter === "unassigned" &&
					(pr.assignees?.length ?? 0) > 0
				)
					return false;
				if (selectedBranch && pr.base?.ref !== selectedBranch) return false;
				return true;
			})
			.sort((a, b) => {
				switch (sort) {
					case "newest":
						return (
							new Date(b.created_at).getTime() -
							new Date(a.created_at).getTime()
						);
					case "oldest":
						return (
							new Date(a.created_at).getTime() -
							new Date(b.created_at).getTime()
						);
					case "comments":
						return (
							(b.comments ?? 0) +
							(b.review_comments ?? 0) -
							((a.comments ?? 0) +
								(a.review_comments ?? 0))
						);
					default:
						return (
							new Date(b.updated_at).getTime() -
							new Date(a.updated_at).getTime()
						);
				}
			});
	}, [
		basePRs,
		search,
		sort,
		selectedAuthor,
		selectedLabel,
		draftFilter,
		reviewFilter,
		assigneeFilter,
		selectedBranch,
		authorPRs,
	]);

	const activeQuery = state === "open" ? openQuery : closedQuery;
	const canFetchMore = activeQuery.hasNextPage && !activeQuery.isFetchingNextPage;

	const sentinelRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && canFetchMore) {
					activeQuery.fetchNextPage();
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [canFetchMore, activeQuery]);

	return (
		<div>
			{/* Toolbar */}
			<div className="sticky top-0 z-10 bg-background pb-3 pt-4 before:content-[''] before:absolute before:left-0 before:right-0 before:bottom-full before:h-8 before:bg-background">
				{/* Row 1: Search + Open/Closed + Sort */}
				<div className="flex items-center gap-2 mb-3 flex-wrap">
					<ListSearchInput
						placeholder="Search pull requests..."
						value={search}
						onChange={setSearch}
					/>

					<SortCycleButton
						sort={sort}
						cycle={sortCycle}
						labels={sortLabels}
						onSort={setSort}
					/>

					<FiltersButton
						open={showFilters}
						activeCount={activeFilterCount}
						onToggle={() => setShowFilters((v) => !v)}
					/>

					<ClearFiltersButton
						show={activeFilterCount > 0}
						onClear={clearAllFilters}
					/>
				</div>

				{/* Advanced filters panel */}
				{showFilters && (
					<div className="border border-border p-3 mb-3 space-y-3">
						{/* Draft status */}
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
								Status
							</span>
							<div className="flex items-center border border-border divide-x divide-border">
								{(
									[
										["all", "All"],
										["ready", "Ready"],
										["draft", "Draft"],
									] as [DraftFilter, string][]
								).map(([value, label]) => (
									<button
										key={value}
										onClick={() =>
											setDraftFilter(
												value,
											)
										}
										className={cn(
											"px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
											draftFilter ===
												value
												? "bg-muted/50 dark:bg-white/4 text-foreground"
												: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
										)}
									>
										{label}
									</button>
								))}
							</div>
						</div>

						{/* Review status */}
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
								Review
							</span>
							<div className="flex items-center border border-border divide-x divide-border">
								{(
									[
										["all", "All"],
										[
											"has_reviewers",
											"Requested",
										],
										[
											"no_reviewers",
											"None",
										],
									] as [
										ReviewFilter,
										string,
									][]
								).map(([value, label]) => (
									<button
										key={value}
										onClick={() =>
											setReviewFilter(
												value,
											)
										}
										className={cn(
											"px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
											reviewFilter ===
												value
												? "bg-muted/50 dark:bg-white/4 text-foreground"
												: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
										)}
									>
										{label}
									</button>
								))}
							</div>
						</div>

						{/* Assignee status */}
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
								Assign
							</span>
							<div className="flex items-center border border-border divide-x divide-border">
								{(
									[
										["all", "All"],
										[
											"assigned",
											"Assigned",
										],
										[
											"unassigned",
											"Unassigned",
										],
									] as [
										AssigneeFilter,
										string,
									][]
								).map(([value, label]) => (
									<button
										key={value}
										onClick={() =>
											setAssigneeFilter(
												value,
											)
										}
										className={cn(
											"px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
											assigneeFilter ===
												value
												? "bg-muted/50 dark:bg-white/4 text-foreground"
												: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
										)}
									>
										{label}
									</button>
								))}
							</div>
						</div>

						{/* Author */}
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
								Author
							</span>
							<div ref={authorRef} className="relative">
								{selectedAuthor &&
								selectedAuthorData ? (
									<button
										onClick={() => {
											setSelectedAuthor(
												null,
											);
											setAuthorSearch(
												"",
											);
											setAuthorPRs(
												null,
											);
										}}
										className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono border border-foreground/30 bg-muted/50 dark:bg-white/4 text-foreground transition-colors cursor-pointer"
									>
										<Image
											src={
												selectedAuthorData.avatar_url
											}
											alt={
												selectedAuthorData.login
											}
											width={14}
											height={14}
											className="rounded-full"
										/>
										{
											selectedAuthorData.login
										}
										<X className="w-2.5 h-2.5 text-muted-foreground" />
									</button>
								) : (
									<div>
										<input
											type="text"
											placeholder="Search authors..."
											value={
												authorSearch
											}
											onChange={(
												e,
											) => {
												setAuthorSearch(
													e
														.target
														.value,
												);
												setAuthorDropdownOpen(
													true,
												);
											}}
											onFocus={() =>
												setAuthorDropdownOpen(
													true,
												)
											}
											className="w-full sm:w-48 bg-transparent border border-border px-2 py-1 text-[10px] font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors"
										/>
										{authorDropdownOpen &&
											filteredAuthors.length >
												0 && (
												<div className="absolute z-20 top-full left-0 mt-1 w-full sm:w-56 border border-border bg-background shadow-lg max-h-48 overflow-y-auto">
													{filteredAuthors.map(
														(
															author,
														) => (
															<button
																key={
																	author.login
																}
																onClick={() => {
																	setSelectedAuthor(
																		author.login,
																	);
																	setAuthorSearch(
																		"",
																	);
																	setAuthorDropdownOpen(
																		false,
																	);
																	if (
																		onAuthorFilter
																	) {
																		startTransition(
																			async () => {
																				const result =
																					await onAuthorFilter(
																						owner,
																						repo,
																						author.login,
																					);
																				setAuthorPRs(
																					result as {
																						open: PR[];
																						closed: PR[];
																					},
																				);
																			},
																		);
																	}
																}}
																className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3 hover:text-foreground transition-colors cursor-pointer"
															>
																<Image
																	src={
																		author.avatar_url
																	}
																	alt={
																		author.login
																	}
																	width={
																		16
																	}
																	height={
																		16
																	}
																	className="rounded-full"
																/>
																{
																	author.login
																}
															</button>
														),
													)}
												</div>
											)}
									</div>
								)}
							</div>
						</div>

						{/* Base branch */}
						{baseBranches.length > 1 && (
							<div className="flex items-center gap-2">
								<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
									Base
								</span>
								<div className="flex items-center gap-1.5 flex-wrap">
									{baseBranches.map(
										(branch) => (
											<button
												key={
													branch
												}
												onClick={() =>
													setSelectedBranch(
														(
															b,
														) =>
															b ===
															branch
																? null
																: branch,
													)
												}
												className={cn(
													"flex items-center gap-1.5 px-2 py-1 text-[10px] border rounded-full transition-colors cursor-pointer font-mono",
													selectedBranch ===
														branch
														? "border-foreground/30 bg-muted/50 dark:bg-white/4 text-foreground"
														: "border-border text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3",
												)}
											>
												<GitBranch className="w-2.5 h-2.5" />
												{
													branch
												}
											</button>
										),
									)}
								</div>
							</div>
						)}

						{/* Labels */}
						{labels.length > 0 && (
							<div className="flex items-center gap-2">
								<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
									Label
								</span>
								<div className="flex items-center gap-1.5 flex-wrap">
									{labels.map((label) => (
										<button
											key={
												label.name
											}
											onClick={() =>
												setSelectedLabel(
													(
														l,
													) =>
														l ===
														label.name
															? null
															: label.name,
												)
											}
											className={cn(
												"flex items-center gap-1.5 px-2 py-1 text-[10px] border rounded-full transition-colors cursor-pointer font-mono",
												selectedLabel ===
													label.name
													? "border-foreground/30 bg-muted/50 dark:bg-white/4 text-foreground"
													: "border-border text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3",
											)}
										>
											<span
												className="w-2 h-2 rounded-full shrink-0"
												style={{
													backgroundColor: `#${label.color}`,
												}}
											/>
											{label.name}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Row 2: State tabs */}
				<div className="flex items-center border-b border-border/40">
					{[
						{
							key: "open" as TabState,
							label: "Open",
							icon: (
								<GitPullRequest className="w-3 h-3" />
							),
							count: authorPRs
								? currentOpenPRs.length
								: openCount + countAdjustments.open,
						},
						{
							key: "merged" as TabState,
							label: "Merged",
							icon: <GitMerge className="w-3 h-3" />,
							count: authorPRs
								? mergedPRs.length
								: mergedCount +
									countAdjustments.merged,
						},
						{
							key: "closed" as TabState,
							label: "Closed",
							icon: (
								<GitPullRequestClosed className="w-3 h-3" />
							),
							count: authorPRs
								? closedUnmergedPRs.length
								: closedCount +
									countAdjustments.closed,
						},
					].map((tab) => (
						<button
							key={tab.key}
							onClick={() => handleTabChange(tab.key)}
							className={cn(
								"relative flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[12px] transition-colors cursor-pointer",
								state === tab.key
									? "text-foreground"
									: "text-muted-foreground/50 hover:text-foreground/70",
							)}
						>
							{tab.icon}
							<span className="hidden sm:inline">
								{tab.label}
							</span>
							<span
								className={cn(
									"text-[10px] tabular-nums font-mono",
									state === tab.key
										? "text-foreground/50"
										: "text-muted-foreground/30",
								)}
							>
								{tab.count}
							</span>
							{state === tab.key && (
								<span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
							)}
						</button>
					))}
				</div>
			</div>

			{/* PR List */}
			<div className="relative flex-1 min-h-0 overflow-y-auto divide-y divide-border">
				<LoadingOverlay show={isPending} />
				{filtered.map((pr) => {
					const isMerged = !!pr.merged_at;
					const totalComments =
						(pr.comments ?? 0) + (pr.review_comments ?? 0);
					const isCurrentUserAuthor =
						!!pr.user?.login &&
						!!currentUserLogin &&
						pr.user.login.toLowerCase() ===
							currentUserLogin.toLowerCase();

					return (
						<Link
							key={pr.id}
							href={`/${owner}/${repo}/pulls/${pr.number}`}
							onMouseEnter={() =>
								handlePRHover(
									pr.number,
									pr.user?.login,
								)
							}
							className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
						>
							{isMerged ? (
								<GitMerge className="w-3.5 h-3.5 shrink-0 mt-0.5 text-alert-important" />
							) : pr.state === "closed" ? (
								<GitPullRequestClosed className="w-3.5 h-3.5 shrink-0 mt-0.5 text-destructive" />
							) : (
								<GitPullRequest
									className={cn(
										"w-3.5 h-3.5 shrink-0 mt-0.5",
										pr.draft
											? "text-muted-foreground/70"
											: "text-success",
									)}
								/>
							)}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-sm truncate group-hover:text-foreground transition-colors">
										{pr.title}
									</span>
									{pr.draft && (
										<span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground/70 shrink-0">
											Draft
										</span>
									)}
									{pr.labels
										.filter(
											(l) =>
												l.name,
										)
										.slice(0, 3)
										.map((label) => (
											<LabelBadge
												key={
													label.name
												}
												label={
													label
												}
											/>
										))}
									{(pr.requested_reviewers
										?.length ?? 0) >
										0 && (
										<span className="flex items-center ml-auto shrink-0 -space-x-1.5">
											{(
												pr.requested_reviewers ??
												[]
											)
												.slice(
													0,
													3,
												)
												.map(
													(
														r,
													) => (
														<UserTooltip
															key={
																r.login
															}
															username={
																r.login
															}
														>
															<Link
																href={`/users/${r.login}`}
															>
																<Image
																	src={
																		r.avatar_url
																	}
																	alt={
																		r.login
																	}
																	width={
																		16
																	}
																	height={
																		16
																	}
																	className="rounded-full border border-border hover:ring-2 hover:ring-primary/50 transition-all"
																/>
															</Link>
														</UserTooltip>
													),
												)}
										</span>
									)}
								</div>

								<div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap">
									{pr.user && (
										<UserTooltip
											username={
												pr
													.user
													.login
											}
										>
											<Link
												href={`/users/${pr.user.login}`}
												className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
											>
												<Image
													src={
														pr
															.user
															.avatar_url
													}
													alt={
														pr
															.user
															.login
													}
													width={
														14
													}
													height={
														14
													}
													className="rounded-full"
												/>
												<span
													className={cn(
														"font-mono text-[10px] hover:underline",
														isCurrentUserAuthor &&
															"text-warning font-semibold",
													)}
												>
													{
														pr
															.user
															.login
													}
												</span>
											</Link>
										</UserTooltip>
									)}
									{pr.base?.ref &&
										pr.head?.ref && (
											<span className="hidden sm:flex items-center gap-1 font-mono text-muted-foreground text-[10px]">
												<GitBranch className="w-2.5 h-2.5" />
												{
													pr
														.base
														.ref
												}
												<span className="mx-0.5">
													&larr;
												</span>
												{
													pr
														.head
														.ref
												}
											</span>
										)}
								</div>

								<div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap">
									<PRCheckStatus
										pr={pr}
										owner={owner}
										repo={repo}
										resolvedStatus={
											statusMap[
												pr
													.number
											]
										}
										loaded={
											checkStatusesLoaded
										}
									/>
									<span className="text-[11px] font-mono text-muted-foreground/70">
										#{pr.number}
									</span>
									<span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
										<Clock className="w-3 h-3" />
										<TimeAgo
											date={
												pr.created_at
											}
										/>
									</span>
									{totalComments > 0 && (
										<span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
											<MessageSquare className="w-3 h-3" />
											{
												totalComments
											}
										</span>
									)}
									<span className="hidden sm:inline font-mono text-success text-[10px]">
										+{pr.additions ?? 0}
									</span>
									<span className="hidden sm:inline font-mono text-destructive text-[10px]">
										-{pr.deletions ?? 0}
									</span>
									<span className="hidden sm:flex items-center gap-1 font-mono text-muted-foreground text-[10px]">
										<FileCode2 className="w-2.5 h-2.5" />
										{pr.changed_files ??
											0}{" "}
										file
										{(pr.changed_files ??
											0) !== 1
											? "s"
											: ""}
									</span>

									{(pr.assignees?.length ??
										0) > 0 && (
										<span className="flex items-center ml-auto shrink-0 -space-x-1.5">
											{(
												pr.assignees ??
												[]
											)
												.slice(
													0,
													3,
												)
												.map(
													(
														a,
													) => (
														<UserTooltip
															key={
																a.login
															}
															username={
																a.login
															}
														>
															<Link
																href={`/users/${a.login}`}
															>
																<Image
																	src={
																		a.avatar_url
																	}
																	alt={
																		a.login
																	}
																	width={
																		16
																	}
																	height={
																		16
																	}
																	className="rounded-full border border-border hover:ring-2 hover:ring-primary/50 transition-all"
																/>
															</Link>
														</UserTooltip>
													),
												)}
										</span>
									)}
								</div>
							</div>
						</Link>
					);
				})}

				{activeQuery.isFetching && (
					<div
						className={cn(
							"text-center",
							filtered.length > 0
								? "py-6 border-t border-border/30"
								: "py-16",
						)}
					>
						<Loader2 className="w-4 h-4 text-muted-foreground mx-auto mb-2 animate-spin" />
						<p className="text-xs text-muted-foreground/50 font-mono">
							Loading more pull requests…
						</p>
					</div>
				)}

				<div ref={sentinelRef} className="h-1" />

				{!activeQuery.isFetching && filtered.length === 0 && (
					<div className="py-16 text-center">
						<GitPullRequest className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
						<p className="text-xs text-muted-foreground font-mono">
							{search || activeFilterCount > 0
								? "No pull requests match your filters"
								: state === "merged"
									? "No merged pull requests"
									: `No ${state} pull requests`}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
