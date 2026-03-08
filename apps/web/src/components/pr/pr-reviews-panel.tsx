"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { GithubAvatar } from "@/components/shared/github-avatar";
import {
	Check,
	AlertTriangle,
	MessageSquare,
	ChevronDown,
	CheckCircle2,
	Circle,
	Loader2,
	FileCode,
	X as XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import type { ReviewThread } from "@/lib/github";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import {
	resolveReviewThread,
	unresolveReviewThread,
} from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";

interface ReviewSummary {
	id: number;
	user: { login: string; avatar_url: string } | null;
	state: string;
	submitted_at: string | null;
}

interface PRReviewsPanelProps {
	reviews: ReviewSummary[];
	threads: ReviewThread[];
	owner: string;
	repo: string;
	pullNumber: number;
}

type FilterMode = "all" | "unresolved" | "resolved";

const stateConfig: Record<string, { icon: typeof Check; label: string; className: string }> = {
	APPROVED: {
		icon: Check,
		label: "Approved",
		className: "text-success",
	},
	CHANGES_REQUESTED: {
		icon: AlertTriangle,
		label: "Changes requested",
		className: "text-warning",
	},
	COMMENTED: {
		icon: MessageSquare,
		label: "Commented",
		className: "text-info",
	},
	DISMISSED: {
		icon: XIcon,
		label: "Dismissed",
		className: "text-muted-foreground",
	},
};

export function PRReviewsPanel({ reviews, threads, owner, repo, pullNumber }: PRReviewsPanelProps) {
	const [filter, setFilter] = useState<FilterMode>("all");
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

	// Deduplicate reviews: latest per user
	const latestByUser = new Map<string, ReviewSummary>();
	for (const r of reviews) {
		if (!r.user || r.state === "PENDING") continue;
		const existing = latestByUser.get(r.user.login);
		if (
			!existing ||
			new Date(r.submitted_at || "").getTime() >
				new Date(existing.submitted_at || "").getTime()
		) {
			latestByUser.set(r.user.login, r);
		}
	}
	const reviewSummaries = Array.from(latestByUser.values());

	// Filter threads
	const filteredThreads = threads.filter((t) => {
		if (filter === "unresolved") return !t.isResolved;
		if (filter === "resolved") return t.isResolved;
		return true;
	});

	// Group by file
	const threadsByFile = new Map<string, ReviewThread[]>();
	for (const t of filteredThreads) {
		const existing = threadsByFile.get(t.path) || [];
		existing.push(t);
		threadsByFile.set(t.path, existing);
	}
	const sortedFiles = Array.from(threadsByFile.entries()).sort(([a], [b]) =>
		a.localeCompare(b),
	);

	const unresolvedCount = threads.filter((t) => !t.isResolved).length;
	const resolvedCount = threads.filter((t) => t.isResolved).length;

	// Start with all files expanded
	const isFileExpanded = (path: string) => {
		if (expandedFiles.size === 0 && filter !== "resolved") return true;
		return expandedFiles.has(path);
	};

	const toggleFile = (path: string) => {
		setExpandedFiles((prev) => {
			const next = new Set(prev);
			// If nothing was explicitly toggled yet, initialize with all expanded
			if (prev.size === 0) {
				sortedFiles.forEach(([p]) => next.add(p));
				next.delete(path);
			} else if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	return (
		<div className="flex flex-col h-full">
			{/* Review summary */}
			{reviewSummaries.length > 0 && (
				<div className="shrink-0 px-4 py-3 border-b border-border/60">
					<div className="flex flex-wrap items-center gap-3">
						{reviewSummaries.map((r) => {
							const config =
								stateConfig[r.state] ||
								stateConfig.COMMENTED;
							const Icon = config.icon;
							return (
								<Link
									key={r.user!.login}
									href={`/users/${r.user!.login}`}
									className="flex items-center gap-1.5 hover:text-foreground transition-colors"
								>
									<GithubAvatar
										src={
											r.user!
												.avatar_url
										}
										alt={r.user!.login}
										size={18}
										className="rounded-full"
									/>
									<span className="text-xs font-medium text-foreground/80">
										{r.user!.login}
									</span>
									<Icon
										className={cn(
											"w-3.5 h-3.5",
											config.className,
										)}
									/>
								</Link>
							);
						})}
					</div>
				</div>
			)}

			{/* Filter bar */}
			<div className="shrink-0 px-4 py-2 border-b border-border/60 bg-card/30">
				<div className="flex items-center gap-1">
					{(
						[
							{
								key: "all",
								label: `All (${threads.length})`,
							},
							{
								key: "unresolved",
								label: `Unresolved (${unresolvedCount})`,
							},
							{
								key: "resolved",
								label: `Resolved (${resolvedCount})`,
							},
						] as const
					).map(({ key, label }) => (
						<button
							key={key}
							onClick={() => setFilter(key)}
							className={cn(
								"px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer",
								filter === key
									? "bg-accent text-foreground font-medium"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/60",
							)}
						>
							{label}
						</button>
					))}
				</div>
			</div>

			{/* Threads by file */}
			<div className="flex-1 overflow-y-auto">
				{sortedFiles.length === 0 && (
					<div className="py-12 text-center">
						<p className="text-sm text-muted-foreground/60">
							{filter === "unresolved"
								? "All threads resolved"
								: filter === "resolved"
									? "No resolved threads"
									: "No review threads yet"}
						</p>
					</div>
				)}

				{sortedFiles.map(([filePath, fileThreads]) => {
					const fileName = filePath.split("/").pop() || filePath;
					const dir = filePath.includes("/")
						? filePath.slice(0, filePath.lastIndexOf("/") + 1)
						: "";
					const expanded = isFileExpanded(filePath);
					const fileUnresolved = fileThreads.filter(
						(t) => !t.isResolved,
					).length;

					return (
						<div
							key={filePath}
							className="border-b border-border/40"
						>
							{/* File header */}
							<button
								onClick={() => toggleFile(filePath)}
								className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-muted/50 transition-colors cursor-pointer"
							>
								<ChevronDown
									className={cn(
										"w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
										!expanded &&
											"-rotate-90",
									)}
								/>
								<FileCode className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
								<span className="text-xs truncate flex-1 min-w-0">
									{dir && (
										<span className="text-muted-foreground/50">
											{dir}
										</span>
									)}
									<span className="font-medium text-foreground/80">
										{fileName}
									</span>
								</span>
								<span className="text-[10px] text-muted-foreground/60 shrink-0">
									{fileThreads.length} thread
									{fileThreads.length !== 1
										? "s"
										: ""}
								</span>
								{fileUnresolved > 0 && (
									<span className="text-[10px] text-warning/70 shrink-0">
										{fileUnresolved}{" "}
										open
									</span>
								)}
							</button>

							{/* Threads */}
							{expanded && (
								<div className="px-4 pb-2 space-y-2">
									{fileThreads.map(
										(thread) => (
											<ThreadCard
												key={
													thread.id
												}
												thread={
													thread
												}
												owner={
													owner
												}
												repo={
													repo
												}
												pullNumber={
													pullNumber
												}
											/>
										),
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ThreadCard({
	thread,
	owner,
	repo,
	pullNumber,
}: {
	thread: ReviewThread;
	owner: string;
	repo: string;
	pullNumber: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const [isPending, startTransition] = useTransition();

	const handleToggleResolve = (e: React.MouseEvent) => {
		e.stopPropagation();
		startTransition(async () => {
			if (thread.isResolved) {
				await unresolveReviewThread(thread.id, owner, repo, pullNumber);
			} else {
				await resolveReviewThread(thread.id, owner, repo, pullNumber);
			}
		});
	};

	const firstComment = thread.comments[0];
	const replies = thread.comments.slice(1);

	return (
		<div
			className={cn(
				"rounded-lg border transition-colors",
				thread.isResolved
					? "border-border/40 bg-card/30"
					: "border-border/60",
			)}
		>
			{/* Collapsed preview — always visible */}
			<button
				onClick={() => setExpanded((e) => !e)}
				className="w-full text-left cursor-pointer group/thread"
			>
				{/* Header row */}
				<div className="flex items-center gap-2 px-3 pt-2 pb-1">
					<ChevronDown
						className={cn(
							"w-3 h-3 text-muted-foreground/50 transition-transform duration-200 shrink-0",
							!expanded && "-rotate-90",
						)}
					/>
					{firstComment?.author && (
						<Link
							href={`/users/${firstComment.author.login}`}
							onClick={(e) => e.stopPropagation()}
							className="flex items-center gap-2 text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
						>
							<GithubAvatar
								src={firstComment.author.avatarUrl}
								alt={firstComment.author.login}
								size={16}
								className="rounded-full shrink-0"
							/>
							{firstComment.author.login}
						</Link>
					)}
					{thread.line !== null && (
						<span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
							L{thread.line}
						</span>
					)}
					{firstComment && (
						<span className="text-[10px] text-muted-foreground/50 shrink-0">
							<TimeAgo date={firstComment.createdAt} />
						</span>
					)}
					{replies.length > 0 && (
						<span className="text-[10px] text-muted-foreground/50 shrink-0">
							+{replies.length}
						</span>
					)}

					{/* Resolve toggle */}
					<span className="ml-auto shrink-0">
						<span
							onClick={handleToggleResolve}
							className={cn(
								"inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md transition-colors cursor-pointer",
								isPending &&
									"opacity-40 pointer-events-none",
								thread.isResolved
									? "text-success hover:bg-success/10"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/60",
							)}
						>
							{isPending ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : thread.isResolved ? (
								<CheckCircle2 className="w-3 h-3" />
							) : (
								<Circle className="w-3 h-3" />
							)}
							{thread.isResolved ? "Resolved" : "Resolve"}
						</span>
					</span>
				</div>

				{/* Preview body — first comment truncated with fade */}
				{!expanded && firstComment && (
					<div className="relative px-3 pb-2 pl-[2.25rem]">
						<div className="max-h-[3.5rem] overflow-hidden">
							<div
								className={cn(
									"text-[13px] leading-[1.4] text-foreground/70",
									thread.isResolved &&
										"opacity-50",
								)}
							>
								<ClientMarkdown
									content={firstComment.body}
								/>
							</div>
						</div>
						{/* Fade overlay */}
						<div className="absolute bottom-2 left-[2.25rem] right-3 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none" />
					</div>
				)}
			</button>

			{/* Expanded — full thread */}
			{expanded && (
				<div className="border-t border-border/40">
					{thread.comments.map((comment, i) => (
						<div
							key={comment.id}
							className={cn(
								i > 0 &&
									"border-t border-border/30",
							)}
						>
							<div className="flex items-center gap-1.5 px-3 py-1.5">
								{comment.author && (
									<Link
										href={`/users/${comment.author.login}`}
										className="flex items-center gap-1.5 text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
									>
										<GithubAvatar
											src={
												comment
													.author
													.avatarUrl
											}
											alt={
												comment
													.author
													.login
											}
											size={14}
											className="rounded-full shrink-0"
										/>
										{
											comment
												.author
												.login
										}
									</Link>
								)}
								<span className="text-[10px] text-muted-foreground/50">
									<TimeAgo
										date={
											comment.createdAt
										}
									/>
								</span>
							</div>
							<div
								className={cn(
									"px-3 pb-2.5 text-[13px] leading-[1.5] text-foreground/80",
									thread.isResolved &&
										"opacity-60",
								)}
							>
								<ClientMarkdown
									content={comment.body}
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
