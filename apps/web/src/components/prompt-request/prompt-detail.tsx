"use client";

import { useState, useTransition, useOptimistic, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
	ArrowLeft,
	Sparkles,
	X,
	Trash2,
	Loader2,
	MessageSquare,
	Send,
	Copy,
	Check,
	RotateCcw,
	Ghost,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { TimeAgo } from "@/components/ui/time-ago";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { useGlobalChat } from "@/components/shared/global-chat-provider";
import {
	closePromptRequest,
	reopenPromptRequest,
	deletePromptRequestAction,
	acceptPromptRequestAction,
	addPromptComment,
	deletePromptComment,
} from "@/app/(app)/repos/[owner]/[repo]/prompts/actions";
import type {
	PromptRequest,
	PromptRequestStatus,
	PromptRequestComment,
} from "@/lib/prompt-request-store";

const statusColors: Record<PromptRequestStatus, string> = {
	open: "bg-green-500/15 text-green-400",
	accepted: "bg-blue-500/15 text-blue-400",
	closed: "bg-red-500/15 text-red-400",
};

const statusLabels: Record<PromptRequestStatus, string> = {
	open: "Open",
	accepted: "Accepted",
	closed: "Closed",
};

interface PromptDetailProps {
	owner: string;
	repo: string;
	promptRequest: PromptRequest;
	comments: PromptRequestComment[];
	currentUser: { id: string; login: string | null; name: string; image: string } | null;
	canManage: boolean;
	isMaintainer: boolean;
}

export function PromptDetail({
	owner,
	repo,
	promptRequest,
	comments,
	currentUser,
	canManage,
	isMaintainer,
}: PromptDetailProps) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const { openChat } = useGlobalChat();
	const [isAccepting, setIsAccepting] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const [isReopening, setIsReopening] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [copied, setCopied] = useState(false);

	// Comment state
	const [commentBody, setCommentBody] = useState("");
	const [isSubmittingComment, startCommentTransition] = useTransition();
	const [optimisticComments, addOptimisticComment] = useOptimistic(
		comments,
		(
			state: PromptRequestComment[],
			action:
				| { type: "add"; comment: PromptRequestComment }
				| { type: "delete"; id: string },
		) => {
			if (action.type === "add") return [...state, action.comment];
			return state.filter((c) => c.id !== action.id);
		},
	);

	const handleAddComment = () => {
		const body = commentBody.trim();
		if (!body || !currentUser) return;

		const optimistic: PromptRequestComment = {
			id: `optimistic-${Date.now()}`,
			promptRequestId: promptRequest.id,
			userId: currentUser.id,
			userLogin: currentUser.login,
			userName: currentUser.name,
			userAvatarUrl: currentUser.image,
			body,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		setCommentBody("");
		startCommentTransition(async () => {
			addOptimisticComment({ type: "add", comment: optimistic });
			try {
				await addPromptComment(promptRequest.id, body);
			} catch {
				// revalidation from server action will restore correct state
			}
		});
	};

	const handleDeleteComment = (commentId: string) => {
		startCommentTransition(async () => {
			addOptimisticComment({ type: "delete", id: commentId });
			try {
				await deletePromptComment(commentId, promptRequest.id);
			} catch {
				// revalidation from server action will restore correct state
			}
		});
	};

	const handleClose = async () => {
		setIsClosing(true);
		try {
			await closePromptRequest(promptRequest.id);
			emit({ type: "prompt:closed", owner, repo });
			router.refresh();
		} catch {
			setIsClosing(false);
		}
	};

	const handleReopen = async () => {
		setIsReopening(true);
		try {
			await reopenPromptRequest(promptRequest.id);
			emit({ type: "prompt:reopened", owner, repo });
			router.refresh();
		} catch {
			setIsReopening(false);
		}
	};

	const handleDelete = async () => {
		if (!confirm("Delete this prompt request?")) return;
		setIsDeleting(true);
		try {
			await deletePromptRequestAction(promptRequest.id);
			emit({ type: "prompt:deleted", owner, repo });
			router.push(`/${owner}/${repo}/prompts`);
		} catch {
			setIsDeleting(false);
		}
	};

	const handleAcceptAndCopy = async () => {
		if (promptRequest.status === "open" && isMaintainer) {
			setIsAccepting(true);
			try {
				await acceptPromptRequestAction(promptRequest.id);
				emit({ type: "prompt:accepted", owner, repo });
				router.refresh();
			} catch {
				setIsAccepting(false);
				return;
			}
			setIsAccepting(false);
		}
		await navigator.clipboard.writeText(promptRequest.body);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleCopy = async () => {
		await navigator.clipboard.writeText(promptRequest.body);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleRunWithGhost = useCallback(async () => {
		if (promptRequest.status === "open") {
			setIsAccepting(true);
			try {
				await acceptPromptRequestAction(promptRequest.id);
				emit({ type: "prompt:accepted", owner, repo });
				router.refresh();
			} catch {
				setIsAccepting(false);
				return;
			}
			setIsAccepting(false);
		}

		openChat({
			chatType: "general",
			contextKey: `${owner}/${repo}`,
			contextBody: {},
			placeholder: "Ghost is working on this prompt...",
			emptyTitle: `Prompt: ${promptRequest.title}`,
			emptyDescription: "Ghost will implement the changes and open a PR.",
		});

		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("ghost-auto-send", {
					detail: {
						message: [
							`Process this prompt request for **${owner}/${repo}** and open a pull request when you're done.`,
							"",
							"---",
							"",
							promptRequest.body,
							"",
							"---",
							"",
							"Instructions:",
							"1. Analyze the repository and understand the codebase",
							"2. Implement the changes described in the prompt above",
							"3. When done, create a pull request with a clear title and description of what was changed",
						].join("\n"),
					},
				}),
			);
		}, 300);
	}, [
		openChat,
		owner,
		repo,
		promptRequest.title,
		promptRequest.body,
		promptRequest.id,
		promptRequest.status,
		emit,
		router,
	]);

	const isOpen = promptRequest.status === "open";
	const isAccepted = promptRequest.status === "accepted";

	return (
		<div className="p-4">
			{/* Back link */}
			<Link
				href={`/${owner}/${repo}/prompts`}
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mb-4"
			>
				<ArrowLeft className="w-3 h-3" />
				Back to prompts
			</Link>

			{/* Title */}
			<div className="flex items-start gap-2 mb-4">
				<Sparkles className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
				<h1 className="text-base font-medium text-foreground leading-tight">
					{promptRequest.title}
				</h1>
			</div>

			{/* Two-column layout */}
			<div className="flex gap-6">
				{/* Left — Prompt body + actions */}
				<div className="flex-1 min-w-0 space-y-4">
					{/* Body */}
					<div className="border border-border rounded-lg p-4">
						<ClientMarkdown content={promptRequest.body} />
					</div>

					{/* Inline actions */}
					<div className="flex items-center gap-1.5">
						{isMaintainer && isOpen && (
							<>
								<button
									onClick={handleRunWithGhost}
									disabled={isAccepting}
									className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50"
								>
									{isAccepting ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Ghost className="w-3 h-3" />
									)}
									Run with Ghost
								</button>
								<button
									onClick={
										handleAcceptAndCopy
									}
									disabled={isAccepting}
									className={cn(
										"flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-all cursor-pointer disabled:opacity-50",
										copied
											? "bg-green-500/15 text-green-400 border-green-500/20"
											: "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
									)}
								>
									{copied ? (
										<>
											<Check className="w-3 h-3" />
											Copied
										</>
									) : (
										<>
											<Copy className="w-3 h-3" />
											Accept &amp;
											Copy
										</>
									)}
								</button>
							</>
						)}
						{(!isMaintainer || !isOpen) && (
							<button
								onClick={handleCopy}
								className={cn(
									"flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-all cursor-pointer",
									copied
										? "bg-green-500/15 text-green-400 border-green-500/20"
										: "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
								)}
							>
								{copied ? (
									<>
										<Check className="w-3 h-3" />
										Copied
									</>
								) : (
									<>
										<Copy className="w-3 h-3" />
										Copy
									</>
								)}
							</button>
						)}
						<div className="flex-1" />
						{canManage && (
							<>
								{isOpen || isAccepted ? (
									<button
										onClick={
											handleClose
										}
										disabled={isClosing}
										className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50 cursor-pointer"
									>
										{isClosing ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<X className="w-3 h-3" />
										)}
										Close
									</button>
								) : (
									<button
										onClick={
											handleReopen
										}
										disabled={
											isReopening
										}
										className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground rounded-md hover:bg-muted/50 transition-colors disabled:opacity-50 cursor-pointer"
									>
										{isReopening ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<RotateCcw className="w-3 h-3" />
										)}
										Reopen
									</button>
								)}
								<button
									onClick={handleDelete}
									disabled={isDeleting}
									className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-red-400/60 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50 cursor-pointer"
								>
									{isDeleting ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Trash2 className="w-3 h-3" />
									)}
								</button>
							</>
						)}
					</div>

					{/* Comments */}
					<div className="space-y-3 pt-2">
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 font-mono">
							<MessageSquare className="w-3 h-3" />
							{optimisticComments.length} comment
							{optimisticComments.length !== 1 ? "s" : ""}
						</div>

						{optimisticComments.length > 0 && (
							<div className="space-y-2">
								{optimisticComments.map(
									(comment) => (
										<div
											key={
												comment.id
											}
											className={cn(
												"border border-border/60 rounded-lg p-3 space-y-1.5",
												comment.id.startsWith(
													"optimistic-",
												) &&
													"opacity-60",
											)}
										>
											<div className="flex items-center gap-2">
												{comment.userAvatarUrl ? (
													<Image
														src={
															comment.userAvatarUrl
														}
														alt={
															comment.userName
														}
														width={
															18
														}
														height={
															18
														}
														className="rounded-full"
													/>
												) : (
													<div className="w-[18px] h-[18px] rounded-full bg-muted" />
												)}
												{comment.userLogin ? (
													<Link
														href={`/users/${comment.userLogin}`}
														className="text-[11px] font-medium text-foreground hover:underline"
													>
														{
															comment.userName
														}
													</Link>
												) : (
													<span className="text-[11px] font-medium text-foreground">
														{
															comment.userName
														}
													</span>
												)}
												<span className="text-[10px] text-muted-foreground/40 font-mono">
													<TimeAgo
														date={
															comment.createdAt
														}
													/>
												</span>
												<div className="flex-1" />
												{currentUser?.id ===
													comment.userId &&
													!comment.id.startsWith(
														"optimistic-",
													) && (
														<button
															onClick={() =>
																handleDeleteComment(
																	comment.id,
																)
															}
															className="text-muted-foreground/20 hover:text-red-400 transition-colors cursor-pointer"
															title="Delete comment"
														>
															<Trash2 className="w-2.5 h-2.5" />
														</button>
													)}
											</div>
											<div className="pl-[26px]">
												<ClientMarkdown
													content={
														comment.body
													}
												/>
											</div>
										</div>
									),
								)}
							</div>
						)}

						{currentUser && (
							<div className="space-y-1.5">
								<MarkdownEditor
									value={commentBody}
									onChange={setCommentBody}
									placeholder="Leave a comment..."
									compact
									rows={2}
									onKeyDown={(e) => {
										if (
											e.key ===
												"Enter" &&
											(e.metaKey ||
												e.ctrlKey)
										) {
											e.preventDefault();
											handleAddComment();
										}
									}}
								/>
								<div className="flex justify-end">
									<button
										onClick={
											handleAddComment
										}
										disabled={
											!commentBody.trim() ||
											isSubmittingComment
										}
										className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-foreground text-background rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
									>
										{isSubmittingComment ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<Send className="w-3 h-3" />
										)}
										Comment
									</button>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Right — Metadata sidebar */}
				<div className="hidden md:block w-56 shrink-0 space-y-4">
					{/* Author */}
					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Author
						</p>
						<div className="flex items-center gap-2">
							{promptRequest.userAvatarUrl ? (
								<Image
									src={
										promptRequest.userAvatarUrl
									}
									alt={
										promptRequest.userName ??
										"User"
									}
									width={20}
									height={20}
									className="rounded-full"
								/>
							) : (
								<div className="w-5 h-5 rounded-full bg-muted" />
							)}
							{promptRequest.userLogin ? (
								<Link
									href={`/users/${promptRequest.userLogin}`}
									className="text-[11px] font-medium text-foreground hover:underline"
								>
									{promptRequest.userName ??
										promptRequest.userLogin}
								</Link>
							) : (
								<span className="text-[11px] font-medium text-muted-foreground/60">
									{promptRequest.userName ??
										"Unknown"}
								</span>
							)}
						</div>
					</div>

					<div className="h-px bg-border/30" />

					{/* Status */}
					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Status
						</p>
						<span
							className={cn(
								"inline-flex text-[11px] font-mono px-2 py-0.5 rounded-full",
								statusColors[promptRequest.status],
							)}
						>
							{statusLabels[promptRequest.status]}
						</span>
					</div>

					{isAccepted && promptRequest.acceptedByName && (
						<>
							<div className="h-px bg-border/30" />
							<div className="space-y-1.5">
								<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
									Accepted by
								</p>
								<p className="text-[11px] text-blue-400 font-mono">
									{
										promptRequest.acceptedByName
									}
								</p>
							</div>
						</>
					)}

					<div className="h-px bg-border/30" />

					{/* Created */}
					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Created
						</p>
						<p className="text-[11px] text-muted-foreground/70 font-mono">
							<TimeAgo date={promptRequest.createdAt} />
						</p>
					</div>

					{promptRequest.updatedAt !== promptRequest.createdAt && (
						<>
							<div className="h-px bg-border/30" />
							<div className="space-y-1.5">
								<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
									Updated
								</p>
								<p className="text-[11px] text-muted-foreground/70 font-mono">
									<TimeAgo
										date={
											promptRequest.updatedAt
										}
									/>
								</p>
							</div>
						</>
					)}

					<div className="h-px bg-border/30" />

					{/* Prompt ID */}
					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							ID
						</p>
						<p className="text-[10px] text-muted-foreground/50 font-mono break-all">
							{promptRequest.id}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
