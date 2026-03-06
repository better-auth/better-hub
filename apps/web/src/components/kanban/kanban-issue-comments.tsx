"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Send, ExternalLink, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import { ReactiveCodeBlocks } from "@/components/shared/reactive-code-blocks";
import { MarkdownMentionTooltips } from "@/components/shared/markdown-mention-tooltips";
import { TimeAgo } from "@/components/ui/time-ago";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import {
	fetchIssueComments,
	addIssueComment,
} from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";

export interface IssueComment {
	id: number;
	body?: string | null;
	bodyHtml?: string;
	user: { login: string; avatar_url: string; type?: string } | null;
	created_at: string;
	author_association?: string;
	_optimisticStatus?: "pending" | "failed";
}

interface KanbanIssueCommentsProps {
	owner: string;
	repo: string;
	issueNumber: number;
	issueUrl: string;
	currentUser: { id: string; login: string | null; name: string; image: string } | null;
	variant?: "default" | "compact";
}

export function KanbanIssueComments({
	owner,
	repo,
	issueNumber,
	issueUrl,
	currentUser,
	variant = "default",
}: KanbanIssueCommentsProps) {
	const router = useRouter();
	const [comments, setComments] = useState<IssueComment[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [commentBody, setCommentBody] = useState("");
	const [isSubmitting, startTransition] = useTransition();
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [showScrollTop, setShowScrollTop] = useState(false);
	const [showScrollBottom, setShowScrollBottom] = useState(false);

	const isCompact = variant === "compact";

	const handleScroll = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const { scrollTop, scrollHeight, clientHeight } = container;
		setShowScrollTop(scrollTop > 100);
		setShowScrollBottom(scrollTop < scrollHeight - clientHeight - 100);
	}, []);

	const scrollToTop = useCallback(() => {
		scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const scrollToBottom = useCallback(() => {
		const container = scrollContainerRef.current;
		if (container) {
			container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
		}
	}, []);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		handleScroll();
		container.addEventListener("scroll", handleScroll);
		return () => container.removeEventListener("scroll", handleScroll);
	}, [handleScroll, comments]);

	useEffect(() => {
		let mounted = true;
		setIsLoading(true);

		fetchIssueComments(owner, repo, issueNumber)
			.then((data) => {
				if (mounted && Array.isArray(data)) {
					setComments(data as IssueComment[]);
				}
			})
			.finally(() => {
				if (mounted) setIsLoading(false);
			});

		return () => {
			mounted = false;
		};
	}, [owner, repo, issueNumber]);

	const handleAddComment = useCallback(() => {
		const body = commentBody.trim();
		if (!body || !currentUser) return;

		const optimisticComment: IssueComment = {
			id: Date.now(),
			body,
			user: currentUser.login
				? { login: currentUser.login, avatar_url: currentUser.image }
				: null,
			created_at: new Date().toISOString(),
			_optimisticStatus: "pending",
		};

		setComments((prev) => [...prev, optimisticComment]);
		setCommentBody("");

		startTransition(async () => {
			const result = await addIssueComment(owner, repo, issueNumber, body);
			if ("error" in result) {
				setComments((prev) =>
					prev.map((c) =>
						c.id === optimisticComment.id
							? {
									...c,
									_optimisticStatus:
										"failed" as const,
								}
							: c,
					),
				);
			} else {
				setComments((prev) =>
					prev.filter((c) => c.id !== optimisticComment.id),
				);
				router.refresh();
				const data = await fetchIssueComments(owner, repo, issueNumber);
				if (Array.isArray(data)) {
					setComments(data as IssueComment[]);
				}
			}
		});
	}, [commentBody, currentUser, owner, repo, issueNumber, router]);

	const avatarSize = isCompact ? 20 : 24;
	const textSize = isCompact ? "text-xs" : "text-sm";
	const timeSize = isCompact ? "text-[10px]" : "text-xs";

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
				<div className="flex items-center gap-2">
					<MessageCircle className="w-4 h-4 text-muted-foreground" />
					<h3
						className={cn(
							"font-medium text-foreground",
							isCompact ? "text-xs" : "text-sm",
						)}
					>
						Issue Discussion
					</h3>
					{!isLoading && (
						<span
							className={cn(
								"text-muted-foreground/60 font-mono",
								isCompact
									? "text-[10px]"
									: "text-xs",
							)}
						>
							({comments.length})
						</span>
					)}
				</div>
				<a
					href={issueUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
					title="View on GitHub"
				>
					<ExternalLink className="w-3.5 h-3.5" />
				</a>
			</div>

			{/* Comments list */}
			<div
				ref={scrollContainerRef}
				className="flex-1 overflow-y-auto p-3 space-y-3 relative"
			>
				{/* Floating scroll buttons */}
				{(showScrollTop || showScrollBottom) && (
					<div className="sticky top-2 z-10 flex justify-end pointer-events-none">
						<div className="flex flex-col gap-1 pointer-events-auto">
							{showScrollTop && (
								<button
									onClick={scrollToTop}
									className="w-6 h-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
									title="Scroll to top"
								>
									<ChevronUp className="w-3.5 h-3.5" />
								</button>
							)}
							{showScrollBottom && (
								<button
									onClick={scrollToBottom}
									className="w-6 h-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
									title="Scroll to bottom"
								>
									<ChevronDown className="w-3.5 h-3.5" />
								</button>
							)}
						</div>
					</div>
				)}
				{isLoading && (
					<>
						{[1, 2, 3].map((i) => (
							<div
								key={i}
								className={cn(
									"border border-border/50 rounded-lg bg-background animate-pulse",
									isCompact ? "p-3" : "p-4",
								)}
							>
								<div className="flex items-center gap-2">
									<div
										className="rounded-full bg-muted"
										style={{
											width: avatarSize,
											height: avatarSize,
										}}
									/>
									<div
										className={cn(
											"h-3 bg-muted rounded",
											isCompact
												? "w-20"
												: "w-24",
										)}
									/>
									<div
										className={cn(
											"bg-muted/60 rounded",
											isCompact
												? "h-2.5 w-12"
												: "h-3 w-14",
										)}
									/>
								</div>
								<div
									className={cn(
										"space-y-1.5 mt-2",
										isCompact
											? "pl-7"
											: "pl-8",
									)}
								>
									<div className="h-3 w-full bg-muted/50 rounded" />
									<div className="h-3 w-3/4 bg-muted/50 rounded" />
								</div>
							</div>
						))}
					</>
				)}

				{!isLoading && comments.length === 0 && (
					<div className="flex flex-col items-center justify-center py-8 text-center">
						<MessageCircle className="w-8 h-8 text-muted-foreground/20 mb-2" />
						<p className="text-xs text-muted-foreground/50">
							No comments on this issue
						</p>
						<p className="text-[10px] text-muted-foreground/40 mt-1">
							Be the first to comment
						</p>
					</div>
				)}

				{!isLoading &&
					comments.map((comment) => (
						<div
							key={comment.id}
							className={cn(
								"border border-border/50 rounded-lg bg-background",
								isCompact ? "p-3" : "p-4",
								comment._optimisticStatus ===
									"pending" && "opacity-60",
								comment._optimisticStatus ===
									"failed" &&
									"border-red-500/50",
							)}
						>
							<div
								className={cn(
									"flex items-center",
									isCompact
										? "gap-2"
										: "gap-3",
								)}
							>
								{comment.user?.avatar_url ? (
									<Image
										src={
											comment.user
												.avatar_url
										}
										alt={
											comment.user
												.login
										}
										width={avatarSize}
										height={avatarSize}
										className="rounded-full shrink-0"
									/>
								) : (
									<div
										className="rounded-full bg-muted shrink-0"
										style={{
											width: avatarSize,
											height: avatarSize,
										}}
									/>
								)}
								<div className="flex items-center gap-1.5 flex-1 min-w-0">
									{comment.user?.login ? (
										<Link
											href={`/users/${comment.user.login}`}
											className={cn(
												textSize,
												"font-medium text-foreground hover:underline truncate",
											)}
										>
											{
												comment
													.user
													.login
											}
										</Link>
									) : (
										<span
											className={cn(
												textSize,
												"font-medium text-foreground truncate",
											)}
										>
											ghost
										</span>
									)}
									{comment.author_association &&
										comment.author_association !==
											"NONE" && (
											<span className="text-[9px] px-1.5 py-0.5 border border-border/60 text-muted-foreground/50 rounded font-medium">
												{comment.author_association.toLowerCase()}
											</span>
										)}
									{comment._optimisticStatus ===
									"pending" ? (
										<span
											className={cn(
												timeSize,
												"text-muted-foreground/40 italic",
											)}
										>
											posting...
										</span>
									) : comment._optimisticStatus ===
									  "failed" ? (
										<span
											className={cn(
												timeSize,
												"text-red-400",
											)}
										>
											failed
										</span>
									) : (
										<span
											className={cn(
												timeSize,
												"text-muted-foreground/50 font-mono shrink-0",
											)}
										>
											<TimeAgo
												date={
													comment.created_at
												}
											/>
										</span>
									)}
								</div>
							</div>

							<div
								className={cn(
									"mt-1.5",
									isCompact ? "pl-7" : "pl-8",
									textSize,
								)}
							>
								{comment.bodyHtml ? (
									<MarkdownCopyHandler>
										<ReactiveCodeBlocks>
											<MarkdownMentionTooltips>
												<div
													className={cn(
														"ghmd",
														isCompact &&
															"ghmd-sm",
													)}
													dangerouslySetInnerHTML={{
														__html: comment.bodyHtml,
													}}
												/>
											</MarkdownMentionTooltips>
										</ReactiveCodeBlocks>
									</MarkdownCopyHandler>
								) : comment.body ? (
									<ClientMarkdown
										content={
											comment.body
										}
									/>
								) : (
									<p className="text-muted-foreground/30 italic">
										No content
									</p>
								)}
							</div>
						</div>
					))}
			</div>

			{/* Comment input */}
			{currentUser && (
				<div className="shrink-0 p-3 border-t border-border bg-background">
					<div className="rounded-lg border border-border overflow-hidden">
						<MarkdownEditor
							value={commentBody}
							onChange={setCommentBody}
							placeholder="Reply to issue..."
							rows={3}
							className={cn(
								"border-none",
								isCompact && "text-xs",
							)}
							resizeYIndicator={false}
							onKeyDown={(e) => {
								if (
									e.key === "Enter" &&
									(e.metaKey || e.ctrlKey)
								) {
									e.preventDefault();
									handleAddComment();
								}
							}}
						/>
						<div
							className={cn(
								"flex items-center justify-between bg-muted/30 border-t border-border/50",
								isCompact
									? "px-2.5 py-1.5"
									: "px-3 py-2",
							)}
						>
							<span
								className={cn(
									"text-muted-foreground/50",
									isCompact
										? "text-[9px]"
										: "text-xs",
								)}
							>
								<kbd
									className={cn(
										"bg-muted border border-border rounded",
										isCompact
											? "px-1 py-0.5 text-[8px]"
											: "px-1 py-0.5 text-[10px]",
									)}
								>
									⌘
								</kbd>{" "}
								+{" "}
								<kbd
									className={cn(
										"bg-muted border border-border rounded",
										isCompact
											? "px-1 py-0.5 text-[8px]"
											: "px-1 py-0.5 text-[10px]",
									)}
								>
									↵
								</kbd>
							</span>
							<button
								onClick={handleAddComment}
								disabled={
									!commentBody.trim() ||
									isSubmitting
								}
								className={cn(
									"flex items-center gap-1 font-medium rounded",
									"bg-primary text-primary-foreground",
									"hover:bg-primary/90 transition-colors cursor-pointer",
									"disabled:opacity-40 disabled:cursor-not-allowed",
									isCompact
										? "px-2 py-1 text-[10px]"
										: "px-3 py-1.5 text-xs",
								)}
							>
								{isSubmitting ? (
									<Loader2
										className={cn(
											"animate-spin",
											isCompact
												? "w-3 h-3"
												: "w-3.5 h-3.5",
										)}
									/>
								) : (
									<Send
										className={
											isCompact
												? "w-3 h-3"
												: "w-3.5 h-3.5"
										}
									/>
								)}
								{isCompact ? "Reply" : "Comment"}
							</button>
						</div>
					</div>
					<p className="text-[9px] text-muted-foreground/40 mt-1.5 text-center">
						This comment will be posted publicly on GitHub
					</p>
				</div>
			)}
		</div>
	);
}
