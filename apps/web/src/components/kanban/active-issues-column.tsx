"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import Image from "next/image";
import { Inbox, Loader2, CircleDot, MessageCircle, Clock, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import {
	fetchActiveIssuesPaginated,
	type ActiveIssue,
} from "@/app/(app)/repos/[owner]/[repo]/kanban/actions";
import type { KanbanStatus } from "@/lib/kanban-store";

interface ActiveIssuesColumnProps {
	owner: string;
	repo: string;
	onIssueClick: (issue: ActiveIssue) => void;
	kanbanIssueNumbers: Set<number>;
	onRegisterIssue?: (issue: ActiveIssue) => void;
	pendingIssueNumbers?: Map<number, { issue: ActiveIssue; status: KanbanStatus }>;
}

function LabelPill({ label }: { label: { name: string; color: string } }) {
	return (
		<span
			className="text-[9px] font-mono px-1.5 py-0.5 rounded-full whitespace-nowrap"
			style={{
				backgroundColor: `#${label.color}18`,
				color: `#${label.color}`,
			}}
		>
			{label.name}
		</span>
	);
}

export function ActiveIssuesColumn({
	owner,
	repo,
	onIssueClick,
	kanbanIssueNumbers,
	onRegisterIssue,
	pendingIssueNumbers,
}: ActiveIssuesColumnProps) {
	const [issues, setIssues] = useState<ActiveIssue[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [page, setPage] = useState(1);
	const [error, setError] = useState<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const loadIssues = useCallback(
		async (pageNum: number, append: boolean = false) => {
			try {
				if (append) {
					setIsLoadingMore(true);
				} else {
					setIsLoading(true);
				}
				setError(null);

				const result = await fetchActiveIssuesPaginated(
					owner,
					repo,
					pageNum,
					20,
				);

				if (onRegisterIssue) {
					result.issues.forEach(onRegisterIssue);
				}

				setIssues((prev) =>
					append ? [...prev, ...result.issues] : result.issues,
				);
				setHasMore(result.hasMore);
				setPage(pageNum);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to load issues");
			} finally {
				setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[owner, repo, onRegisterIssue],
	);

	useEffect(() => {
		loadIssues(1);
	}, [loadIssues]);

	const handleScroll = useCallback(() => {
		if (!scrollRef.current || isLoadingMore || !hasMore) return;

		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const scrollThreshold = 100;

		if (scrollHeight - scrollTop - clientHeight < scrollThreshold) {
			loadIssues(page + 1, true);
		}
	}, [isLoadingMore, hasMore, page, loadIssues]);

	useEffect(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) return;

		scrollEl.addEventListener("scroll", handleScroll);
		return () => scrollEl.removeEventListener("scroll", handleScroll);
	}, [handleScroll]);

	const pendingNumbers = useMemo(
		() => new Set(pendingIssueNumbers?.keys() ?? []),
		[pendingIssueNumbers],
	);

	const filteredIssues = issues.filter(
		(issue) =>
			!kanbanIssueNumbers.has(issue.number) && !pendingNumbers.has(issue.number),
	);

	return (
		<div className="flex flex-col w-72 shrink-0 min-h-0 outline-none">
			<div className="flex items-center justify-between mb-2 px-1">
				<h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
					<span className="text-blue-500">
						<Inbox className="w-3.5 h-3.5" />
					</span>
					All Issues
				</h2>
				<span className="text-xs font-mono text-muted-foreground/60">
					{filteredIssues.length}
					{hasMore && "+"}
				</span>
			</div>

			<div
				ref={scrollRef}
				className={cn(
					"flex-1 min-h-0 p-2 rounded-lg border border-border/50",
					"bg-blue-500/5 transition-colors overflow-y-auto",
				)}
			>
				{isLoading ? (
					<div className="flex items-center justify-center h-full">
						<Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
					</div>
				) : error ? (
					<div className="flex items-center justify-center h-full">
						<p className="text-xs text-red-400 px-4 text-center">
							{error}
						</p>
					</div>
				) : filteredIssues.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full gap-2">
						<CircleDot className="w-5 h-5 text-muted-foreground/30" />
						<p className="text-xs text-muted-foreground/50 text-center">
							All issues are on the board
						</p>
					</div>
				) : (
					<div className="space-y-2">
						{filteredIssues.map((issue, index) => (
							<Draggable
								key={`active-${issue.number}`}
								draggableId={`active-issue-${issue.number}`}
								index={index}
							>
								{(provided, snapshot) => (
									<div
										ref={
											provided.innerRef
										}
										{...provided.draggableProps}
										{...provided.dragHandleProps}
									>
										<ActiveIssueCard
											issue={
												issue
											}
											isDragging={
												snapshot.isDragging
											}
											onClick={() =>
												onIssueClick(
													issue,
												)
											}
										/>
									</div>
								)}
							</Draggable>
						))}
						{isLoadingMore && (
							<div className="flex items-center justify-center py-2">
								<Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function ActiveIssueCard({
	issue,
	isDragging,
	onClick,
}: {
	issue: ActiveIssue;
	isDragging: boolean;
	onClick: () => void;
}) {
	const assignee = issue.assignees?.[0];

	return (
		<div
			className={cn(
				"bg-background border border-border/60 rounded-md p-2.5 cursor-pointer outline-none",
				"hover:border-border hover:shadow-sm transition-all",
				isDragging && "shadow-lg border-border rotate-1",
			)}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			tabIndex={0}
		>
			<div className="flex items-start justify-between gap-2 mb-1.5">
				<div className="flex items-center gap-1.5 flex-1 min-w-0">
					<CircleDot className="w-3 h-3 text-green-500 shrink-0" />
					<h3 className="text-xs font-medium line-clamp-2">
						{issue.title}
					</h3>
				</div>
				<a
					href={issue.html_url}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
				>
					<ExternalLink className="w-3 h-3" />
				</a>
			</div>

			{issue.labels && issue.labels.length > 0 && (
				<div className="flex flex-wrap gap-1 mb-1.5">
					{issue.labels.slice(0, 2).map((label) => (
						<LabelPill key={label.name} label={label} />
					))}
					{issue.labels.length > 2 && (
						<span className="text-[9px] text-muted-foreground/50 self-center">
							+{issue.labels.length - 2}
						</span>
					)}
				</div>
			)}

			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="text-[10px] font-mono text-muted-foreground/50">
						#{issue.number}
					</span>
					{issue.comments > 0 && (
						<div className="flex items-center gap-0.5 text-muted-foreground/50">
							<MessageCircle className="w-2.5 h-2.5" />
							<span className="text-[10px]">
								{issue.comments}
							</span>
						</div>
					)}
					<div className="flex items-center gap-0.5 text-muted-foreground/40">
						<Clock className="w-2.5 h-2.5" />
						<span className="text-[9px]">
							<TimeAgo date={issue.updated_at} />
						</span>
					</div>
				</div>
				{assignee && (
					<Image
						src={assignee.avatar_url}
						alt={assignee.login}
						width={14}
						height={14}
						className="rounded-full shrink-0"
					/>
				)}
			</div>

			{issue.isOnKanban && (
				<div className="flex items-center gap-1 mt-1.5 text-[10px] text-green-500/70">
					<Check className="w-3 h-3" />
					<span>On board</span>
				</div>
			)}
		</div>
	);
}
