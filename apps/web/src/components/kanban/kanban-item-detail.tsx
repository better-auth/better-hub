"use client";

import { useState, useTransition, useOptimistic, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
	ArrowLeft,
	ExternalLink,
	Trash2,
	Loader2,
	MessageSquare,
	RefreshCw,
	User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { UserTooltip } from "@/components/shared/user-tooltip";
import { TimeAgo } from "@/components/ui/time-ago";
import { KanbanCommentCard } from "./kanban-comment-card";
import { KanbanCommentInput } from "./kanban-comment-input";
import { KanbanIssueComments } from "./kanban-issue-comments";
import type { KanbanItem, KanbanComment, KanbanStatus } from "@/lib/kanban-store";
import {
	moveKanbanItem,
	removeKanbanItem,
	syncKanbanItemFromGitHub,
	addKanbanComment,
	deleteKanbanComment,
	updateKanbanComment,
	assignKanbanItemToSelf,
} from "@/app/(app)/repos/[owner]/[repo]/kanban/actions";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const STATUS_OPTIONS: { value: KanbanStatus; label: string; color: string }[] = [
	{ value: "backlog", label: "Backlog", color: "bg-gray-500/15 text-gray-400" },
	{ value: "todo", label: "To Do", color: "bg-blue-500/15 text-blue-400" },
	{ value: "in-progress", label: "In Progress", color: "bg-yellow-500/15 text-yellow-400" },
	{ value: "in-review", label: "In Review", color: "bg-purple-500/15 text-purple-400" },
	{ value: "done", label: "Done", color: "bg-green-500/15 text-green-400" },
];

interface KanbanItemDetailProps {
	owner: string;
	repo: string;
	item: KanbanItem;
	comments: KanbanComment[];
	currentUser: { id: string; login: string | null; name: string; image: string } | null;
}

export function KanbanItemDetail({
	owner,
	repo,
	item,
	comments,
	currentUser,
}: KanbanItemDetailProps) {
	const router = useRouter();
	const containerRef = useRef<HTMLDivElement>(null);
	const commentInputRef = useRef<HTMLTextAreaElement>(null);
	const [currentStatus, setCurrentStatus] = useState<KanbanStatus>(item.status);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [commentBody, setCommentBody] = useState("");
	const [isSubmittingComment, startCommentTransition] = useTransition();
	const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
	const [editingCommentBody, setEditingCommentBody] = useState("");
	const [optimisticComments, addOptimisticComment] = useOptimistic(
		comments,
		(
			state: KanbanComment[],
			action:
				| { type: "add"; comment: KanbanComment }
				| { type: "delete"; id: string }
				| { type: "update"; id: string; body: string },
		) => {
			if (action.type === "add") return [...state, action.comment];
			if (action.type === "delete")
				return state.filter((c) => c.id !== action.id);
			if (action.type === "update") {
				return state.map((c) =>
					c.id === action.id
						? {
								...c,
								body: action.body,
								updatedAt: new Date().toISOString(),
							}
						: c,
				);
			}
			return state;
		},
	);

	const handleStatusChange = useCallback(
		async (newStatus: KanbanStatus) => {
			setCurrentStatus(newStatus);
			try {
				await moveKanbanItem(item.id, newStatus);
				router.refresh();
			} catch {
				setCurrentStatus(item.status);
			}
		},
		[item.id, item.status, router],
	);

	const handleSync = useCallback(async () => {
		setIsSyncing(true);
		try {
			await syncKanbanItemFromGitHub(item.id);
			router.refresh();
		} catch {
			// Ignore errors
		}
		setIsSyncing(false);
	}, [item.id, router]);

	const handleDelete = useCallback(async () => {
		if (!confirm("Remove this issue from the kanban board?")) return;
		setIsDeleting(true);
		try {
			await removeKanbanItem(item.id);
			router.push(`/${owner}/${repo}/kanban`);
		} catch {
			setIsDeleting(false);
		}
	}, [item.id, owner, repo, router]);

	const handleAssignToSelf = useCallback(async () => {
		try {
			await assignKanbanItemToSelf(item.id);
			router.refresh();
		} catch {
			// Ignore errors
		}
	}, [item.id, router]);

	const handleAddComment = useCallback(() => {
		const body = commentBody.trim();
		if (!body || !currentUser) return;

		const optimisticId = `optimistic-${Date.now()}`;
		const optimistic: KanbanComment = {
			id: optimisticId,
			kanbanItemId: item.id,
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
				await addKanbanComment(item.id, body);
				addOptimisticComment({ type: "delete", id: optimisticId });
				router.refresh();
			} catch {
				addOptimisticComment({ type: "delete", id: optimisticId });
			}
		});
	}, [commentBody, currentUser, item.id, addOptimisticComment, router]);

	const handleDeleteComment = useCallback(
		(commentId: string) => {
			startCommentTransition(async () => {
				addOptimisticComment({ type: "delete", id: commentId });
				try {
					await deleteKanbanComment(commentId, item.id);
					router.refresh();
				} catch {
					// Revert will happen via server refresh
				}
			});
		},
		[item.id, addOptimisticComment, router],
	);

	const handleStartEdit = useCallback((comment: KanbanComment) => {
		setEditingCommentId(comment.id);
		setEditingCommentBody(comment.body);
	}, []);

	const handleCancelEdit = useCallback(() => {
		setEditingCommentId(null);
		setEditingCommentBody("");
	}, []);

	const handleSaveEdit = useCallback(() => {
		if (!editingCommentId) return;
		const trimmedBody = editingCommentBody.trim();
		if (!trimmedBody) return;
		if (trimmedBody.length > 10000) {
			alert("Comment is too long (max 10000 characters)");
			return;
		}

		const originalComment = comments.find((c) => c.id === editingCommentId);
		if (!originalComment) return;

		setEditingCommentId(null);
		setEditingCommentBody("");

		startCommentTransition(async () => {
			addOptimisticComment({
				type: "update",
				id: editingCommentId,
				body: trimmedBody,
			});
			try {
				await updateKanbanComment(editingCommentId, item.id, trimmedBody);
				router.refresh();
			} catch {
				// Revert will happen via server refresh
			}
		});
	}, [editingCommentId, editingCommentBody, comments, addOptimisticComment, item.id, router]);

	const statusOption =
		STATUS_OPTIONS.find((s) => s.value === currentStatus) ?? STATUS_OPTIONS[0];

	useHotkey(
		{ key: "C" },
		() => {
			commentInputRef.current?.focus();
		},
		{ target: containerRef, ignoreInputs: true },
	);

	useHotkey(
		"Escape",
		() => {
			router.push(`/${owner}/${repo}/kanban`);
		},
		{ target: containerRef, ignoreInputs: true },
	);

	useHotkey(
		{ key: "E" },
		() => {
			window.open(item.issueUrl, "_blank");
		},
		{ target: containerRef, ignoreInputs: true },
	);

	return (
		<div ref={containerRef} className="flex-1 min-h-0 flex flex-col" tabIndex={-1}>
			<Link
				href={`/${owner}/${repo}/kanban`}
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mb-4 w-fit"
			>
				<ArrowLeft className="w-3 h-3" />
				Back to board
			</Link>

			<div className="flex gap-6 flex-1 min-h-0">
				<div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
					<div className="flex items-start gap-2">
						<h1 className="text-base font-medium text-foreground leading-tight flex-1">
							{item.issueTitle}
						</h1>
						<a
							href={item.issueUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors shrink-0"
						>
							<ExternalLink className="w-4 h-4" />
						</a>
					</div>

					<div className="flex md:hidden items-center gap-2 min-w-0">
						{item.authorLogin ? (
							<UserTooltip
								username={item.authorLogin}
								side="bottom"
							>
								<Link
									href={`/users/${item.authorLogin}`}
									className="flex items-center gap-2 min-w-0 hover:text-foreground transition-colors"
								>
									{item.authorAvatar ? (
										<Image
											src={
												item.authorAvatar
											}
											alt={
												item.authorLogin
											}
											width={20}
											height={20}
											className="rounded-full shrink-0"
										/>
									) : (
										<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
											<User className="w-3 h-3 text-muted-foreground/40" />
										</div>
									)}
									<span className="text-[11px] text-muted-foreground/80 truncate hover:underline">
										{item.authorLogin}
									</span>
								</Link>
							</UserTooltip>
						) : (
							<>
								<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
									<User className="w-3 h-3 text-muted-foreground/40" />
								</div>
								<span className="text-[11px] text-muted-foreground/60">
									Unknown
								</span>
							</>
						)}
					</div>

					{item.aiSummary && (
						<div className="p-3 bg-muted/30 border border-border/50 rounded-md">
							<p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-1">
								AI Summary
							</p>
							<p className="text-sm text-foreground/80">
								{item.aiSummary}
							</p>
						</div>
					)}

					{item.issueBody && (
						<div className="border border-border/60 rounded-md p-4">
							<p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide mb-2">
								Issue Description
							</p>
							<div className="prose prose-sm dark:prose-invert max-w-none">
								<ClientMarkdown
									content={item.issueBody}
								/>
							</div>
						</div>
					)}

					{/* Issue Discussion */}
					<div className="pt-4 border-t border-border/50">
						<div className="border border-border rounded-lg overflow-hidden max-h-[500px]">
							<KanbanIssueComments
								owner={owner}
								repo={repo}
								issueNumber={item.issueNumber}
								issueUrl={item.issueUrl}
								currentUser={currentUser}
								variant="default"
							/>
						</div>
					</div>

					{/* Maintainer Discussion */}
					<div className="space-y-3 pt-4 border-t border-border/50">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 font-mono">
								<MessageSquare className="w-3 h-3 text-amber-500" />
								Maintainer Only (
								{optimisticComments.length})
							</div>
						</div>

						<p className="text-[10px] text-amber-500/60">
							These comments are only visible to
							repository maintainers
						</p>

						{optimisticComments.length > 0 && (
							<div className="space-y-2">
								{optimisticComments.map(
									(comment) => (
										<KanbanCommentCard
											key={
												comment.id
											}
											comment={
												comment
											}
											currentUserId={
												currentUser?.id
											}
											isEditing={
												editingCommentId ===
												comment.id
											}
											editingBody={
												editingCommentBody
											}
											onEditingBodyChange={
												setEditingCommentBody
											}
											onStartEdit={() =>
												handleStartEdit(
													comment,
												)
											}
											onCancelEdit={
												handleCancelEdit
											}
											onSaveEdit={
												handleSaveEdit
											}
											onDelete={() =>
												handleDeleteComment(
													comment.id,
												)
											}
											isSaving={
												isSubmittingComment
											}
											variant="compact"
										/>
									),
								)}
							</div>
						)}

						{currentUser && (
							<KanbanCommentInput
								value={commentBody}
								onChange={setCommentBody}
								onSubmit={handleAddComment}
								isSubmitting={isSubmittingComment}
								placeholder="Leave a comment for other maintainers..."
								rows={5}
								variant="default"
							/>
						)}
					</div>
				</div>

				<div className="hidden md:block w-56 shrink-0 space-y-4">
					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Status
						</p>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									className={cn(
										"inline-flex text-[11px] font-mono px-2 py-0.5 rounded-full cursor-pointer",
										statusOption.color,
									)}
								>
									{statusOption.label}
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								sideOffset={4}
								className="min-w-[140px]"
							>
								{STATUS_OPTIONS.map((option) => (
									<DropdownMenuItem
										key={option.value}
										onClick={() =>
											handleStatusChange(
												option.value,
											)
										}
										className={cn(
											"flex items-center text-xs",
											option.value ===
												currentStatus &&
												"bg-muted/50",
										)}
									>
										<span
											className={cn(
												"w-2 h-2 rounded-full mr-2",
												option.color.split(
													" ",
												)[0],
											)}
										/>
										{option.label}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<div className="h-px bg-border/30" />

					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Author
						</p>
						{item.authorLogin ? (
							<UserTooltip
								username={item.authorLogin}
								side="left"
							>
								<Link
									href={`/users/${item.authorLogin}`}
									className="flex items-center gap-2 min-w-0 rounded-md hover:bg-muted/50 -mx-1 px-1 py-0.5 transition-colors"
								>
									{item.authorAvatar ? (
										<Image
											src={
												item.authorAvatar
											}
											alt={
												item.authorLogin
											}
											width={20}
											height={20}
											className="rounded-full shrink-0"
										/>
									) : (
										<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
											<User className="w-3 h-3 text-muted-foreground/40" />
										</div>
									)}
									<span className="text-[11px] font-medium text-foreground truncate hover:underline min-w-0">
										{item.authorLogin}
									</span>
								</Link>
							</UserTooltip>
						) : (
							<div className="flex items-center gap-2 min-w-0">
								<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
									<User className="w-3 h-3 text-muted-foreground/40" />
								</div>
								<span className="text-[11px] text-muted-foreground">
									Unknown
								</span>
							</div>
						)}
					</div>

					<div className="h-px bg-border/30" />

					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Assignee
						</p>
						<div className="flex items-center gap-2">
							{(item.kanbanAssigneeAvatar ??
							item.assigneeAvatar) ? (
								<Image
									src={
										(item.kanbanAssigneeAvatar ??
											item.assigneeAvatar)!
									}
									alt={
										item.kanbanAssigneeLogin ??
										item.assigneeLogin ??
										""
									}
									width={20}
									height={20}
									className="rounded-full"
								/>
							) : (
								<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
									<User className="w-3 h-3 text-muted-foreground/40" />
								</div>
							)}
							<span className="text-[11px] font-medium text-foreground">
								{item.kanbanAssigneeLogin ??
									item.assigneeLogin ??
									"Unassigned"}
							</span>
						</div>
						{currentUser && (
							<button
								onClick={handleAssignToSelf}
								className="text-[10px] text-primary hover:underline"
							>
								Assign to me
							</button>
						)}
					</div>

					<div className="h-px bg-border/30" />

					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Issue
						</p>
						<p className="text-[11px] text-muted-foreground/70 font-mono">
							#{item.issueNumber}
						</p>
					</div>

					<div className="h-px bg-border/30" />

					<div className="space-y-1.5">
						<p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
							Added
						</p>
						<p className="text-[11px] text-muted-foreground/70 font-mono">
							<TimeAgo date={item.createdAt} />
						</p>
					</div>

					<div className="h-px bg-border/30" />

					<div className="space-y-2">
						<button
							onClick={handleSync}
							disabled={isSyncing}
							className={cn(
								"flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px]",
								"text-muted-foreground/60 hover:text-foreground",
								"hover:bg-muted/50 rounded-md transition-colors",
								"disabled:opacity-50",
							)}
						>
							{isSyncing ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<RefreshCw className="w-3 h-3" />
							)}
							Sync from GitHub
						</button>

						<button
							onClick={handleDelete}
							disabled={isDeleting}
							className={cn(
								"flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px]",
								"text-red-400/60 hover:text-red-400",
								"hover:bg-red-500/10 rounded-md transition-colors",
								"disabled:opacity-50",
							)}
						>
							{isDeleting ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<Trash2 className="w-3 h-3" />
							)}
							Remove from board
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
