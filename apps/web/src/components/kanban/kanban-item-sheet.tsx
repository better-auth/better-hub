"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
	ExternalLink,
	Trash2,
	Loader2,
	MessageSquare,
	MessageCircle,
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
	ChevronUp,
	Check,
	Search,
	UserX,
	GripVertical,
	GitPullRequest,
	GitMerge,
	CircleX,
	FileEdit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { UserTooltip } from "@/components/shared/user-tooltip";
import { TimeAgo } from "@/components/ui/time-ago";
import { KanbanCommentCard } from "./kanban-comment-card";
import { KanbanCommentInput } from "./kanban-comment-input";
import { KanbanCommentSkeleton } from "./kanban-comment-skeleton";
import { KanbanCommentsEmpty } from "./kanban-comments-empty";
import { KanbanIssueComments } from "./kanban-issue-comments";
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
	const [isSubmittingComment, setIsSubmittingComment] = useState(false);
	const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
	const [editingCommentBody, setEditingCommentBody] = useState("");
	const [pendingAddComment, setPendingAddComment] = useState<KanbanComment | null>(null);
	const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
	const [pendingUpdates, setPendingUpdates] = useState<Map<string, string>>(new Map());

	const optimisticComments = useMemo(() => {
		let result = comments.filter((c) => !pendingDeleteIds.has(c.id));
		result = result.map((c) => {
			const pendingBody = pendingUpdates.get(c.id);
			if (pendingBody !== undefined) {
				return {
					...c,
					body: pendingBody,
					updatedAt: new Date().toISOString(),
				};
			}
			return c;
		});
		if (pendingAddComment) {
			result = [...result, pendingAddComment];
		}
		return result;
	}, [comments, pendingDeleteIds, pendingUpdates, pendingAddComment]);

	const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
	const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
	const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
	const [assigneeSearch, setAssigneeSearch] = useState("");
	const [isAssigning, setIsAssigning] = useState(false);
	const [activeChatTab, setActiveChatTab] = useState<"maintainer" | "issue">("maintainer");
	const [issueCommentCount, setIssueCommentCount] = useState<number>(0);
	const [isLoadingIssueComments, setIsLoadingIssueComments] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(430);
	const [isResizing, setIsResizing] = useState(false);
	const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
	const maintainerScrollRef = useRef<HTMLDivElement>(null);
	const [showMaintainerScrollTop, setShowMaintainerScrollTop] = useState(false);
	const [showMaintainerScrollBottom, setShowMaintainerScrollBottom] = useState(false);
	const [maintainerScrollShadowTop, setMaintainerScrollShadowTop] = useState(false);
	const [maintainerScrollShadowBottom, setMaintainerScrollShadowBottom] = useState(false);

	const MAINTAINER_SCROLL_SHADOW_EDGE_PX = 8;

	const selectChatTab = useCallback((tab: "maintainer" | "issue") => {
		flushSync(() => {
			setActiveChatTab(tab);
		});
	}, []);

	// Load saved width from localStorage on mount
	useEffect(() => {
		const saved = localStorage.getItem("kanban-sheet-sidebar-width");
		if (saved) {
			const width = Math.min(Math.max(Number(saved), 280), 700);
			setSidebarWidth(width);
		}
	}, []);

	const handleResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsResizing(true);
			resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
		},
		[sidebarWidth],
	);

	useEffect(() => {
		if (!isResizing) return;
		let currentWidth = sidebarWidth;

		const handleMouseMove = (e: MouseEvent) => {
			if (!resizeRef.current) return;
			const delta = e.clientX - resizeRef.current.startX;
			const newWidth = Math.min(
				Math.max(resizeRef.current.startWidth + delta, 280),
				700,
			);
			currentWidth = newWidth;
			setSidebarWidth(newWidth);
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			resizeRef.current = null;
			localStorage.setItem("kanban-sheet-sidebar-width", String(currentWidth));
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing, sidebarWidth]);

	const handleMaintainerScroll = useCallback(() => {
		const container = maintainerScrollRef.current;
		if (!container) return;

		const { scrollTop, scrollHeight, clientHeight } = container;
		setShowMaintainerScrollTop(scrollTop > 100);
		setShowMaintainerScrollBottom(scrollTop < scrollHeight - clientHeight - 100);
		setMaintainerScrollShadowTop(scrollTop > MAINTAINER_SCROLL_SHADOW_EDGE_PX);
		setMaintainerScrollShadowBottom(
			scrollTop < scrollHeight - clientHeight - MAINTAINER_SCROLL_SHADOW_EDGE_PX,
		);
	}, []);

	const scrollMaintainerToTop = useCallback(() => {
		maintainerScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const scrollMaintainerToBottom = useCallback(() => {
		const container = maintainerScrollRef.current;
		if (container) {
			container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
		}
	}, []);

	useEffect(() => {
		const container = maintainerScrollRef.current;
		if (!container) return;

		handleMaintainerScroll();
		container.addEventListener("scroll", handleMaintainerScroll, {
			passive: true,
		});
		const ro = new ResizeObserver(handleMaintainerScroll);
		ro.observe(container);
		return () => {
			container.removeEventListener("scroll", handleMaintainerScroll);
			ro.disconnect();
		};
	}, [handleMaintainerScroll]);

	useEffect(() => {
		const timeoutId = setTimeout(handleMaintainerScroll, 50);
		return () => clearTimeout(timeoutId);
	}, [optimisticComments.length, handleMaintainerScroll]);

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

	const handleAddComment = useCallback(async () => {
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
		setPendingAddComment(optimistic);
		setIsSubmittingComment(true);
		try {
			await addKanbanComment(item.id, body);
			const res = await fetch(`/api/kanban/${item.id}/comments`);
			const data = await res.json();
			setComments(data.comments ?? []);
		} finally {
			setPendingAddComment(null);
			setIsSubmittingComment(false);
		}
	}, [commentBody, currentUser, item]);

	const handleDeleteComment = useCallback(
		async (commentId: string) => {
			if (!item) return;
			setPendingDeleteIds((prev) => new Set(prev).add(commentId));
			setIsSubmittingComment(true);
			try {
				await deleteKanbanComment(commentId, item.id);
				const res = await fetch(`/api/kanban/${item.id}/comments`);
				const data = await res.json();
				setComments(data.comments ?? []);
			} finally {
				setPendingDeleteIds((prev) => {
					const next = new Set(prev);
					next.delete(commentId);
					return next;
				});
				setIsSubmittingComment(false);
			}
		},
		[item],
	);

	const handleStartEdit = useCallback((comment: KanbanComment) => {
		setEditingCommentId(comment.id);
		setEditingCommentBody(comment.body);
	}, []);

	const handleCancelEdit = useCallback(() => {
		setEditingCommentId(null);
		setEditingCommentBody("");
	}, []);

	const handleSaveEdit = useCallback(async () => {
		if (!item || !editingCommentId) return;
		const trimmedBody = editingCommentBody.trim();
		if (!trimmedBody) return;
		if (trimmedBody.length > 10000) {
			alert("Comment is too long (max 10000 characters)");
			return;
		}

		const originalComment = comments.find((c) => c.id === editingCommentId);
		if (!originalComment) return;

		const commentIdToEdit = editingCommentId;
		setEditingCommentId(null);
		setEditingCommentBody("");
		setPendingUpdates((prev) => new Map(prev).set(commentIdToEdit, trimmedBody));
		setIsSubmittingComment(true);

		try {
			await updateKanbanComment(commentIdToEdit, item.id, trimmedBody);
			const res = await fetch(`/api/kanban/${item.id}/comments`);
			const data = await res.json();
			setComments(data.comments ?? []);
		} finally {
			setPendingUpdates((prev) => {
				const next = new Map(prev);
				next.delete(commentIdToEdit);
				return next;
			});
			setIsSubmittingComment(false);
		}
	}, [item, editingCommentId, editingCommentBody, comments]);

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

	return (
		<Sheet open={open && !!item} onOpenChange={onOpenChange}>
			{item ? (
				<SheetContent
					ref={containerRef}
					side="right"
					className={cn(
						"w-full sm:max-w-4xl lg:max-w-[90vw] flex flex-row p-0",
						isResizing && "select-none",
					)}
					overlayClassName="backdrop-blur-md"
					showCloseButton={false}
					autoFocus={false}
					onCloseAutoFocus={(e) => e.preventDefault()}
				>
					{/* Left Sidebar - Chat Tabs (full height) */}
					<div
						className="hidden lg:flex shrink-0 border-r border-border flex-col bg-muted/10 relative"
						style={{ width: sidebarWidth }}
					>
						{/* Resize handle */}
						<div
							onMouseDown={handleResizeStart}
							className={cn(
								"absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 group",
								"hover:bg-primary/20 transition-colors",
								isResizing && "bg-primary/30",
							)}
						>
							<div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
								<GripVertical className="w-3 h-3 text-muted-foreground" />
							</div>
						</div>
						{/* Tab switcher */}
						<div className="flex border-b border-border shrink-0">
							<button
								type="button"
								onPointerDown={(e) => {
									if (
										e.pointerType ===
											"mouse" &&
										e.button !== 0
									)
										return;
									selectChatTab("maintainer");
								}}
								onClick={() =>
									selectChatTab("maintainer")
								}
								className={cn(
									"flex-1 px-4 py-3 text-xs font-medium transition-colors relative",
									activeChatTab ===
										"maintainer"
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground/80",
								)}
							>
								<span className="flex items-center justify-center gap-2">
									<MessageSquare className="w-3.5 h-3.5" />
									Maintainer Only
									{!isLoadingComments &&
										optimisticComments.length >
											0 && (
											<span className="text-[9px] font-mono bg-muted/50 px-1 py-0.5 rounded">
												{
													optimisticComments.length
												}
											</span>
										)}
								</span>
								{activeChatTab === "maintainer" && (
									<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
								)}
							</button>
							<button
								type="button"
								onPointerDown={(e) => {
									if (
										e.pointerType ===
											"mouse" &&
										e.button !== 0
									)
										return;
									selectChatTab("issue");
								}}
								onClick={() =>
									selectChatTab("issue")
								}
								className={cn(
									"flex-1 px-4 py-3 text-xs font-medium transition-colors relative",
									activeChatTab === "issue"
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground/80",
								)}
							>
								<span className="flex items-center justify-center gap-2">
									<MessageCircle className="w-3.5 h-3.5" />
									Issue Discussion
									{!isLoadingIssueComments &&
										issueCommentCount >
											0 && (
											<span className="text-[9px] font-mono bg-muted/50 px-1 py-0.5 rounded">
												{
													issueCommentCount
												}
											</span>
										)}
								</span>
								{activeChatTab === "issue" && (
									<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
								)}
							</button>
						</div>

						{/* Issue tab unmounted when inactive so switching to Maintainer does not reconcile this tree */}
						{activeChatTab === "issue" ? (
							<div className="flex-1 flex flex-col min-h-0">
								<KanbanIssueComments
									owner={owner}
									repo={repo}
									issueNumber={
										item.issueNumber
									}
									issueUrl={item.issueUrl}
									currentUser={currentUser}
									variant="compact"
									onCommentCountChange={(
										count,
										loading,
									) => {
										setIssueCommentCount(
											count,
										);
										setIsLoadingIssueComments(
											loading,
										);
									}}
								/>
							</div>
						) : null}

						{/* Maintainer Discussion Tab */}
						<div
							className={cn(
								"flex-1 flex flex-col min-h-0",
								activeChatTab !== "maintainer" &&
									"hidden",
							)}
						>
							{/* Maintainer comments list - scrollable */}
							<div className="relative flex-1 min-h-0">
								<div
									className={cn(
										"absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
										"bg-gradient-to-b from-background to-transparent",
										maintainerScrollShadowTop
											? "opacity-100"
											: "opacity-0",
									)}
								/>
								<div
									className={cn(
										"absolute bottom-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
										"bg-gradient-to-t from-background to-transparent",
										maintainerScrollShadowBottom
											? "opacity-100"
											: "opacity-0",
									)}
								/>
								<div
									ref={maintainerScrollRef}
									className="h-full overflow-y-auto p-3 space-y-3 relative"
								>
									{/* Floating scroll buttons */}
									{(showMaintainerScrollTop ||
										showMaintainerScrollBottom) && (
										<div className="sticky top-2 z-10 flex justify-end pointer-events-none">
											<div className="flex flex-col gap-1 pointer-events-auto">
												{showMaintainerScrollTop && (
													<button
														onClick={
															scrollMaintainerToTop
														}
														className="w-6 h-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
														title="Scroll to top"
													>
														<ChevronUp className="w-3.5 h-3.5" />
													</button>
												)}
												{showMaintainerScrollBottom && (
													<button
														onClick={
															scrollMaintainerToBottom
														}
														className="w-6 h-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
														title="Scroll to bottom"
													>
														<ChevronDown className="w-3.5 h-3.5" />
													</button>
												)}
											</div>
										</div>
									)}
									{isLoadingComments && (
										<KanbanCommentSkeleton
											count={3}
											variant="compact"
										/>
									)}
									{!isLoadingComments &&
										optimisticComments.length ===
											0 && (
											<KanbanCommentsEmpty
												title="No maintainer comments"
												subtitle="Start a private discussion"
											/>
										)}
									{!isLoadingComments &&
										optimisticComments.map(
											(
												comment,
											) => (
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
							</div>

							{/* Maintainer comment input - fixed at bottom */}
							{currentUser && (
								<div className="shrink-0 bg-background">
									<KanbanCommentInput
										value={commentBody}
										onChange={
											setCommentBody
										}
										onSubmit={
											handleAddComment
										}
										isSubmitting={
											isSubmittingComment
										}
										rows={5}
										variant="compact"
									/>
									<p className="text-[9px] text-amber-500/60 mt-1.5 text-center px-3 pb-2">
										Only visible to
										maintainers
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Right section: Header + Content */}
					<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
						{/* Header */}
						<div className="px-6 py-4 border-b border-border shrink-0">
							<div className="flex items-center justify-between gap-4">
								<div className="flex items-center gap-3 min-w-0">
									<Link
										href={`/${owner}/${repo}/issues/${item.issueNumber}`}
										className="flex items-center gap-2 hover:text-foreground transition-colors"
									>
										<CircleDot className="w-4 h-4 text-green-500" />
										<span className="text-sm font-mono text-muted-foreground hover:text-foreground">
											#
											{
												item.issueNumber
											}
										</span>
									</Link>
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
											sideOffset={
												4
											}
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
										onClick={
											handleOpenFullView
										}
										className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
										title="Open in full view"
									>
										<Maximize2 className="w-3.5 h-3.5" />
										Full view
									</button>
									<button
										onClick={() =>
											onOpenChange(
												false,
											)
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
											{owner}/
											{repo}
										</span>
									</div>
								</div>

								{item.aiSummary && (
									<div className="p-4 bg-gradient-to-br from-violet-500/5 to-blue-500/5 border border-violet-500/20 rounded-lg">
										<div className="flex items-center gap-2 mb-2">
											<Sparkles className="w-4 h-4 text-violet-400" />
											<p className="text-xs font-medium text-violet-400 uppercase tracking-wide">
												AI
												Summary
											</p>
										</div>
										<p className="text-sm text-foreground/90 leading-relaxed">
											{
												item.aiSummary
											}
										</p>
									</div>
								)}

								{item.issueBody && (
									<div className="space-y-3">
										<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
											<Hash className="w-4 h-4 text-muted-foreground" />
											Issue
											Description
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

								{/* Mobile-only: Issue Comments Section */}
								<div className="lg:hidden pt-4 border-t border-border/50">
									<div className="border border-border rounded-lg overflow-hidden">
										<KanbanIssueComments
											owner={
												owner
											}
											repo={repo}
											issueNumber={
												item.issueNumber
											}
											issueUrl={
												item.issueUrl
											}
											currentUser={
												currentUser
											}
											variant="default"
										/>
									</div>
								</div>

								{/* Mobile-only: Maintainer Comments Section */}
								<div className="lg:hidden space-y-4 pt-4 border-t border-border/50">
									<div className="flex items-center justify-between">
										<h3 className="text-sm font-medium text-foreground flex items-center gap-2">
											<MessageSquare className="w-4 h-4 text-amber-500" />
											Maintainer
											Only
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

									<p className="text-[10px] text-amber-500/60">
										These comments are
										only visible to
										repository
										maintainers
									</p>

									{isLoadingComments && (
										<div className="space-y-3">
											<KanbanCommentSkeleton
												count={
													3
												}
												variant="default"
											/>
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
															variant="default"
														/>
													),
												)}
											</div>
										)}

									{currentUser && (
										<KanbanCommentInput
											value={
												commentBody
											}
											onChange={
												setCommentBody
											}
											onSubmit={
												handleAddComment
											}
											isSubmitting={
												isSubmittingComment
											}
											placeholder="Leave a comment for other maintainers..."
											rows={5}
											variant="default"
										/>
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
										<Link
											href={`/${owner}/${repo}/issues/${item.issueNumber}`}
											className="flex items-center gap-2 hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors"
										>
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
										</Link>
										<div className="flex items-center gap-2">
											<GitBranch className="w-3 h-3 text-muted-foreground/50 shrink-0" />
											<span className="text-[11px] text-foreground/80 truncate">
												{
													owner
												}
												/
												{
													repo
												}
											</span>
										</div>
										<a
											href={
												item.issueUrl
											}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-1.5 text-[10px] text-primary hover:underline mt-1"
										>
											<ExternalLink className="w-2.5 h-2.5" />
											View on
											GitHub
										</a>
									</div>
								</div>

								{/* Linked PRs */}
								{item.linkedPRs &&
									item.linkedPRs.length >
										0 && (
										<>
											<div className="h-px bg-border/50" />
											<div className="space-y-2">
												<h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
													Linked
													PRs
												</h4>
												<div className="space-y-2">
													{item.linkedPRs.map(
														(
															pr,
														) => {
															const isMerged =
																pr.merged;
															const isClosed =
																pr.state ===
																	"closed" &&
																!pr.merged;
															const isDraft =
																pr.draft;
															const isOpen =
																pr.state ===
																"open";

															let statusIcon;
															let statusColor;
															let statusText;

															if (
																isMerged
															) {
																statusIcon =
																	(
																		<GitMerge className="w-3 h-3" />
																	);
																statusColor =
																	"text-purple-500";
																statusText =
																	"Merged";
															} else if (
																isClosed
															) {
																statusIcon =
																	(
																		<CircleX className="w-3 h-3" />
																	);
																statusColor =
																	"text-red-500";
																statusText =
																	"Closed";
															} else if (
																isDraft
															) {
																statusIcon =
																	(
																		<FileEdit className="w-3 h-3" />
																	);
																statusColor =
																	"text-muted-foreground";
																statusText =
																	"Draft";
															} else {
																statusIcon =
																	(
																		<GitPullRequest className="w-3 h-3" />
																	);
																statusColor =
																	"text-green-500";
																statusText =
																	"Open";
															}

															return (
																<Link
																	key={`${pr.repoOwner}/${pr.repoName}#${pr.number}`}
																	href={`/${pr.repoOwner}/${pr.repoName}/pulls/${pr.number}`}
																	className="block p-2 -mx-1 rounded border border-border/50 hover:border-border hover:bg-muted/30 transition-colors"
																>
																	<div className="flex items-start gap-2">
																		<span
																			className={cn(
																				"shrink-0 mt-0.5",
																				statusColor,
																			)}
																		>
																			{
																				statusIcon
																			}
																		</span>
																		<div className="min-w-0 flex-1">
																			<p className="text-[10px] font-medium text-foreground line-clamp-2 leading-tight">
																				{
																					pr.title
																				}
																			</p>
																			<div className="flex items-center gap-1.5 mt-1">
																				<span className="text-[9px] font-mono text-muted-foreground/60">
																					#
																					{
																						pr.number
																					}
																				</span>
																				<span
																					className={cn(
																						"text-[9px]",
																						statusColor,
																					)}
																				>
																					{
																						statusText
																					}
																				</span>
																				{pr.user && (
																					<span className="text-[9px] text-muted-foreground/50">
																						by{" "}
																						{
																							pr
																								.user
																								.login
																						}
																					</span>
																				)}
																			</div>
																		</div>
																	</div>
																</Link>
															);
														},
													)}
												</div>
											</div>
										</>
									)}

								<div className="h-px bg-border/50" />

								{/* Author */}
								<div className="space-y-2">
									<h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
										Author
									</h4>
									{item.authorLogin ? (
										<UserTooltip
											username={
												item.authorLogin
											}
											side="left"
										>
											<Link
												href={`/users/${item.authorLogin}`}
												className="flex items-center gap-2 min-w-0 w-full p-1.5 -m-1.5 rounded hover:bg-muted/50 transition-colors"
											>
												{item.authorAvatar ? (
													<Image
														src={
															item.authorAvatar
														}
														alt={
															item.authorLogin
														}
														width={
															20
														}
														height={
															20
														}
														className="rounded-full shrink-0"
													/>
												) : (
													<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
														<User className="w-2.5 h-2.5 text-muted-foreground/40" />
													</div>
												)}
												<span className="text-[11px] text-foreground truncate hover:underline min-w-0">
													{
														item.authorLogin
													}
												</span>
											</Link>
										</UserTooltip>
									) : (
										<div className="flex items-center gap-2">
											<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
												<User className="w-2.5 h-2.5 text-muted-foreground/40" />
											</div>
											<p className="text-[11px] text-muted-foreground">
												Unknown
											</p>
										</div>
									)}
								</div>

								<div className="h-px bg-border/50" />

								{/* Assignee */}
								<div className="space-y-2">
									<h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
										Assignee
									</h4>
									<Popover
										open={
											assigneePopoverOpen
										}
										onOpenChange={
											setAssigneePopoverOpen
										}
									>
										<PopoverTrigger
											asChild
										>
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
											sideOffset={
												4
											}
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
										onClick={
											handleDelete
										}
										disabled={
											isDeleting
										}
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
			) : null}
		</Sheet>
	);
}
