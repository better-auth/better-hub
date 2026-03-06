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
	Send,
	RefreshCw,
	User,
	Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { TimeAgo } from "@/components/ui/time-ago";
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

					<div className="space-y-3 pt-4">
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
												"border border-border/60 rounded-md p-3 space-y-1.5",
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
												{comment.updatedAt !==
													comment.createdAt && (
													<span className="text-[10px] text-muted-foreground/30">
														(edited)
													</span>
												)}
												<div className="flex-1" />
												{currentUser?.id ===
													comment.userId &&
													!comment.id.startsWith(
														"optimistic-",
													) && (
														<div className="flex items-center gap-0.5">
															{editingCommentId !==
																comment.id && (
																<button
																	onClick={() =>
																		handleStartEdit(
																			comment,
																		)
																	}
																	className="text-muted-foreground/20 hover:text-foreground transition-colors cursor-pointer"
																	title="Edit comment"
																>
																	<Pencil className="w-2.5 h-2.5" />
																</button>
															)}
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
														</div>
													)}
											</div>
											{editingCommentId ===
											comment.id ? (
												<div className="pl-[26px] space-y-2">
													<textarea
														value={
															editingCommentBody
														}
														onChange={(
															e,
														) =>
															setEditingCommentBody(
																e
																	.target
																	.value,
															)
														}
														className="w-full min-h-[80px] p-2 text-sm bg-muted/30 border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
														autoFocus
													/>
													<div className="flex items-center justify-between">
														<span
															className={cn(
																"text-xs",
																editingCommentBody.trim()
																	.length >
																	10000
																	? "text-red-400"
																	: "text-muted-foreground/50",
															)}
														>
															{
																editingCommentBody.trim()
																	.length
															}
															/10000
														</span>
														<div className="flex items-center gap-2">
															<button
																onClick={
																	handleCancelEdit
																}
																className="text-xs px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors rounded"
															>
																Cancel
															</button>
															<button
																onClick={
																	handleSaveEdit
																}
																disabled={
																	!editingCommentBody.trim() ||
																	editingCommentBody.trim()
																		.length >
																		10000 ||
																	isSubmittingComment
																}
																className={cn(
																	"text-xs px-2.5 py-1 bg-primary text-primary-foreground rounded",
																	"disabled:opacity-50 disabled:cursor-not-allowed",
																	"hover:bg-primary/90 transition-colors",
																)}
															>
																{isSubmittingComment
																	? "Saving..."
																	: "Save"}
															</button>
														</div>
													</div>
												</div>
											) : (
												<div className="pl-[26px]">
													<ClientMarkdown
														content={
															comment.body
														}
													/>
												</div>
											)}
										</div>
									),
								)}
							</div>
						)}

						{currentUser && (
							<div className="space-y-1.5 rounded-md border">
								<MarkdownEditor
									value={commentBody}
									onChange={setCommentBody}
									placeholder="Leave a comment..."
									rows={4}
									className="border-none"
									resizeYIndicator={false}
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
								<div className="flex justify-end mb-3 pr-3">
									<button
										onClick={
											handleAddComment
										}
										disabled={
											!commentBody.trim() ||
											isSubmittingComment
										}
										className={cn(
											"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
											"border border-border",
											"text-foreground/80 hover:text-foreground hover:bg-muted/50",
											"transition-colors cursor-pointer",
											"disabled:opacity-40 disabled:cursor-not-allowed",
										)}
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
