"use client";

import { useState, useTransition, useOptimistic, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
	ExternalLink,
	Trash2,
	Loader2,
	MessageSquare,
	Send,
	RefreshCw,
	User,
	Maximize2,
	Calendar,
	GitBranch,
	Clock,
	CircleDot,
	Hash,
	Sparkles,
	ChevronDown,
	Check,
	Search,
	UserX,
	Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { TimeAgo } from "@/components/ui/time-ago";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { KanbanItem, KanbanComment, KanbanStatus } from "@/lib/kanban-store";
import {
	moveKanbanItem,
	removeKanbanItem,
	syncKanbanItemFromGitHub,
	addKanbanComment,
	deleteKanbanComment,
	updateKanbanComment,
	setKanbanItemAssignee,
	fetchRepoCollaborators,
} from "@/app/(app)/repos/[owner]/[repo]/kanban/actions";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

type Collaborator = { login: string; avatar: string; name: string };

const STATUS_OPTIONS: { value: KanbanStatus; label: string; color: string }[] = [
	{ value: "backlog", label: "Backlog", color: "bg-gray-500/15 text-gray-400" },
	{ value: "todo", label: "To Do", color: "bg-blue-500/15 text-blue-400" },
	{ value: "in-progress", label: "In Progress", color: "bg-yellow-500/15 text-yellow-400" },
	{ value: "in-review", label: "In Review", color: "bg-purple-500/15 text-purple-400" },
	{ value: "done", label: "Done", color: "bg-green-500/15 text-green-400" },
];

interface KanbanItemSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	owner: string;
	repo: string;
	item: KanbanItem | null;
	currentUser: { id: string; login: string | null; name: string; image: string } | null;
	onItemUpdated?: (item: KanbanItem) => void;
	onItemDeleted?: (itemId: string) => void;
}

export function KanbanItemSheet({
	open,
	onOpenChange,
	owner,
	repo,
	item,
	currentUser,
	onItemUpdated,
	onItemDeleted,
}: KanbanItemSheetProps) {
	const router = useRouter();
	const containerRef = useRef<HTMLDivElement>(null);
	const commentInputRef = useRef<HTMLTextAreaElement>(null);
	const [currentStatus, setCurrentStatus] = useState<KanbanStatus>(item?.status ?? "backlog");
	const [isSyncing, setIsSyncing] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [commentBody, setCommentBody] = useState("");
	const [comments, setComments] = useState<KanbanComment[]>([]);
	const [isLoadingComments, setIsLoadingComments] = useState(false);
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

	const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
	const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
	const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
	const [assigneeSearch, setAssigneeSearch] = useState("");
	const [isAssigning, setIsAssigning] = useState(false);

	useEffect(() => {
		if (item) {
			setCurrentStatus(item.status);
		}
	}, [item]);

	useEffect(() => {
		if (open && item) {
			setIsLoadingComments(true);
			fetch(`/api/kanban/${item.id}/comments`)
				.then((res) => res.json())
				.then((data) => setComments(data.comments ?? []))
				.catch(() => setComments([]))
				.finally(() => setIsLoadingComments(false));
		} else {
			setComments([]);
		}
	}, [open, item?.id]);

	const handleStatusChange = useCallback(
		async (newStatus: KanbanStatus) => {
			if (!item) return;
			setCurrentStatus(newStatus);
			try {
				await moveKanbanItem(item.id, newStatus);
				onItemUpdated?.({ ...item, status: newStatus });
				router.refresh();
			} catch {
				setCurrentStatus(item.status);
			}
		},
		[item, onItemUpdated, router],
	);

	const handleSync = useCallback(async () => {
		if (!item) return;
		setIsSyncing(true);
		try {
			await syncKanbanItemFromGitHub(item.id);
			router.refresh();
		} catch {
			// Ignore errors
		}
		setIsSyncing(false);
	}, [item, router]);

	const handleDelete = useCallback(async () => {
		if (!item) return;
		if (!confirm("Remove this issue from the kanban board?")) return;
		setIsDeleting(true);
		try {
			await removeKanbanItem(item.id);
			onItemDeleted?.(item.id);
			onOpenChange(false);
		} catch {
			setIsDeleting(false);
		}
	}, [item, onItemDeleted, onOpenChange]);

	useEffect(() => {
		if (assigneePopoverOpen && collaborators.length === 0) {
			setIsLoadingCollaborators(true);
			fetchRepoCollaborators(owner, repo)
				.then(setCollaborators)
				.catch(() => setCollaborators([]))
				.finally(() => setIsLoadingCollaborators(false));
		}
	}, [assigneePopoverOpen, collaborators.length, owner, repo]);

	const handleAssignee = useCallback(
		async (login: string | null, avatar: string | null) => {
			if (!item) return;
			setIsAssigning(true);
			try {
				await setKanbanItemAssignee(item.id, login, avatar);
				onItemUpdated?.({
					...item,
					kanbanAssigneeLogin: login,
					kanbanAssigneeAvatar: avatar,
				});
				router.refresh();
			} catch {
				// Ignore errors
			}
			setIsAssigning(false);
			setAssigneePopoverOpen(false);
			setAssigneeSearch("");
		},
		[item, onItemUpdated, router],
	);

	const handleAddComment = useCallback(() => {
		const body = commentBody.trim();
		if (!body || !currentUser || !item) return;

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
				const res = await fetch(`/api/kanban/${item.id}/comments`);
				const data = await res.json();
				setComments(data.comments ?? []);
			} catch {
				addOptimisticComment({ type: "delete", id: optimisticId });
			}
		});
	}, [commentBody, currentUser, item, addOptimisticComment]);

	const handleDeleteComment = useCallback(
		(commentId: string) => {
			if (!item) return;
			startCommentTransition(async () => {
				addOptimisticComment({ type: "delete", id: commentId });
				try {
					await deleteKanbanComment(commentId, item.id);
					const res = await fetch(`/api/kanban/${item.id}/comments`);
					const data = await res.json();
					setComments(data.comments ?? []);
				} catch {
					// Revert will happen via server refresh
				}
			});
		},
		[item, addOptimisticComment],
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
		if (!item || !editingCommentId) return;
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
				const res = await fetch(`/api/kanban/${item.id}/comments`);
				const data = await res.json();
				setComments(data.comments ?? []);
			} catch {
				// Revert will happen via server refresh
			}
		});
	}, [item, editingCommentId, editingCommentBody, comments, addOptimisticComment]);

	const handleOpenFullView = useCallback(() => {
		if (!item) return;
		router.push(`/${owner}/${repo}/kanban/${item.id}`);
	}, [item, owner, repo, router]);

	const statusOption =
		STATUS_OPTIONS.find((s) => s.value === currentStatus) ?? STATUS_OPTIONS[0];

	useHotkey(
		{ key: "C" },
		() => {
			commentInputRef.current?.focus();
		},
		{ target: containerRef, ignoreInputs: true, enabled: open },
	);

	useHotkey(
		"Escape",
		() => {
			onOpenChange(false);
		},
		{ target: containerRef, ignoreInputs: true, enabled: open },
	);

	useHotkey(
		{ key: "E" },
		() => {
			if (item) window.open(item.issueUrl, "_blank");
		},
		{ target: containerRef, ignoreInputs: true, enabled: open },
	);

	if (!item) return null;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				ref={containerRef}
				side="right"
				className="w-full sm:max-w-4xl lg:max-w-[1500px] flex flex-row p-0"
				showCloseButton={false}
				autoFocus={false}
			>
				{/* Left Sidebar - Maintainer Discussion (full height) */}
				<div className="hidden lg:flex lg:w-[430px] shrink-0 border-r border-border flex-col bg-muted/10">
					<div className="px-4 py-4 border-b border-border/50 shrink-0">
						<div className="flex items-center justify-between h-8">
							<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
								<MessageSquare className="w-4 h-4 text-muted-foreground" />
								Maintainer Discussions
							</h3>
							{isLoadingComments ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
							) : (
								<span className="text-[10px] text-muted-foreground/60 font-mono bg-muted/50 px-1.5 py-0.5 rounded">
									{optimisticComments.length}
								</span>
							)}
						</div>
					</div>

					{/* Comments list - scrollable */}
					<div className="flex-1 overflow-y-auto p-3 space-y-3">
						{isLoadingComments && (
							<>
								{[1, 2, 3].map((i) => (
									<div
										key={i}
										className="border border-border/50 rounded-lg p-3 space-y-2 bg-background animate-pulse"
									>
										<div className="flex items-center gap-2">
											<div className="w-5 h-5 rounded-full bg-muted" />
											<div className="h-3 w-20 bg-muted rounded" />
											<div className="h-2.5 w-12 bg-muted/60 rounded" />
										</div>
										<div className="pl-7 space-y-1.5">
											<div className="h-3 w-full bg-muted/50 rounded" />
											<div className="h-3 w-3/4 bg-muted/50 rounded" />
										</div>
									</div>
								))}
							</>
						)}
						{!isLoadingComments &&
							optimisticComments.length === 0 && (
								<div className="flex flex-col items-center justify-center py-8 text-center">
									<MessageSquare className="w-8 h-8 text-muted-foreground/20 mb-2" />
									<p className="text-xs text-muted-foreground/50">
										No comments yet
									</p>
									<p className="text-[10px] text-muted-foreground/40 mt-1">
										Start a discussion
										with maintainers
									</p>
								</div>
							)}
						{!isLoadingComments &&
							optimisticComments.map((comment) => (
								<div
									key={comment.id}
									className={cn(
										"border border-border/50 rounded-lg p-3 space-y-1.5 bg-background",
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
												width={
													20
												}
												height={
													20
												}
												className="rounded-full"
											/>
										) : (
											<div className="w-5 h-5 rounded-full bg-muted" />
										)}
										<div className="flex items-center gap-1.5 flex-1 min-w-0">
											{comment.userLogin ? (
												<Link
													href={`/users/${comment.userLogin}`}
													className="text-xs font-medium text-foreground hover:underline truncate"
												>
													{
														comment.userName
													}
												</Link>
											) : (
												<span className="text-xs font-medium text-foreground truncate">
													{
														comment.userName
													}
												</span>
											)}
											<span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
												<TimeAgo
													date={
														comment.createdAt
													}
												/>
											</span>
											{comment.updatedAt !==
												comment.createdAt && (
												<span className="text-[9px] text-muted-foreground/40 shrink-0">
													(edited)
												</span>
											)}
										</div>
										{currentUser?.id ===
											comment.userId &&
											!comment.id.startsWith(
												"optimistic-",
											) && (
												<div className="flex items-center gap-0.5 shrink-0">
													{editingCommentId !==
														comment.id && (
														<button
															onClick={() =>
																handleStartEdit(
																	comment,
																)
															}
															className="text-muted-foreground/30 hover:text-foreground transition-colors cursor-pointer p-0.5"
															title="Edit comment"
														>
															<Pencil className="w-3 h-3" />
														</button>
													)}
													<button
														onClick={() =>
															handleDeleteComment(
																comment.id,
															)
														}
														className="text-muted-foreground/30 hover:text-red-400 transition-colors cursor-pointer p-0.5"
														title="Delete comment"
													>
														<Trash2 className="w-3 h-3" />
													</button>
												</div>
											)}
									</div>
									{editingCommentId ===
									comment.id ? (
										<div className="space-y-2">
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
												className="w-full min-h-[60px] p-2 text-xs bg-muted/30 border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
												autoFocus
											/>
											<div className="flex items-center justify-between">
												<span
													className={cn(
														"text-[10px]",
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
												<div className="flex items-center gap-1.5">
													<button
														onClick={
															handleCancelEdit
														}
														className="text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground transition-colors rounded"
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
															"text-[10px] px-2 py-1 bg-primary text-primary-foreground rounded",
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
										<div className="text-xs pl-7">
											<ClientMarkdown
												content={
													comment.body
												}
											/>
										</div>
									)}
								</div>
							))}
					</div>

					{/* Comment input - fixed at bottom */}
					{currentUser && (
						<div className="shrink-0 p-3 bg-background">
							<div className="rounded-lg border border-border overflow-hidden">
								<MarkdownEditor
									value={commentBody}
									onChange={setCommentBody}
									placeholder="Leave a comment..."
									rows={4}
									className="border-none text-xs"
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
								<div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/30 border-t border-border/50">
									<span className="text-[9px] text-muted-foreground/50">
										<kbd className="px-1 py-0.5 text-[8px] bg-muted border border-border rounded">
											⌘
										</kbd>{" "}
										+{" "}
										<kbd className="px-1 py-0.5 text-[8px] bg-muted border border-border rounded">
											↵
										</kbd>
									</span>
									<button
										onClick={
											handleAddComment
										}
										disabled={
											!commentBody.trim() ||
											isSubmittingComment
										}
										className={cn(
											"flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded",
											"bg-primary text-primary-foreground",
											"hover:bg-primary/90 transition-colors cursor-pointer",
											"disabled:opacity-40 disabled:cursor-not-allowed",
										)}
									>
										{isSubmittingComment ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<Send className="w-3 h-3" />
										)}
										Send
									</button>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Right section: Header + Content */}
				<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
					{/* Header */}
					<div className="px-6 py-4 border-b border-border shrink-0">
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-3 min-w-0">
								<div className="flex items-center gap-2">
									<CircleDot className="w-4 h-4 text-green-500" />
									<span className="text-sm font-mono text-muted-foreground">
										#{item.issueNumber}
									</span>
								</div>
								<DropdownMenu>
									<DropdownMenuTrigger
										asChild
									>
										<button
											className={cn(
												"inline-flex text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer transition-colors",
												statusOption.color,
											)}
										>
											{
												statusOption.label
											}
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										align="start"
										sideOffset={4}
										className="min-w-[160px]"
									>
										{STATUS_OPTIONS.map(
											(
												option,
											) => (
												<DropdownMenuItem
													key={
														option.value
													}
													onClick={() =>
														handleStatusChange(
															option.value,
														)
													}
													className={cn(
														"flex items-center",
														option.value ===
															currentStatus &&
															"bg-muted/50",
													)}
												>
													<span
														className={cn(
															"w-2.5 h-2.5 rounded-full mr-2.5",
															option.color.split(
																" ",
															)[0],
														)}
													/>
													{
														option.label
													}
												</DropdownMenuItem>
											),
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<button
									onClick={handleOpenFullView}
									className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
									title="Open in full view"
								>
									<Maximize2 className="w-3.5 h-3.5" />
									Full view
								</button>
								<a
									href={item.issueUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
									title="Open on GitHub"
								>
									<ExternalLink className="w-3.5 h-3.5" />
									GitHub
								</a>
								<button
									onClick={() =>
										onOpenChange(false)
									}
									className="p-2 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
								>
									<span className="sr-only">
										Close
									</span>
									<svg
										className="w-4 h-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={
												2
											}
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</div>
						</div>
					</div>

					{/* Content area with main + right sidebar */}
					<div className="flex-1 flex overflow-hidden">
						{/* Main Content */}
						<div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">
							<div>
								<h2 className="text-lg font-semibold text-foreground leading-snug mb-2">
									{item.issueTitle}
								</h2>
								<div className="flex items-center gap-4 text-xs text-muted-foreground">
									<span className="flex items-center gap-1">
										<GitBranch className="w-3.5 h-3.5" />
										{owner}/{repo}
									</span>
								</div>
							</div>

							{item.aiSummary && (
								<div className="p-4 bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/20 rounded-lg">
									<div className="flex items-center gap-2 mb-2">
										<Sparkles className="w-4 h-4 text-violet-400" />
										<p className="text-xs font-medium text-violet-400 uppercase tracking-wide">
											AI Summary
										</p>
									</div>
									<p className="text-sm text-foreground/90 leading-relaxed">
										{item.aiSummary}
									</p>
								</div>
							)}

							{item.issueBody && (
								<div className="space-y-3">
									<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
										<Hash className="w-4 h-4 text-muted-foreground" />
										Issue Description
									</h3>
									<div className="border border-border/60 rounded-lg p-4 bg-muted/10">
										<div className="prose prose-sm dark:prose-invert max-w-none">
											<ClientMarkdown
												content={
													item.issueBody
												}
											/>
										</div>
									</div>
								</div>
							)}

							{/* Mobile-only: Comments Section */}
							<div className="lg:hidden space-y-4 pt-4 border-t border-border/50">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
										<MessageSquare className="w-4 h-4 text-muted-foreground" />
										Maintainer
										Discussion
									</h3>
									{isLoadingComments ? (
										<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
									) : (
										<span className="text-xs text-muted-foreground/60 font-mono">
											{
												optimisticComments.length
											}{" "}
											comment
											{optimisticComments.length !==
											1
												? "s"
												: ""}
										</span>
									)}
								</div>

								{isLoadingComments && (
									<div className="space-y-3">
										{[1, 2, 3].map(
											(i) => (
												<div
													key={
														i
													}
													className="border border-border/60 rounded-lg p-4 space-y-2 animate-pulse"
												>
													<div className="flex items-center gap-3">
														<div className="w-6 h-6 rounded-full bg-muted" />
														<div className="h-3.5 w-24 bg-muted rounded" />
														<div className="h-3 w-14 bg-muted/60 rounded" />
													</div>
													<div className="pl-9 space-y-1.5">
														<div className="h-3.5 w-full bg-muted/50 rounded" />
														<div className="h-3.5 w-4/5 bg-muted/50 rounded" />
													</div>
												</div>
											),
										)}
									</div>
								)}

								{!isLoadingComments &&
									optimisticComments.length >
										0 && (
										<div className="space-y-3">
											{optimisticComments.map(
												(
													comment,
												) => (
													<div
														key={
															comment.id
														}
														className={cn(
															"border border-border/60 rounded-lg p-4 space-y-2",
															comment.id.startsWith(
																"optimistic-",
															) &&
																"opacity-60",
														)}
													>
														<div className="flex items-center gap-3">
															{comment.userAvatarUrl ? (
																<Image
																	src={
																		comment.userAvatarUrl
																	}
																	alt={
																		comment.userName
																	}
																	width={
																		24
																	}
																	height={
																		24
																	}
																	className="rounded-full"
																/>
															) : (
																<div className="w-6 h-6 rounded-full bg-muted" />
															)}
															<div className="flex items-center gap-2 flex-1 min-w-0">
																{comment.userLogin ? (
																	<Link
																		href={`/users/${comment.userLogin}`}
																		className="text-sm font-medium text-foreground hover:underline"
																	>
																		{
																			comment.userName
																		}
																	</Link>
																) : (
																	<span className="text-sm font-medium text-foreground">
																		{
																			comment.userName
																		}
																	</span>
																)}
																<span className="text-xs text-muted-foreground/50 font-mono">
																	<TimeAgo
																		date={
																			comment.createdAt
																		}
																	/>
																</span>
																{comment.updatedAt !==
																	comment.createdAt && (
																	<span className="text-[10px] text-muted-foreground/40">
																		(edited)
																	</span>
																)}
															</div>
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
																				className="text-muted-foreground/30 hover:text-foreground transition-colors cursor-pointer p-1"
																				title="Edit comment"
																			>
																				<Pencil className="w-3.5 h-3.5" />
																			</button>
																		)}
																		<button
																			onClick={() =>
																				handleDeleteComment(
																					comment.id,
																				)
																			}
																			className="text-muted-foreground/30 hover:text-red-400 transition-colors cursor-pointer p-1"
																		>
																			<Trash2 className="w-3.5 h-3.5" />
																		</button>
																	</div>
																)}
														</div>
														{editingCommentId ===
														comment.id ? (
															<div className="pl-9 space-y-2">
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
															<div className="pl-9 text-sm">
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
									<div className="rounded-lg border border-border overflow-hidden">
										<MarkdownEditor
											value={
												commentBody
											}
											onChange={
												setCommentBody
											}
											placeholder="Leave a comment for other maintainers..."
											rows={4}
											className="border-none"
											resizeYIndicator={
												false
											}
											onKeyDown={(
												e,
											) => {
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
										<div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border/50">
											<span className="text-xs text-muted-foreground/50">
												Press{" "}
												<kbd className="px-1 py-0.5 text-[10px] bg-muted border border-border rounded">
													⌘
												</kbd>{" "}
												+{" "}
												<kbd className="px-1 py-0.5 text-[10px] bg-muted border border-border rounded">
													Enter
												</kbd>{" "}
												to
												submit
											</span>
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
													"bg-primary text-primary-foreground",
													"hover:bg-primary/90 transition-colors cursor-pointer",
													"disabled:opacity-40 disabled:cursor-not-allowed",
												)}
											>
												{isSubmittingComment ? (
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
												) : (
													<Send className="w-3.5 h-3.5" />
												)}
												Comment
											</button>
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Right Sidebar */}
						<div className="hidden lg:block lg:w-56 shrink-0 border-l border-border bg-muted/20 p-4 space-y-4 overflow-y-auto">
							{/* Issue Info */}
							<div className="space-y-2">
								<h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
									GitHub Issue
								</h4>
								<div className="space-y-1.5">
									<div className="flex items-center gap-2">
										<CircleDot className="w-3 h-3 text-green-500 shrink-0" />
										<span className="text-[11px] text-muted-foreground/60">
											Issue
										</span>
										<span className="text-[11px] font-mono text-foreground">
											#
											{
												item.issueNumber
											}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<GitBranch className="w-3 h-3 text-muted-foreground/50 shrink-0" />
										<span className="text-[11px] text-foreground/80 truncate">
											{owner}/
											{repo}
										</span>
									</div>
									<a
										href={item.issueUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-1.5 text-[10px] text-primary hover:underline mt-1"
									>
										<ExternalLink className="w-2.5 h-2.5" />
										View on GitHub
									</a>
								</div>
							</div>

							<div className="h-px bg-border/50" />

							{/* Assignee */}
							<div className="space-y-2">
								<h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
									Assignee
								</h4>
								<Popover
									open={assigneePopoverOpen}
									onOpenChange={
										setAssigneePopoverOpen
									}
								>
									<PopoverTrigger asChild>
										<button
											className={cn(
												"flex items-center gap-2 w-full p-1.5 -m-1.5 rounded",
												"hover:bg-muted/50 transition-colors text-left",
											)}
										>
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
													width={
														20
													}
													height={
														20
													}
													className="rounded-full"
												/>
											) : (
												<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
													<User className="w-2.5 h-2.5 text-muted-foreground/40" />
												</div>
											)}
											<div className="min-w-0 flex-1">
												<p className="text-[11px] text-foreground truncate">
													{item.kanbanAssigneeLogin ??
														item.assigneeLogin ??
														"Unassigned"}
												</p>
												{item.kanbanAssigneeLogin &&
													item.assigneeLogin &&
													item.kanbanAssigneeLogin !==
														item.assigneeLogin && (
														<p className="text-[10px] text-muted-foreground/50">
															GH:{" "}
															{
																item.assigneeLogin
															}
														</p>
													)}
											</div>
											<ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />
										</button>
									</PopoverTrigger>
									<PopoverContent
										align="start"
										sideOffset={4}
										className="w-56 p-0"
									>
										<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
											<Search className="w-3 h-3 text-muted-foreground/50" />
											<input
												type="text"
												placeholder="Search maintainers..."
												value={
													assigneeSearch
												}
												onChange={(
													e,
												) =>
													setAssigneeSearch(
														e
															.target
															.value,
													)
												}
												className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40"
												autoFocus
											/>
										</div>
										<div className="max-h-48 overflow-y-auto p-1">
											{isLoadingCollaborators ? (
												<div className="flex items-center justify-center py-4">
													<Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
												</div>
											) : (
												<>
													{/* Show current user first if they're not already assigned */}
													{currentUser &&
														currentUser.login &&
														(item.kanbanAssigneeLogin ??
															item.assigneeLogin) !==
															currentUser.login &&
														(!assigneeSearch ||
															currentUser.login
																.toLowerCase()
																.includes(
																	assigneeSearch.toLowerCase(),
																) ||
															currentUser.name
																.toLowerCase()
																.includes(
																	assigneeSearch.toLowerCase(),
																)) && (
															<button
																type="button"
																onClick={() =>
																	handleAssignee(
																		currentUser.login,
																		currentUser.image,
																	)
																}
																disabled={
																	isAssigning
																}
																className={cn(
																	"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left",
																	"hover:bg-muted transition-colors",
																	"disabled:opacity-50",
																)}
															>
																{currentUser.image ? (
																	<Image
																		src={
																			currentUser.image
																		}
																		alt={
																			currentUser.name
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
																<span className="text-[11px] text-foreground truncate flex-1">
																	{
																		currentUser.login
																	}
																</span>
																<span className="text-[9px] text-muted-foreground/50">
																	you
																</span>
															</button>
														)}

													{/* Show unassign option */}
													{(item.kanbanAssigneeLogin ||
														item.assigneeLogin) && (
														<button
															type="button"
															onClick={() =>
																handleAssignee(
																	null,
																	null,
																)
															}
															disabled={
																isAssigning
															}
															className={cn(
																"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left",
																"hover:bg-muted transition-colors",
																"disabled:opacity-50",
															)}
														>
															<div className="w-[18px] h-[18px] rounded-full bg-muted/50 flex items-center justify-center">
																<UserX className="w-2.5 h-2.5 text-muted-foreground/50" />
															</div>
															<span className="text-[11px] text-muted-foreground">
																Unassign
															</span>
														</button>
													)}

													{/* Show other collaborators */}
													{collaborators
														.filter(
															(
																c,
															) => {
																if (
																	!assigneeSearch
																)
																	return true;
																const search =
																	assigneeSearch.toLowerCase();
																return (
																	c.login
																		.toLowerCase()
																		.includes(
																			search,
																		) ||
																	c.name
																		.toLowerCase()
																		.includes(
																			search,
																		)
																);
															},
														)
														.filter(
															(
																c,
															) =>
																c.login !==
																currentUser?.login,
														)
														.map(
															(
																collaborator,
															) => {
																const isCurrentAssignee =
																	(item.kanbanAssigneeLogin ??
																		item.assigneeLogin) ===
																	collaborator.login;
																return (
																	<button
																		type="button"
																		key={
																			collaborator.login
																		}
																		onClick={() =>
																			handleAssignee(
																				collaborator.login,
																				collaborator.avatar,
																			)
																		}
																		disabled={
																			isAssigning
																		}
																		className={cn(
																			"flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left",
																			"hover:bg-muted transition-colors",
																			"disabled:opacity-50",
																			isCurrentAssignee &&
																				"bg-muted/50",
																		)}
																	>
																		<Image
																			src={
																				collaborator.avatar
																			}
																			alt={
																				collaborator.name
																			}
																			width={
																				18
																			}
																			height={
																				18
																			}
																			className="rounded-full"
																		/>
																		<span className="text-[11px] text-foreground truncate flex-1">
																			{
																				collaborator.login
																			}
																		</span>
																		{isCurrentAssignee && (
																			<Check className="w-3 h-3 text-primary shrink-0" />
																		)}
																	</button>
																);
															},
														)}

													{collaborators.length ===
														0 &&
														!isLoadingCollaborators && (
															<p className="text-[10px] text-muted-foreground/50 text-center py-3">
																No
																collaborators
																found
															</p>
														)}
												</>
											)}
										</div>
									</PopoverContent>
								</Popover>
							</div>

							<div className="h-px bg-border/50" />

							{/* Timestamps */}
							<div className="space-y-2">
								<h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
									Timeline
								</h4>
								<div className="space-y-1">
									<div className="flex items-center gap-1.5 text-[10px]">
										<Calendar className="w-2.5 h-2.5 text-muted-foreground/40" />
										<span className="text-muted-foreground/50">
											Added:
										</span>
										<span className="text-foreground/70 font-mono">
											<TimeAgo
												date={
													item.createdAt
												}
											/>
										</span>
									</div>
									<div className="flex items-center gap-1.5 text-[10px]">
										<Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
										<span className="text-muted-foreground/50">
											Updated:
										</span>
										<span className="text-foreground/70 font-mono">
											<TimeAgo
												date={
													item.updatedAt
												}
											/>
										</span>
									</div>
								</div>
							</div>

							<div className="h-px bg-border/50" />

							{/* Actions */}
							<div className="space-y-1">
								<button
									onClick={handleSync}
									disabled={isSyncing}
									className={cn(
										"flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px]",
										"text-muted-foreground/70 hover:text-foreground",
										"hover:bg-muted rounded transition-colors",
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
										"flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px]",
										"text-red-400/60 hover:text-red-400",
										"hover:bg-red-500/10 rounded transition-colors",
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
			</SheetContent>
		</Sheet>
	);
}
