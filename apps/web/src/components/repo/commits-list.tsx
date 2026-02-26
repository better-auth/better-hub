"use client";

import { useState, useTransition, useMemo, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
	GitBranch,
	ChevronDown,
	Search,
	Check,
	X,
	MoreHorizontal,
	Loader2,
	Expand,
	Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { ResizeHandle } from "@/components/ui/resize-handle";
import {
	fetchCommitsByDate,
	fetchCommitsPage,
	fetchCommitDetail,
	type CommitDetailData,
} from "@/app/(app)/repos/[owner]/[repo]/commits/actions";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";
import { parseCoAuthors, getCommitBody, getInitials, type CoAuthor } from "@/lib/commit-utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { CommitDetail } from "@/components/repo/commit-detail";
import type { SyntaxToken } from "@/lib/shiki";

// Constants
const SHEET_WIDTH_COOKIE = "commit_sheet_width";
const DEFAULT_SHEET_WIDTH = 1024;
const MIN_SHEET_WIDTH = 400;
const MAX_SHEET_WIDTH_RATIO = 0.9;

// Types
type Commit = {
	sha: string;
	commit: {
		message: string;
		author: {
			name?: string | null;
			date?: string | null;
		} | null;
	};
	author:
		| {
				login: string;
				avatar_url: string;
		  }
		| Record<string, never>
		| null;
	html_url: string;
};

interface CommitsListProps {
	owner: string;
	repo: string;
	commits: Commit[];
	defaultBranch: string;
	branches: { name: string }[];
}

// Utility functions
function groupByDate(commits: Commit[]) {
	const groups: Record<string, Commit[]> = {};
	for (const commit of commits) {
		const date = commit.commit.author?.date;
		const key = date
			? new Date(date).toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
				})
			: "Unknown date";
		if (!groups[key]) groups[key] = [];
		groups[key].push(commit);
	}
	return Object.entries(groups);
}

// Sub-components
function BranchPicker({
	branches,
	currentBranch,
	defaultBranch,
	onChange,
}: {
	branches: { name: string }[];
	currentBranch: string;
	defaultBranch: string;
	onChange: (branch: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setSearch("");
			setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [open]);

	const sorted = useMemo(() => {
		const list = [...branches].sort((a, b) => {
			if (a.name === defaultBranch) return -1;
			if (b.name === defaultBranch) return 1;
			return a.name.localeCompare(b.name);
		});
		if (!search) return list;
		const q = search.toLowerCase();
		return list.filter((b) => b.name.toLowerCase().includes(q));
	}, [branches, defaultBranch, search]);

	return (
		<div className="relative">
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 h-9 px-3 text-xs font-mono rounded-md border border-border hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer"
			>
				<GitBranch className="w-3.5 h-3.5 text-muted-foreground/70" />
				<span className="max-w-[140px] truncate">{currentBranch}</span>
				<ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />
			</button>
			{open && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => {
							setOpen(false);
							setSearch("");
						}}
					/>
					<div className="absolute top-full left-0 mt-1 z-50 w-72 border border-border bg-card shadow-lg">
						<div className="p-2 border-b border-border">
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
								<input
									ref={inputRef}
									type="text"
									placeholder="Find a branch..."
									value={search}
									onChange={(e) =>
										setSearch(
											e.target
												.value,
										)
									}
									className="w-full bg-transparent text-xs pl-7 pr-2 py-1.5 border border-border placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors"
								/>
							</div>
						</div>
						<div className="max-h-60 overflow-y-auto">
							{sorted.map((b) => {
								const isActive =
									b.name === currentBranch;
								const isDefault =
									b.name === defaultBranch;
								return (
									<button
										key={b.name}
										onClick={() => {
											onChange(
												b.name,
											);
											setOpen(
												false,
											);
											setSearch(
												"",
											);
										}}
										className={cn(
											"w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer flex items-center gap-2",
											isActive &&
												"bg-muted/30",
										)}
									>
										<span className="w-3.5 shrink-0 flex items-center justify-center">
											{isActive && (
												<Check className="w-3 h-3 text-foreground" />
											)}
										</span>
										<span className="truncate flex-1">
											{b.name}
										</span>
										{isDefault && (
											<span className="text-[9px] text-muted-foreground/50 shrink-0">
												default
											</span>
										)}
									</button>
								);
							})}
							{sorted.length === 0 && (
								<div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50 font-mono">
									No branches found
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function CoAuthorBadge({ coAuthor, size = 20 }: { coAuthor: CoAuthor; size?: number }) {
	const initials = getInitials(coAuthor.name);
	return (
		<div
			className="rounded-full bg-muted border border-background flex items-center justify-center shrink-0"
			style={{ width: size, height: size }}
			title={`${coAuthor.name} <${coAuthor.email}>`}
		>
			<span className="text-[8px] font-medium text-muted-foreground leading-none">
				{initials}
			</span>
		</div>
	);
}

function CommitsToolbar({
	branches,
	currentBranch,
	defaultBranch,
	search,
	since,
	until,
	hasDateFilter,
	onBranchChange,
	onSearchChange,
	onSinceChange,
	onUntilChange,
	onClearDates,
}: {
	branches: { name: string }[];
	currentBranch: string;
	defaultBranch: string;
	search: string;
	since: string;
	until: string;
	hasDateFilter: boolean;
	onBranchChange: (branch: string) => void;
	onSearchChange: (search: string) => void;
	onSinceChange: (since: string) => void;
	onUntilChange: (until: string) => void;
	onClearDates: () => void;
}) {
	return (
		<div className="flex items-center gap-2">
			<BranchPicker
				branches={branches}
				currentBranch={currentBranch}
				defaultBranch={defaultBranch}
				onChange={onBranchChange}
			/>
			<div className="relative flex-1">
				<input
					type="text"
					placeholder="Search commits..."
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					className="w-full h-9 rounded-md border border-border bg-background px-3 pl-9 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<svg
					className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
			</div>
			<input
				type="date"
				value={since}
				onChange={(e) => onSinceChange(e.target.value)}
				title="Since date"
				className="h-9 rounded-md border border-border bg-background px-3 font-mono text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			/>
			<input
				type="date"
				value={until}
				onChange={(e) => onUntilChange(e.target.value)}
				title="Until date"
				className="h-9 rounded-md border border-border bg-background px-3 font-mono text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			/>
			{hasDateFilter && (
				<button
					onClick={onClearDates}
					title="Clear date filters"
					className="h-9 rounded-md border border-border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
				>
					✕
				</button>
			)}
		</div>
	);
}

function CommitRow({
	commit,
	owner,
	repo,
	isFirst,
	isExpanded,
	copiedSha,
	isMobile,
	onCommitClick,
	onToggleExpand,
	onCopySha,
}: {
	commit: Commit;
	owner: string;
	repo: string;
	isFirst: boolean;
	isExpanded: boolean;
	copiedSha: string | null;
	isMobile: boolean | undefined;
	onCommitClick: (sha: string) => void;
	onToggleExpand: (sha: string) => void;
	onCopySha: (sha: string) => void;
}) {
	const firstLine = commit.commit.message.split("\n")[0];
	const login = commit.author?.login;
	const avatarUrl = commit.author?.avatar_url;
	const shortSha = commit.sha.slice(0, 7);
	const coAuthors = parseCoAuthors(commit.commit.message);
	const body = getCommitBody(commit.commit.message);

	const titleClassName =
		"text-sm font-medium text-foreground hover:text-info line-clamp-1 text-left";

	return (
		<div className={cn(!isFirst && "border-t border-border")}>
			<div className="flex items-start gap-3 px-4 py-3">
				{/* Avatar group */}
				<div className="mt-0.5 flex items-center -space-x-1 shrink-0">
					{avatarUrl ? (
						<Link
							href={`/${login}`}
							className="shrink-0 relative z-10"
						>
							<Image
								src={avatarUrl}
								alt={login ?? ""}
								width={24}
								height={24}
								className="rounded-full border border-background"
							/>
						</Link>
					) : (
						<div className="h-6 w-6 shrink-0 rounded-full bg-muted border border-background relative z-10" />
					)}
					{coAuthors.slice(0, 3).map((ca, ci) => (
						<div
							key={ca.email}
							className="relative"
							style={{ zIndex: 9 - ci }}
						>
							<CoAuthorBadge coAuthor={ca} size={20} />
						</div>
					))}
				</div>

				{/* Content */}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1">
						{isMobile === undefined || isMobile ? (
							<Link
								href={`/${owner}/${repo}/commits/${commit.sha}`}
								className={titleClassName}
							>
								{firstLine}
							</Link>
						) : (
							<button
								onClick={() =>
									onCommitClick(commit.sha)
								}
								className={cn(
									titleClassName,
									"cursor-pointer",
								)}
							>
								{firstLine}
							</button>
						)}
						{body && (
							<button
								onClick={() =>
									onToggleExpand(commit.sha)
								}
								title={
									isExpanded
										? "Collapse"
										: "Expand commit message"
								}
								className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
							>
								<MoreHorizontal className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{login ? (
							<Link
								href={`/${login}`}
								className="hover:underline"
							>
								{login}
							</Link>
						) : (
							(commit.commit.author?.name ?? "Unknown")
						)}
						{coAuthors.length > 0 && (
							<>
								{" & "}
								{coAuthors.map((ca, ci) => (
									<span key={ca.email}>
										{ci > 0 && ", "}
										{ca.name}
									</span>
								))}
							</>
						)}
						{commit.commit.author?.date && (
							<>
								{" · "}
								<TimeAgo
									date={
										commit.commit.author
											.date
									}
								/>
							</>
						)}
					</p>
				</div>

				{/* SHA button */}
				<button
					onClick={() => onCopySha(commit.sha)}
					title="Copy full SHA"
					className="mt-0.5 shrink-0 cursor-pointer rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted"
				>
					{copiedSha === commit.sha ? "Copied!" : shortSha}
				</button>
			</div>

			{/* Expanded body */}
			{isExpanded && body && (
				<div className="px-4 pb-3 pl-[52px]">
					<pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border-l-2 border-border pl-3">
						{body}
					</pre>
				</div>
			)}
		</div>
	);
}

function CommitDateGroup({
	date,
	commits,
	owner,
	repo,
	expandedShas,
	copiedSha,
	isMobile,
	onCommitClick,
	onToggleExpand,
	onCopySha,
}: {
	date: string;
	commits: Commit[];
	owner: string;
	repo: string;
	expandedShas: Set<string>;
	copiedSha: string | null;
	isMobile: boolean | undefined;
	onCommitClick: (sha: string) => void;
	onToggleExpand: (sha: string) => void;
	onCopySha: (sha: string) => void;
}) {
	return (
		<div>
			<p className="mb-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground/70">
				Commits on {date}
			</p>
			<div className="overflow-hidden rounded-md border border-border">
				{commits.map((commit, i) => (
					<CommitRow
						key={commit.sha}
						commit={commit}
						owner={owner}
						repo={repo}
						isFirst={i === 0}
						isExpanded={expandedShas.has(commit.sha)}
						copiedSha={copiedSha}
						isMobile={isMobile}
						onCommitClick={onCommitClick}
						onToggleExpand={onToggleExpand}
						onCopySha={onCopySha}
					/>
				))}
			</div>
		</div>
	);
}

function CommitDetailSheet({
	open,
	onOpenChange,
	owner,
	repo,
	selectedCommitSha,
	commitDetail,
	highlightData,
	isLoading,
	sheetWidth,
	isResizing,
	onResize,
	onResizeEnd,
	onResetWidth,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	owner: string;
	repo: string;
	selectedCommitSha: string | null;
	commitDetail: CommitDetailData | null;
	highlightData: Record<string, Record<string, SyntaxToken[]>>;
	isLoading: boolean;
	sheetWidth: number | null;
	isResizing: boolean;
	onResize: (clientX: number) => void;
	onResizeEnd: () => void;
	onResetWidth: () => void;
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				title="Commit Details"
				side="right"
				className="p-0 overflow-hidden"
				showCloseButton={false}
				style={{
					width: sheetWidth ?? DEFAULT_SHEET_WIDTH,
					maxWidth: "90vw",
					minWidth: "600px",
					transition: isResizing ? "none" : "width 0.2s ease-out",
				}}
			>
				<ResizeHandle
					onResize={onResize}
					onDragStart={() => {}}
					onDragEnd={onResizeEnd}
					onDoubleClick={onResetWidth}
					className="absolute left-0 inset-y-0 z-20"
				/>
				<div className="absolute top-4 right-4 z-10 flex items-center gap-2">
					{selectedCommitSha && (
						<Link
							href={`/${owner}/${repo}/commits/${selectedCommitSha}`}
							title="Open full page"
							className="rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
						>
							<Maximize2 className="h-4 w-4" />
							<span className="sr-only">
								Open full page
							</span>
						</Link>
					)}
					<button
						onClick={() => onOpenChange(false)}
						className="rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
					>
						<X className="h-4 w-4" />
						<span className="sr-only">Close</span>
					</button>
				</div>
				{isLoading ? (
					<div className="flex items-center justify-center h-full">
						<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
					</div>
				) : commitDetail ? (
					<CommitDetail
						owner={owner}
						repo={repo}
						commit={commitDetail}
						highlightData={highlightData}
					/>
				) : (
					<div className="flex items-center justify-center h-full">
						<p className="text-sm text-muted-foreground">
							Commit not found
						</p>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}

// Constants
const PER_PAGE = 30;

// Main component
export function CommitsList({ owner, repo, commits, defaultBranch, branches }: CommitsListProps) {
	// Filter state
	const [search, setSearch] = useState("");
	const [since, setSince] = useState("");
	const [until, setUntil] = useState("");
	const [currentBranch, setCurrentBranch] = useState(defaultBranch);
	const [displayedCommits, setDisplayedCommits] = useState<Commit[]>(commits);
	const [isPending, startTransition] = useTransition();

	// Infinite scroll state
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(commits.length >= PER_PAGE);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const loadMoreRef = useRef<HTMLDivElement>(null);

	// UI state
	const [copiedSha, setCopiedSha] = useState<string | null>(null);
	const [expandedShas, setExpandedShas] = useState<Set<string>>(new Set());

	// Sheet state
	const [sheetOpen, setSheetOpen] = useState(false);
	const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);
	const [commitDetail, setCommitDetail] = useState<CommitDetailData | null>(null);
	const [highlightData, setHighlightData] = useState<
		Record<string, Record<string, SyntaxToken[]>>
	>({});
	const [isLoadingDetail, setIsLoadingDetail] = useState(false);
	const [sheetWidth, setSheetWidth] = useState<number | null>(null);
	const [isResizing, setIsResizing] = useState(false);
	const isMobile = useIsMobile();

	// Load sheet width from cookie
	useEffect(() => {
		const match = document.cookie.match(
			new RegExp(`(?:^|; )${SHEET_WIDTH_COOKIE}=([^;]*)`),
		);
		if (match) {
			const savedWidth = parseInt(match[1], 10);
			if (!isNaN(savedWidth) && savedWidth >= MIN_SHEET_WIDTH) {
				setSheetWidth(savedWidth);
			}
		}
	}, []);

	// Infinite scroll: load next page
	const loadMore = useCallback(async () => {
		if (isLoadingMore || !hasMore) return;
		setIsLoadingMore(true);
		const nextPage = page + 1;
		const result = await fetchCommitsPage(
			owner,
			repo,
			nextPage,
			currentBranch,
			since || undefined,
			until || undefined,
		);
		const newCommits = result as Commit[];
		if (newCommits.length < PER_PAGE) {
			setHasMore(false);
		}
		setDisplayedCommits((prev) => [...prev, ...newCommits]);
		setPage(nextPage);
		setIsLoadingMore(false);
	}, [isLoadingMore, hasMore, page, owner, repo, currentBranch, since, until]);

	// IntersectionObserver for infinite scroll
	useEffect(() => {
		const el = loadMoreRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					loadMore();
				}
			},
			{ rootMargin: "400px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [loadMore]);

	// Cookie helpers
	const saveSheetWidthCookie = useCallback((width: number | null) => {
		if (width === null) {
			document.cookie = `${SHEET_WIDTH_COOKIE}=;path=/;max-age=0`;
		} else {
			document.cookie = `${SHEET_WIDTH_COOKIE}=${width};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
		}
	}, []);

	// Sheet resize handlers
	const handleSheetResize = useCallback((clientX: number) => {
		const newWidth = window.innerWidth - clientX;
		const maxWidth = window.innerWidth * MAX_SHEET_WIDTH_RATIO;
		setSheetWidth(Math.max(MIN_SHEET_WIDTH, Math.min(maxWidth, newWidth)));
		setIsResizing(true);
	}, []);

	const handleResizeEnd = useCallback(() => {
		setIsResizing(false);
		if (sheetWidth !== null) {
			saveSheetWidthCookie(sheetWidth);
		}
	}, [sheetWidth, saveSheetWidthCookie]);

	const resetSheetWidth = useCallback(() => {
		setSheetWidth(null);
		saveSheetWidthCookie(null);
	}, [saveSheetWidthCookie]);

	// Commit fetching
	const fetchCommits = useCallback(
		(branch: string, newSince?: string, newUntil?: string) => {
			startTransition(async () => {
				const result = await fetchCommitsByDate(
					owner,
					repo,
					newSince ? new Date(newSince).toISOString() : undefined,
					newUntil
						? new Date(newUntil + "T23:59:59").toISOString()
						: undefined,
					branch,
				);
				const data = result as Commit[];
				setDisplayedCommits(data);
				setPage(1);
				setHasMore(data.length >= PER_PAGE);
			});
		},
		[owner, repo],
	);

	// Subscribe to mutations
	useMutationSubscription(
		[
			"pr:merged",
			"pr:suggestion-committed",
			"pr:file-committed",
			"repo:file-committed",
		],
		(event: MutationEvent) => {
			if (!isRepoEvent(event, owner, repo)) return;
			fetchCommits(currentBranch, since || undefined, until || undefined);
		},
	);

	// Event handlers
	const handleBranchChange = useCallback(
		(branch: string) => {
			setCurrentBranch(branch);
			if (branch === defaultBranch && !since && !until) {
				setDisplayedCommits(commits);
				setPage(1);
				setHasMore(commits.length >= PER_PAGE);
			} else {
				fetchCommits(branch, since, until);
			}
		},
		[defaultBranch, since, until, commits, fetchCommits],
	);

	const handleSinceChange = useCallback(
		(newSince: string) => {
			setSince(newSince);
			if (!newSince && !until && currentBranch === defaultBranch) {
				setDisplayedCommits(commits);
				setPage(1);
				setHasMore(commits.length >= PER_PAGE);
			} else {
				fetchCommits(currentBranch, newSince, until);
			}
		},
		[until, currentBranch, defaultBranch, commits, fetchCommits],
	);

	const handleUntilChange = useCallback(
		(newUntil: string) => {
			setUntil(newUntil);
			if (!since && !newUntil && currentBranch === defaultBranch) {
				setDisplayedCommits(commits);
				setPage(1);
				setHasMore(commits.length >= PER_PAGE);
			} else {
				fetchCommits(currentBranch, since, newUntil);
			}
		},
		[since, currentBranch, defaultBranch, commits, fetchCommits],
	);

	const clearDates = useCallback(() => {
		setSince("");
		setUntil("");
		if (currentBranch === defaultBranch) {
			setDisplayedCommits(commits);
			setPage(1);
			setHasMore(commits.length >= PER_PAGE);
		} else {
			fetchCommits(currentBranch);
		}
	}, [currentBranch, defaultBranch, commits, fetchCommits]);

	const handleCommitClick = useCallback(
		async (sha: string) => {
			setSelectedCommitSha(sha);
			setSheetOpen(true);
			setIsLoadingDetail(true);
			setCommitDetail(null);
			setHighlightData({});

			const result = await fetchCommitDetail(owner, repo, sha);
			setCommitDetail(result.commit);
			setHighlightData(result.highlightData);
			setIsLoadingDetail(false);
		},
		[owner, repo],
	);

	const copySha = useCallback((sha: string) => {
		navigator.clipboard.writeText(sha);
		setCopiedSha(sha);
		setTimeout(() => setCopiedSha(null), 2000);
	}, []);

	const toggleExpand = useCallback((sha: string) => {
		setExpandedShas((prev) => {
			const next = new Set(prev);
			if (next.has(sha)) next.delete(sha);
			else next.add(sha);
			return next;
		});
	}, []);

	// Derived state
	const hasDateFilter = since !== "" || until !== "";
	const filtered = search
		? displayedCommits.filter((c) =>
				c.commit.message.toLowerCase().includes(search.toLowerCase()),
			)
		: displayedCommits;
	const grouped = groupByDate(filtered);

	return (
		<div className="space-y-4">
			<CommitsToolbar
				branches={branches}
				currentBranch={currentBranch}
				defaultBranch={defaultBranch}
				search={search}
				since={since}
				until={until}
				hasDateFilter={hasDateFilter}
				onBranchChange={handleBranchChange}
				onSearchChange={setSearch}
				onSinceChange={handleSinceChange}
				onUntilChange={handleUntilChange}
				onClearDates={clearDates}
			/>

			{isPending && (
				<div className="py-4 text-center text-xs text-muted-foreground">
					Loading commits...
				</div>
			)}

			{!isPending && grouped.length === 0 && (
				<div className="py-12 text-center text-sm text-muted-foreground">
					No commits found.
				</div>
			)}

			{grouped.map(([date, dateCommits]) => (
				<CommitDateGroup
					key={date}
					date={date}
					commits={dateCommits}
					owner={owner}
					repo={repo}
					expandedShas={expandedShas}
					copiedSha={copiedSha}
					isMobile={isMobile}
					onCommitClick={handleCommitClick}
					onToggleExpand={toggleExpand}
					onCopySha={copySha}
				/>
			))}

			{/* Infinite scroll sentinel */}
			{!search && (
				<div ref={loadMoreRef} className="py-2">
					{isLoadingMore && (
						<div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
							Loading more commits...
						</div>
					)}
				</div>
			)}

			<CommitDetailSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				owner={owner}
				repo={repo}
				selectedCommitSha={selectedCommitSha}
				commitDetail={commitDetail}
				highlightData={highlightData}
				isLoading={isLoadingDetail}
				sheetWidth={sheetWidth}
				isResizing={isResizing}
				onResize={handleSheetResize}
				onResizeEnd={handleResizeEnd}
				onResetWidth={resetSheetWidth}
			/>
		</div>
	);
}
