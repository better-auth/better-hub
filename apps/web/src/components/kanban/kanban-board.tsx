"use client";

import { useState, useCallback, useRef, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import {
	Plus,
	RefreshCw,
	Loader2,
	Circle,
	CircleDot,
	Timer,
	Eye,
	CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanItem, KanbanStatus } from "@/lib/kanban-store";
import { KanbanCard } from "./kanban-card";
import { KanbanItemSheet } from "./kanban-item-sheet";
import { AddIssueDialog } from "./add-issue-dialog";
import { KeyboardShortcutsModal } from "./keyboard-shortcuts-modal";
import { useKanbanHotkeys } from "./use-kanban-hotkeys";
import {
	moveKanbanItem,
	removeKanbanItem,
	syncAllKanbanStatuses,
	assignKanbanItemToSelf,
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

interface KanbanBoardProps {
	owner: string;
	repo: string;
	initialItems: KanbanItem[];
	currentUser: { id: string; login: string | null; name: string; image: string } | null;
}

export function KanbanBoard({ owner, repo, initialItems, currentUser }: KanbanBoardProps) {
	const router = useRouter();
	const [items, setItems] = useState<KanbanItem[]>(initialItems);
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

	const selectedItem = useMemo(
		() => items.find((i) => i.id === selectedItemId) ?? null,
		[items, selectedItemId],
	);
	const isSheetOpen = !!selectedItemId && !!selectedItem;

	useEffect(() => {
		setItems(initialItems);
	}, [initialItems]);

	const getItemsByStatus = useCallback(
		(status: KanbanStatus) => items.filter((item) => item.status === status),
		[items],
	);

	const handleDragEnd = useCallback(
		(result: DropResult) => {
			const { destination, source, draggableId } = result;

			if (!destination) return;

			if (
				destination.droppableId === source.droppableId &&
				destination.index === source.index
			) {
				return;
			}

			const newStatus = destination.droppableId as KanbanStatus;

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
		[initialItems],
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
		setIsAddDialogOpen(false);
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
						<Plus className="w-3.5 h-3.5" />
						Add Issue
					</button>
				</div>
			</div>

			<DragDropContext onDragEnd={handleDragEnd}>
				<div className="flex gap-4 flex-1 min-h-0 overflow-x-auto pb-4 outline-none">
					{COLUMNS.map((column, columnIndex) => {
						const columnItems = getItemsByStatus(column.id);
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
										{columnItems.length}
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
																	/>
																</div>
															)}
														</Draggable>
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
		</div>
	);
}
