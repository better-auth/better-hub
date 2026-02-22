"use client";

import { useState, useEffect, useRef, useTransition, useOptimistic } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
	ArrowLeft,
	ArrowRight,
	GitPullRequest,
	Sparkles,
	Check,
	X,
	Trash2,
	Loader2,
	AlertCircle,
	Ghost,
	MessageSquare,
	Send,
} from "lucide-react";
import { cn, getErrorMessage } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { TimeAgo } from "@/components/ui/time-ago";
import { useGlobalChat } from "@/components/shared/global-chat-provider";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import {
	acceptPromptRequest,
	rejectPromptRequest,
	resetPromptRequest,
	deletePromptRequestAction,
	linkGhostTab,
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
	processing: "bg-yellow-500/15 text-yellow-400",
	completed: "bg-purple-500/15 text-purple-400",
	rejected: "bg-red-500/15 text-red-400",
};

const statusLabels: Record<PromptRequestStatus, string> = {
	open: "Open",
	processing: "Processing",
	completed: "Completed",
	rejected: "Rejected",
};

const PROCESSING_PHRASES = [
	"Haunting the codebase",
	"Phasing through files",
	"Summoning changes",
	"Channeling commits",
	"Conjuring a branch",
	"Whispering to the sandbox",
];

interface PromptDetailProps {
	owner: string;
	repo: string;
	promptRequest: PromptRequest;
	comments: PromptRequestComment[];
	currentUser: { id: string; name: string; image: string } | null;
}

export function PromptDetail({
	owner,
	repo,
	promptRequest,
	comments,
	currentUser,
}: PromptDetailProps) {
	const router = useRouter();
	const {
		openChat,
		addTab,
		switchTab,
		tabState,
		state: chatState,
		setWorkingSource,
	} = useGlobalChat();
	const { emit } = useMutationEvents();
	const [isAccepting, setIsAccepting] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(promptRequest.errorMessage);
	const [justCompleted, setJustCompleted] = useState(false);
	const prevStatusRef = useRef(promptRequest.status);
	// Track the linked ghost tab ID locally (server prop can be stale)
	const linkedTabIdRef = useRef<string | null>(promptRequest.ghostTabId);
	// Keep ref in sync when server prop updates (e.g. after polling refresh)
	useEffect(() => {
		if (promptRequest.ghostTabId) linkedTabIdRef.current = promptRequest.ghostTabId;
	}, [promptRequest.ghostTabId]);

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

	// Poll for status changes while processing
	const isProcessing = promptRequest.status === "processing";
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Signal to global context that a prompt is being processed (drives Ghost icon animation)
	useEffect(() => {
		setWorkingSource("prompt-processing", isProcessing);
		return () => setWorkingSource("prompt-processing", false);
	}, [isProcessing, setWorkingSource]);

	useEffect(() => {
		if (isProcessing) {
			pollRef.current = setInterval(() => {
				router.refresh();
			}, 5000);
		}
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, [isProcessing, router]);

	// Detect transition from processing → completed and auto-navigate to PR
	useEffect(() => {
		if (
			prevStatusRef.current === "processing" &&
			promptRequest.status === "completed" &&
			promptRequest.prNumber
		) {
			setJustCompleted(true);
			const timer = setTimeout(() => {
				router.push(`/${owner}/${repo}/pulls/${promptRequest.prNumber}`);
			}, 3000);
			return () => clearTimeout(timer);
		}
		prevStatusRef.current = promptRequest.status;
	}, [promptRequest.status, promptRequest.prNumber, owner, repo, router]);

	// Animated processing phrase
	const [phraseIdx, setPhraseIdx] = useState(() =>
		Math.floor(Math.random() * PROCESSING_PHRASES.length),
	);
	useEffect(() => {
		if (!isProcessing) return;
		const interval = setInterval(() => {
			setPhraseIdx((i) => (i + 1) % PROCESSING_PHRASES.length);
		}, 3000);
		return () => clearInterval(interval);
	}, [isProcessing]);

	const chatConfig = {
		chatType: "general" as const,
		contextKey: `${owner}/${repo}`,
		contextBody: {},
		placeholder: "Chat with Ghost about this prompt...",
		emptyTitle: `Prompt: ${promptRequest.title}`,
		emptyDescription: "Ghost will process this prompt request.",
	};

	const openGhostWithPrompt = () => {
		const existingTabId = linkedTabIdRef.current;
		const tabExists =
			existingTabId && tabState.tabs.some((t) => t.id === existingTabId);

		if (tabExists) {
			// Switch to the existing tab that's already running this prompt
			switchTab(existingTabId);
			openChat(chatConfig);
			return;
		}

		// Create a new tab and link it to this prompt request
		const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		linkedTabIdRef.current = tabId;
		addTab(`Prompt · ${repo}`, tabId);
		linkGhostTab(promptRequest.id, tabId);
		openChat(chatConfig);
		// Auto-send the prompt after Ghost panel mounts
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("ghost-auto-send", {
					detail: {
						message: `Process this prompt request and create a PR for ${owner}/${repo}:\n\n**${promptRequest.title}**\n\n${promptRequest.body}\n\nPrompt Request ID: ${promptRequest.id}\n\nAfter creating the PR, call completePromptRequest with the prompt request ID and PR number.`,
					},
				}),
			);
		}, 800);
	};

	const handleAccept = async () => {
		setIsAccepting(true);
		try {
			await acceptPromptRequest(promptRequest.id);
			emit({ type: "prompt:accepted", owner, repo });
			router.refresh();
			openGhostWithPrompt();
		} catch (e: unknown) {
			setError(getErrorMessage(e) || "Failed to accept");
			setIsAccepting(false);
		}
	};

	const handleReset = async () => {
		setIsResetting(true);
		try {
			await resetPromptRequest(promptRequest.id);
			emit({ type: "prompt:reset", owner, repo });
			setError(null);
			router.refresh();
		} catch {
			setIsResetting(false);
		}
	};

	const handleReject = async () => {
		setIsRejecting(true);
		try {
			await rejectPromptRequest(promptRequest.id);
			emit({ type: "prompt:rejected", owner, repo });
			router.refresh();
		} catch {
			setIsRejecting(false);
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

	const isOpen = promptRequest.status === "open";
	const isCompleted = promptRequest.status === "completed";

	return (
		<div className="p-4 space-y-6 max-w-3xl">
			{/* Back link */}
			<Link
				href={`/${owner}/${repo}/prompts`}
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
			>
				<ArrowLeft className="w-3 h-3" />
				Back to prompts
			</Link>

			{/* Just-completed banner — auto-navigates to PR */}
			{justCompleted && promptRequest.prNumber && (
				<div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-500/10 border border-purple-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
					<Check className="w-4 h-4 text-purple-400 shrink-0" />
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-purple-300">
							PR #{promptRequest.prNumber} created
						</p>
						<p className="text-[11px] text-purple-400/60 font-mono mt-0.5">
							Redirecting to pull request...
						</p>
					</div>
					<Link
						href={`/${owner}/${repo}/pulls/${promptRequest.prNumber}`}
						className="flex items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
					>
						View PR
						<ArrowRight className="w-3 h-3" />
					</Link>
				</div>
			)}

			{/* Header */}
			<div className="space-y-3">
				<div className="flex items-start gap-3">
					<Sparkles className="w-5 h-5 text-muted-foreground/40 mt-0.5 shrink-0" />
					<div className="flex-1 min-w-0">
						<h1 className="text-lg font-medium text-foreground leading-tight">
							{promptRequest.title}
						</h1>
						<div className="flex items-center gap-3 mt-2">
							<span
								className={cn(
									"text-[11px] font-mono px-2 py-0.5 rounded-full",
									statusColors[
										promptRequest.status
									],
								)}
							>
								{statusLabels[promptRequest.status]}
							</span>
							<span className="text-[11px] text-muted-foreground/50 font-mono">
								Created{" "}
								<TimeAgo
									date={
										promptRequest.createdAt
									}
								/>
							</span>
							{promptRequest.updatedAt !==
								promptRequest.createdAt && (
								<span className="text-[11px] text-muted-foreground/40 font-mono">
									Updated{" "}
									<TimeAgo
										date={
											promptRequest.updatedAt
										}
									/>
								</span>
							)}
						</div>
					</div>
				</div>

				{/* Linked PR — prominent when completed */}
				{promptRequest.prNumber && !justCompleted && (
					<Link
						href={`/${owner}/${repo}/pulls/${promptRequest.prNumber}`}
						className={cn(
							"inline-flex items-center gap-2 rounded-md transition-colors",
							isCompleted
								? "px-4 py-2.5 text-sm font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/15"
								: "px-3 py-1.5 text-xs font-mono text-purple-400 bg-purple-500/10 hover:bg-purple-500/15",
						)}
					>
						<GitPullRequest
							className={cn(
								isCompleted
									? "w-4 h-4"
									: "w-3.5 h-3.5",
							)}
						/>
						{isCompleted ? (
							<>
								Completed — View Pull Request #
								{promptRequest.prNumber}
								<ArrowRight className="w-3.5 h-3.5 ml-1" />
							</>
						) : (
							<>Pull Request #{promptRequest.prNumber}</>
						)}
					</Link>
				)}
			</div>

			{/* Processing state */}
			{isProcessing && (
				<div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
					<div className="flex items-center gap-3">
						<div className="ghost-thinking-float">
							<Ghost className="w-5 h-5 text-yellow-400/70" />
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-yellow-300/90">
								Ghost is working on this
							</p>
							<p className="text-[11px] font-mono text-yellow-400/50 mt-0.5 transition-all duration-300">
								{promptRequest.progress ||
									`${PROCESSING_PHRASES[phraseIdx]}...`}
							</p>
						</div>
						<div className="flex items-center gap-1.5">
							{(!chatState.isOpen ||
								tabState.activeTabId !==
									linkedTabIdRef.current) && (
								<button
									onClick={
										openGhostWithPrompt
									}
									className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-yellow-500/10 text-yellow-400/70 rounded-md hover:bg-yellow-500/15 hover:text-yellow-400 transition-colors cursor-pointer"
								>
									<Ghost className="w-3 h-3" />
									{chatState.isOpen
										? "Show Ghost"
										: "Open Ghost"}
								</button>
							)}
							<button
								onClick={handleReset}
								disabled={isResetting}
								className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-red-500/10 text-red-400/70 rounded-md hover:bg-red-500/15 hover:text-red-400 transition-colors disabled:opacity-50 cursor-pointer"
								title="Cancel processing"
							>
								{isResetting ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									<X className="w-3 h-3" />
								)}
								Cancel
							</button>
						</div>
					</div>
					<p className="text-[10px] text-yellow-400/30 font-mono mt-3">
						This prompt is locked while Ghost processes it.
						Other users cannot accept it.
					</p>
				</div>
			)}

			{/* Error message */}
			{(error || promptRequest.errorMessage) && !isProcessing && (
				<div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20">
					<AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
					<p className="text-xs text-red-400/90 font-mono leading-relaxed">
						{error || promptRequest.errorMessage}
					</p>
				</div>
			)}

			{/* Body */}
			<div className="border border-border rounded-lg p-4">
				<ClientMarkdown content={promptRequest.body} />
			</div>

			{/* Comments */}
			<div className="space-y-4">
				<div className="flex items-center gap-2 text-xs text-muted-foreground/60 font-mono">
					<MessageSquare className="w-3.5 h-3.5" />
					{optimisticComments.length} comment
					{optimisticComments.length !== 1 ? "s" : ""}
				</div>

				{optimisticComments.length > 0 && (
					<div className="space-y-3">
						{optimisticComments.map((comment) => (
							<div
								key={comment.id}
								className={cn(
									"border border-border rounded-lg p-3 space-y-2",
									comment.id.startsWith(
										"optimistic-",
									) && "opacity-60",
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
											width={20}
											height={20}
											className="rounded-full"
										/>
									) : (
										<div className="w-5 h-5 rounded-full bg-muted" />
									)}
									<span className="text-xs font-medium text-foreground">
										{comment.userName}
									</span>
									<span className="text-[11px] text-muted-foreground/50 font-mono">
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
												className="text-muted-foreground/30 hover:text-red-400 transition-colors cursor-pointer"
												title="Delete comment"
											>
												<Trash2 className="w-3 h-3" />
											</button>
										)}
								</div>
								<div className="pl-7">
									<ClientMarkdown
										content={
											comment.body
										}
									/>
								</div>
							</div>
						))}
					</div>
				)}

				{currentUser && (
					<div className="space-y-2">
						<MarkdownEditor
							value={commentBody}
							onChange={setCommentBody}
							placeholder="Leave a comment..."
							compact
							rows={3}
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
						<div className="flex justify-end">
							<button
								onClick={handleAddComment}
								disabled={
									!commentBody.trim() ||
									isSubmittingComment
								}
								className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
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

			{/* Actions */}
			<div className="flex items-center gap-2 pt-2">
				{isOpen && (
					<>
						<button
							onClick={handleAccept}
							disabled={isAccepting}
							className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors disabled:opacity-50 cursor-pointer"
						>
							{isAccepting ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
							) : (
								<Check className="w-3.5 h-3.5" />
							)}
							Accept & Process
						</button>
						<button
							onClick={handleReject}
							disabled={isRejecting}
							className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50 cursor-pointer"
						>
							{isRejecting ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
							) : (
								<X className="w-3.5 h-3.5" />
							)}
							Reject
						</button>
					</>
				)}
				<div className="flex-1" />
				{!isProcessing && (
					<button
						onClick={handleDelete}
						disabled={isDeleting}
						className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50 cursor-pointer"
					>
						{isDeleting ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<Trash2 className="w-3 h-3" />
						)}
						Delete
					</button>
				)}
			</div>
		</div>
	);
}
