"use client";

import { useState, useMemo, useRef, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { MessageCircle, CheckCircle2, ArrowUp, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { LabelBadge } from "@/components/shared/label-badge";
import { loadMoreDiscussions } from "@/app/(app)/repos/[owner]/[repo]/discussions/actions";
import type { RepoDiscussionNode, DiscussionCategory } from "@/lib/github";
import { CreateDiscussionDialog } from "@/components/discussion/create-discussion-dialog";

type TabState = "all" | "answered" | "unanswered";

interface DiscussionsListProps {
	owner: string;
	repo: string;
	discussions: RepoDiscussionNode[];
	totalCount: number;
	categories: DiscussionCategory[];
	hasNextPage: boolean;
	endCursor: string | null;
	repositoryId: string;
}

export function DiscussionsList({
	owner,
	repo,
	discussions: initialDiscussions,
	totalCount,
	categories,
	hasNextPage: initialHasNextPage,
	endCursor: initialEndCursor,
	repositoryId,
}: DiscussionsListProps) {
	const [tab, setTab] = useState<TabState>("all");
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	const [allDiscussions, setAllDiscussions] = useState(initialDiscussions);
	const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
	const [endCursor, setEndCursor] = useState(initialEndCursor);
	const [isLoadingMore, startLoadingMore] = useTransition();
	const sentinelRef = useRef<HTMLDivElement>(null);

	// Reset when initial data changes (e.g. navigation)
	useEffect(() => {
		setAllDiscussions(initialDiscussions);
		setHasNextPage(initialHasNextPage);
		setEndCursor(initialEndCursor);
	}, [initialDiscussions, initialHasNextPage, initialEndCursor]);

	const fetchNextPage = useCallback(() => {
		if (!hasNextPage || !endCursor || isLoadingMore) return;
		startLoadingMore(async () => {
			const result = await loadMoreDiscussions(owner, repo, endCursor);
			setAllDiscussions((prev) => [...prev, ...result.discussions]);
			setHasNextPage(result.hasNextPage);
			setEndCursor(result.endCursor);
		});
	}, [hasNextPage, endCursor, isLoadingMore, owner, repo]);

	// IntersectionObserver for infinite scroll
	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) fetchNextPage();
			},
			{ rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [fetchNextPage]);

	const filtered = useMemo(() => {
		let items = allDiscussions;

		if (tab === "answered") {
			items = items.filter((d) => d.isAnswered);
		} else if (tab === "unanswered") {
			items = items.filter((d) => d.category.isAnswerable && !d.isAnswered);
		}

		if (selectedCategory) {
			items = items.filter((d) => d.category.name === selectedCategory);
		}

		if (search.trim()) {
			const q = search.toLowerCase();
			items = items.filter(
				(d) =>
					d.title.toLowerCase().includes(q) ||
					d.bodyText.toLowerCase().includes(q),
			);
		}

		return items;
	}, [allDiscussions, tab, selectedCategory, search]);

	const answeredCount = allDiscussions.filter((d) => d.isAnswered).length;
	const unansweredCount = allDiscussions.filter(
		(d) => d.category.isAnswerable && !d.isAnswered,
	).length;

	const tabs: { label: string; value: TabState; count?: number }[] = [
		{ label: "All", value: "all", count: totalCount },
		{ label: "Answered", value: "answered", count: answeredCount },
		{ label: "Unanswered", value: "unanswered", count: unansweredCount },
	];

	return (
		<div>
			{/* Category filter pills */}
			{categories.length > 0 && (
				<div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1">
					<button
						onClick={() => setSelectedCategory(null)}
						className={cn(
							"text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors cursor-pointer whitespace-nowrap shrink-0",
							!selectedCategory
								? "border-foreground/30 text-foreground bg-muted/60"
								: "border-border/60 text-muted-foreground/60 hover:text-foreground hover:border-foreground/20",
						)}
					>
						All categories
					</button>
					{categories.map((cat) => (
						<button
							key={cat.id}
							onClick={() =>
								setSelectedCategory(
									selectedCategory ===
										cat.name
										? null
										: cat.name,
								)
							}
							className={cn(
								"text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors cursor-pointer whitespace-nowrap shrink-0",
								selectedCategory === cat.name
									? "border-foreground/30 text-foreground bg-muted/60"
									: "border-border/60 text-muted-foreground/60 hover:text-foreground hover:border-foreground/20",
							)}
						>
							{cat.emoji} {cat.name}
						</button>
					))}
				</div>
			)}

			{/* Tabs + Search */}
			<div className="flex items-center gap-2 mb-3">
				<div className="flex items-center gap-1">
					{tabs.map((t) => (
						<button
							key={t.value}
							onClick={() => setTab(t.value)}
							className={cn(
								"flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer",
								tab === t.value
									? "text-foreground bg-muted/60"
									: "text-muted-foreground/60 hover:text-foreground",
							)}
						>
							{t.label}
							{t.count !== undefined && t.count > 0 && (
								<span
									className={cn(
										"text-[10px] font-mono px-1.5 py-0.5 rounded-full",
										tab === t.value
											? "bg-muted text-foreground/70"
											: "bg-muted/50 text-muted-foreground/50",
									)}
								>
									{t.count}
								</span>
							)}
						</button>
					))}
				</div>
				<div className="flex-1 max-w-xs">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Filter discussions..."
						className="w-full h-7 px-2.5 text-xs bg-transparent border border-border/40 rounded placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground/20"
					/>
				</div>
				<div className="ml-auto">
					<CreateDiscussionDialog
						owner={owner}
						repo={repo}
						categories={categories}
						repositoryId={repositoryId}
					/>
				</div>
			</div>

			{/* Discussion list */}
			{filtered.length === 0 ? (
				<div className="py-12 text-center">
					<MessageCircle className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
					<p className="text-sm text-muted-foreground/50">
						{search || selectedCategory
							? "No discussions match your filters"
							: "No discussions yet"}
					</p>
				</div>
			) : (
				<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
					{filtered.map((d) => (
						<DiscussionRow
							key={d.number}
							discussion={d}
							owner={owner}
							repo={repo}
						/>
					))}
				</div>
			)}

			{/* Infinite scroll sentinel */}
			{hasNextPage && (
				<div ref={sentinelRef} className="py-4 text-center">
					{isLoadingMore ? (
						<Loader2 className="w-4 h-4 mx-auto animate-spin text-muted-foreground/40" />
					) : (
						<button
							onClick={fetchNextPage}
							className="text-[11px] font-mono text-muted-foreground/50 hover:text-foreground/60 transition-colors cursor-pointer"
						>
							Load more discussions
						</button>
					)}
				</div>
			)}
		</div>
	);
}

function DiscussionRow({
	discussion: d,
	owner,
	repo,
}: {
	discussion: RepoDiscussionNode;
	owner: string;
	repo: string;
}) {
	return (
		<Link
			href={`/${owner}/${repo}/discussions/${d.number}`}
			className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
		>
			{/* Icon */}
			<div className="mt-0.5 shrink-0">
				{d.isAnswered ? (
					<CheckCircle2 className="w-4 h-4 text-success" />
				) : (
					<MessageCircle className="w-4 h-4 text-muted-foreground/50" />
				)}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0 space-y-1">
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-sm font-medium text-foreground leading-tight">
						{d.title}
					</span>
					{/* Category pill */}
					<span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground/60 whitespace-nowrap">
						{d.category.emoji} {d.category.name}
					</span>
					{d.isAnswered && (
						<span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-success/10 text-success whitespace-nowrap">
							Answered
						</span>
					)}
					{d.labels
						.filter((l) => l.name)
						.map((label) => (
							<LabelBadge
								key={label.name}
								label={label}
							/>
						))}
				</div>

				{/* Meta row */}
				<div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
					{d.author && (
						<span className="flex items-center gap-1">
							<Image
								src={d.author.avatar_url}
								alt={d.author.login}
								width={14}
								height={14}
								className="rounded-full"
							/>
							<span className="font-mono">
								{d.author.login}
							</span>
						</span>
					)}
					<span>
						<TimeAgo date={d.createdAt} />
					</span>
					<div className="flex items-center gap-3 ml-auto">
						{d.upvoteCount > 0 && (
							<span className="flex items-center gap-0.5">
								<ArrowUp className="w-3 h-3" />
								{d.upvoteCount}
							</span>
						)}
						{d.commentsCount > 0 && (
							<span className="flex items-center gap-0.5">
								<MessageSquare className="w-3 h-3" />
								{d.commentsCount}
							</span>
						)}
					</div>
				</div>
			</div>
		</Link>
	);
}
