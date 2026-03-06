"use client";

import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import {
	RefreshCw,
	Loader2,
	Circle,
	CircleDot,
	Timer,
	Eye,
	CheckCircle2,
	Search,
	MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanItem, KanbanStatus } from "@/lib/kanban-store";
import { KanbanCard } from "./kanban-card";
import { KanbanItemSheet } from "./kanban-item-sheet";
import { AddIssueDialog } from "./add-issue-dialog";
import { KeyboardShortcutsModal } from "./keyboard-shortcuts-modal";
import { ActiveIssuesColumn } from "./active-issues-column";
import { IssueDetailSheet } from "./issue-detail-sheet";
import { useKanbanHotkeys } from "./use-kanban-hotkeys";
import {
	moveKanbanItem,
	removeKanbanItem,
	syncAllKanbanStatuses,
	assignKanbanItemToSelf,
	addIssueToKanban,
	type ActiveIssue,
} from "@/app/(app)/repos/[owner]/[repo]/kanban/actions";

const COLUMNS: { id: KanbanStatus; label: string; icon: React.ReactNode; iconColor: string }[] = [
	{
		id: "backlog",
		label: "Backlog",
		icon: <CircleDot className="w-3.5 h-3.5" />,
		iconColor: "text-muted-foreground/60",
	},
	{
		id: "todo",
		label: "To Do",
		icon: <Circle className="w-3.5 h-3.5" />,
		iconColor: "text-muted-foreground/60",
	},
	{
		id: "in-progress",
		label: "In Progress",
		icon: <Timer className="w-3.5 h-3.5" />,
		iconColor: "text-yellow-500",
	},
	{
		id: "in-review",
		label: "In Review",
		icon: <Eye className="w-3.5 h-3.5" />,
		iconColor: "text-purple-500",
	},
	{
		id: "done",
		label: "Done",
		icon: <CheckCircle2 className="w-3.5 h-3.5" />,
		iconColor: "text-green-500",
	},
];

function PendingIssueCard({ issue }: { issue: ActiveIssue }) {
	return (
		<div
			className={cn(
				"bg-background border rounded-md p-3",
				"opacity-50 animate-pulse pointer-events-none",
			)}
		>
			<div className="flex items-start justify-between gap-2 mb-2">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5 mb-1">
						<Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
						<h3 className="text-sm font-medium line-clamp-2">
							{issue.title}
						</h3>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-3 text-muted-foreground/50">
				<span className="text-xs font-mono">#{issue.number}</span>
				{issue.comments > 0 && (
					<div className="flex items-center gap-1">
						<MessageCircle className="w-3 h-3" />
						<span className="text-xs">{issue.comments}</span>
					</div>
				)}
			</div>
		</div>
	);
}

interface KanbanBoardProps {
	owner: string;
	repo: string;
	initialItems: KanbanItem[];
	initialMaintainerCommentCounts?: Record<string, number>;
	currentUser: { id: string; login: string | null; name: string; image: string } | null;
}

export function KanbanBoard({
	owner,
	repo,
	initialItems,
	initialMaintainerCommentCounts = {},
	currentUser,
}: KanbanBoardProps) {
	const router = useRouter();
	const [items, setItems] = useState<KanbanItem[]>(initialItems);
	const [maintainerCommentCounts, setMaintainerCommentCounts] = useState<
		Record<string, number>
	>(initialMaintainerCommentCounts);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
	const [selectedItemId, setSelectedItemId] = useQueryState("item", {
		defaultValue: "",
		shallow: false,
	});
	const [isSyncing, startSyncTransition] = useTransition();
	const [focusedColumn, setFocusedColumn] = useState(0);
	const [focusedCardIndex, setFocusedCardIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const [selectedActiveIssue, setSelectedActiveIssue] = useState<ActiveIssue | null>(null);
	const [isIssueSheetOpen, setIsIssueSheetOpen] = useState(false);
	const [pendingItems, setPendingItems] = useState<
		Map<number, { issue: ActiveIssue; status: KanbanStatus }>
	>(new Map());
	const activeIssuesRef = useRef<Map<number, ActiveIssue>>(new Map());

	const selectedItem = useMemo(
		() => items.find((i) => i.id === selectedItemId) ?? null,
		[items, selectedItemId],
	);
	const isSheetOpen = !!selectedItemId && !!selectedItem;

	const kanbanIssueNumbers = useMemo(
		() => new Set(items.map((item) => item.issueNumber)),
		[items],
	);

	const handleActiveIssueClick = useCallback((issue: ActiveIssue) => {
		setSelectedActiveIssue(issue);
		setIsIssueSheetOpen(true);
	}, []);

	const handleRegisterActiveIssue = useCallback((issue: ActiveIssue) => {
		activeIssuesRef.current.set(issue.number, issue);
	}, []);

	const handleIssueAddedToKanban = useCallback((newItem: KanbanItem) => {
		setItems((prev) => [...prev, newItem]);
		setSelectedActiveIssue((prev) => (prev ? { ...prev, isOnKanban: true } : null));
	}, []);

	useEffect(() => {
		setItems(initialItems);
		setMaintainerCommentCounts(initialMaintainerCommentCounts);
	}, [initialItems, initialMaintainerCommentCounts]);

	const getItemsByStatus = useCallback(
		(status: KanbanStatus) => items.filter((item) => item.status === status),
		[items],
	);

	const getPendingItemsByStatus = useCallback(
		(status: KanbanStatus) => {
			const pending: ActiveIssue[] = [];
			pendingItems.forEach(({ issue, status: itemStatus }) => {
				if (itemStatus === status) {
					pending.push(issue);
				}
			});
			return pending;
		},
		[pendingItems],
	);

	const handleDragEnd = useCallback(
		async (result: DropResult) => {
			const { destination, source, draggableId } = result;

			if (!destination) return;

			if (
				destination.droppableId === source.droppableId &&
				destination.index === source.index
			) {
				return;
			}

			const newStatus = destination.droppableId as KanbanStatus;

			if (draggableId.startsWith("active-issue-")) {
				const issueNumber = parseInt(
					draggableId.replace("active-issue-", ""),
					10,
				);
				if (isNaN(issueNumber)) return;

				const activeIssue = activeIssuesRef.current.get(issueNumber);
				if (!activeIssue) return;

				setPendingItems((prev) => {
					const next = new Map(prev);
					next.set(issueNumber, {
						issue: activeIssue,
						status: newStatus,
					});
					return next;
				});

				try {
					const newItem = await addIssueToKanban(
						owner,
						repo,
						issueNumber,
					);
					const itemWithStatus = { ...newItem, status: newStatus };
					setPendingItems((prev) => {
						const next = new Map(prev);
						next.delete(issueNumber);
						return next;
					});
					setItems((prev) => [...prev, itemWithStatus]);
					await moveKanbanItem(newItem.id, newStatus);
				} catch (e) {
					console.error("Failed to add issue to kanban:", e);
					setPendingItems((prev) => {
						const next = new Map(prev);
						next.delete(issueNumber);
						return next;
					});
				}
				return;
			}

			setItems((prev) =>
				prev.map((item) =>
					item.id === draggableId
						? { ...item, status: newStatus }
						: item,
				),
			);

			moveKanbanItem(draggableId, newStatus).catch(() => {
				setItems(initialItems);
			});
		},
		[initialItems, owner, repo],
	);

	const handleSync = useCallback(() => {
		startSyncTransition(async () => {
			try {
				await syncAllKanbanStatuses(owner, repo);
				router.refresh();
			} catch {
				// Ignore errors
			}
		});
	}, [owner, repo, router]);

	const handleItemAdded = useCallback((newItem: KanbanItem) => {
		setItems((prev) => [...prev, newItem]);
	}, []);

	const handleCardOpen = useCallback(
		(itemId: string) => {
			setSelectedItemId(itemId);
		},
		[setSelectedItemId],
	);

	const handleCardMove = useCallback(
		async (itemId: string, newStatus: KanbanStatus) => {
			setItems((prev) =>
				prev.map((item) =>
					item.id === itemId ? { ...item, status: newStatus } : item,
				),
			);

			try {
				await moveKanbanItem(itemId, newStatus);
			} catch {
				setItems(initialItems);
			}
		},
		[initialItems],
	);

	const handleCardDelete = useCallback(
		async (itemId: string) => {
			if (!confirm("Remove this issue from the kanban board?")) return;

			setItems((prev) => prev.filter((item) => item.id !== itemId));

			try {
				await removeKanbanItem(itemId);
			} catch {
				setItems(initialItems);
			}
		},
		[initialItems],
	);

	const handleItemUpdated = useCallback((updatedItem: KanbanItem) => {
		setItems((prev) =>
			prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)),
		);
	}, []);

	const handleItemDeleted = useCallback(
		(itemId: string) => {
			setItems((prev) => prev.filter((item) => item.id !== itemId));
			setSelectedItemId("");
		},
		[setSelectedItemId],
	);

	const handleAssignToSelf = useCallback(
		async (itemId: string) => {
			try {
				await assignKanbanItemToSelf(itemId);
				router.refresh();
			} catch {
				// Ignore errors
			}
		},
		[router],
	);

	const getFocusedItem = useCallback(() => {
		const columnItems = getItemsByStatus(COLUMNS[focusedColumn].id);
		return columnItems[focusedCardIndex] ?? null;
	}, [focusedColumn, focusedCardIndex, getItemsByStatus]);

	const focusCard = useCallback((itemId: string) => {
		const cardEl = cardRefs.current.get(itemId);
		if (cardEl) {
			cardEl.focus();
			cardEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}, []);

	const handleColumnChange = useCallback(
		(newColumn: number) => {
			const clamped = Math.max(0, Math.min(COLUMNS.length - 1, newColumn));
			setFocusedColumn(clamped);
			const columnItems = getItemsByStatus(COLUMNS[clamped].id);
			const newIndex = Math.min(focusedCardIndex, columnItems.length - 1);
			setFocusedCardIndex(Math.max(0, newIndex));
			if (columnItems[newIndex]) {
				setTimeout(() => focusCard(columnItems[newIndex].id), 0);
			}
		},
		[focusedCardIndex, getItemsByStatus, focusCard],
	);

	const handleCardIndexChange = useCallback(
		(newIndex: number) => {
			const columnItems = getItemsByStatus(COLUMNS[focusedColumn].id);
			const clamped = Math.max(0, Math.min(columnItems.length - 1, newIndex));
			setFocusedCardIndex(clamped);
			if (columnItems[clamped]) {
				setTimeout(() => focusCard(columnItems[clamped].id), 0);
			}
		},
		[focusedColumn, getItemsByStatus, focusCard],
	);

	useKanbanHotkeys({
		containerRef,
		focusedColumn,
		focusedCardIndex,
		columns: COLUMNS,
		getItemsByStatus,
		getFocusedItem,
		onColumnChange: handleColumnChange,
		onCardIndexChange: handleCardIndexChange,
		onCardOpen: handleCardOpen,
		onCardMove: handleCardMove,
		onCardDelete: handleCardDelete,
		onAssignToSelf: handleAssignToSelf,
		onAddIssue: () => setIsAddDialogOpen(true),
		onShowShortcuts: () => setIsShortcutsOpen(true),
		onRefreshAll: handleSync,
	});

	return (
		<div
			ref={containerRef}
			className="flex flex-col flex-1 min-h-0 outline-none"
			tabIndex={-1}
		>
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-lg font-semibold">Kanban Board</h1>
				<div className="flex items-center gap-2">
					<button
						onClick={() => setIsShortcutsOpen(true)}
						className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
					>
						<span className="font-mono">F1</span> Shortcuts
					</button>
					<button
						onClick={handleSync}
						disabled={isSyncing}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
							"border border-border",
							"text-muted-foreground hover:text-foreground hover:bg-muted/50",
							"transition-colors disabled:opacity-50",
						)}
					>
						{isSyncing ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<RefreshCw className="w-3.5 h-3.5" />
						)}
						Sync
					</button>
					<button
						onClick={() => setIsAddDialogOpen(true)}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
							"bg-primary text-primary-foreground",
							"hover:bg-primary/90 transition-colors",
						)}
					>
						<Search className="w-3.5 h-3.5" />
						Find Issue
					</button>
				</div>
			</div>

			<DragDropContext onDragEnd={handleDragEnd}>
				<div className="flex gap-4 flex-1 min-h-0 overflow-x-auto pb-4 outline-none">
					{/* Active Issues Column */}
					<Droppable
						droppableId="active-issues"
						isDropDisabled={true}
					>
						{(provided) => (
							<div
								ref={provided.innerRef}
								{...provided.droppableProps}
								className="contents"
							>
								<ActiveIssuesColumn
									owner={owner}
									repo={repo}
									onIssueClick={
										handleActiveIssueClick
									}
									kanbanIssueNumbers={
										kanbanIssueNumbers
									}
									onRegisterIssue={
										handleRegisterActiveIssue
									}
									pendingIssueNumbers={
										pendingItems
									}
								/>
								<div className="hidden">
									{provided.placeholder}
								</div>
							</div>
						)}
					</Droppable>

					{/* Divider */}
					<div className="w-px bg-border/30 shrink-0 my-6" />

					{COLUMNS.map((column, columnIndex) => {
						const columnItems = getItemsByStatus(column.id);
						const columnPendingItems = getPendingItemsByStatus(
							column.id,
						);
						return (
							<div
								key={column.id}
								className="flex flex-col w-80 shrink-0 outline-none"
							>
								<div className="flex items-center justify-between mb-2 px-1">
									<h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
										<span
											className={
												column.iconColor
											}
										>
											{
												column.icon
											}
										</span>
										{column.label}
									</h2>
									<span className="text-xs font-mono text-muted-foreground/60">
										{columnItems.length +
											columnPendingItems.length}
									</span>
								</div>
								<Droppable droppableId={column.id}>
									{(provided, snapshot) => (
										<div
											ref={
												provided.innerRef
											}
											{...provided.droppableProps}
											className={cn(
												"flex-1 min-h-[200px] p-4 rounded-lg border border-border/50 outline-none",
												"bg-muted/20 transition-colors",
												snapshot.isDraggingOver &&
													"bg-muted/40 border-border",
											)}
										>
											<div className="space-y-4 outline-none">
												{columnItems.map(
													(
														item,
														index,
													) => (
														<Draggable
															key={
																item.id
															}
															draggableId={
																item.id
															}
															index={
																index
															}
														>
															{(
																provided,
																snapshot,
															) => (
																<div
																	ref={(
																		el,
																	) => {
																		provided.innerRef(
																			el,
																		);
																		if (
																			el
																		) {
																			cardRefs.current.set(
																				item.id,
																				el,
																			);
																		}
																	}}
																	{...provided.draggableProps}
																	{...provided.dragHandleProps}
																	tabIndex={
																		0
																	}
																	onFocus={() => {
																		setFocusedColumn(
																			columnIndex,
																		);
																		setFocusedCardIndex(
																			index,
																		);
																	}}
																>
																	<KanbanCard
																		item={
																			item
																		}
																		isDragging={
																			snapshot.isDragging
																		}
																		isFocused={
																			focusedColumn ===
																				columnIndex &&
																			focusedCardIndex ===
																				index
																		}
																		onOpen={() =>
																			handleCardOpen(
																				item.id,
																			)
																		}
																		onMove={(
																			status: KanbanStatus,
																		) =>
																			handleCardMove(
																				item.id,
																				status,
																			)
																		}
																		onDelete={() =>
																			handleCardDelete(
																				item.id,
																			)
																		}
																		maintainerCommentCount={
																			maintainerCommentCounts[
																				item
																					.id
																			] ??
																			0
																		}
																	/>
																</div>
															)}
														</Draggable>
													),
												)}
												{columnPendingItems.map(
													(
														issue,
													) => (
														<PendingIssueCard
															key={`pending-${issue.number}`}
															issue={
																issue
															}
														/>
													),
												)}
												{
													provided.placeholder
												}
											</div>
										</div>
									)}
								</Droppable>
							</div>
						);
					})}
				</div>
			</DragDropContext>

			<AddIssueDialog
				open={isAddDialogOpen}
				onOpenChange={setIsAddDialogOpen}
				owner={owner}
				repo={repo}
				onItemAdded={handleItemAdded}
			/>

			<KeyboardShortcutsModal
				open={isShortcutsOpen}
				onOpenChange={setIsShortcutsOpen}
			/>

			<KanbanItemSheet
				open={isSheetOpen}
				onOpenChange={(open) => {
					if (!open) setSelectedItemId("");
				}}
				owner={owner}
				repo={repo}
				item={selectedItem}
				currentUser={currentUser}
				onItemUpdated={handleItemUpdated}
				onItemDeleted={handleItemDeleted}
			/>

			<IssueDetailSheet
				open={isIssueSheetOpen}
				onOpenChange={setIsIssueSheetOpen}
				owner={owner}
				repo={repo}
				issue={selectedActiveIssue}
				onIssueAddedToKanban={handleIssueAddedToKanban}
			/>
		</div>
	);
}
