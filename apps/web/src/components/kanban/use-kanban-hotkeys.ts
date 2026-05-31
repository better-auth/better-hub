import { useHotkey } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import type { KanbanItem, KanbanStatus } from "@/lib/kanban-store";

interface KanbanHotkeyOptions {
	containerRef: RefObject<HTMLDivElement | null>;
	focusedColumn: number;
	focusedCardIndex: number;
	columns: { id: KanbanStatus; label: string }[];
	getItemsByStatus: (status: KanbanStatus) => KanbanItem[];
	getFocusedItem: () => KanbanItem | null;
	onColumnChange: (column: number) => void;
	onCardIndexChange: (index: number) => void;
	onCardOpen: (itemId: string) => void;
	onCardMove: (itemId: string, status: KanbanStatus) => void;
	onCardDelete: (itemId: string) => void;
	onAssignToSelf: (itemId: string) => void;
	onAddIssue: () => void;
	onShowShortcuts: () => void;
	onRefreshAll: () => void;
}

export function useKanbanHotkeys({
	containerRef,
	focusedColumn,
	focusedCardIndex,
	columns,
	getItemsByStatus,
	getFocusedItem,
	onColumnChange,
	onCardIndexChange,
	onCardOpen,
	onCardMove,
	onCardDelete,
	onAssignToSelf,
	onAddIssue,
	onShowShortcuts,
	onRefreshAll,
}: KanbanHotkeyOptions) {
	const target = containerRef;
	const hotkeyOpts = { target, ignoreInputs: true, preventDefault: true };

	useHotkey("1", () => onColumnChange(0), hotkeyOpts);
	useHotkey("2", () => onColumnChange(1), hotkeyOpts);
	useHotkey("3", () => onColumnChange(2), hotkeyOpts);
	useHotkey("4", () => onColumnChange(3), hotkeyOpts);
	useHotkey("5", () => onColumnChange(4), hotkeyOpts);

	useHotkey({ key: "H" }, () => onColumnChange(focusedColumn - 1), hotkeyOpts);
	useHotkey("ArrowLeft", () => onColumnChange(focusedColumn - 1), hotkeyOpts);
	useHotkey({ key: "L" }, () => onColumnChange(focusedColumn + 1), hotkeyOpts);
	useHotkey("ArrowRight", () => onColumnChange(focusedColumn + 1), hotkeyOpts);

	useHotkey({ key: "J" }, () => onCardIndexChange(focusedCardIndex + 1), hotkeyOpts);
	useHotkey("ArrowDown", () => onCardIndexChange(focusedCardIndex + 1), hotkeyOpts);
	useHotkey({ key: "K" }, () => onCardIndexChange(focusedCardIndex - 1), hotkeyOpts);
	useHotkey("ArrowUp", () => onCardIndexChange(focusedCardIndex - 1), hotkeyOpts);

	useHotkey(
		{ key: "G" },
		() => {
			onColumnChange(0);
			onCardIndexChange(0);
		},
		hotkeyOpts,
	);

	useHotkey(
		"Shift+G",
		() => {
			const lastColumnIndex = columns.length - 1;
			onColumnChange(lastColumnIndex);
			const lastColumnItems = getItemsByStatus(columns[lastColumnIndex].id);
			onCardIndexChange(lastColumnItems.length - 1);
		},
		hotkeyOpts,
	);

	useHotkey(
		"Enter",
		() => {
			const item = getFocusedItem();
			if (item) onCardOpen(item.id);
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "O" },
		() => {
			const item = getFocusedItem();
			if (item) onCardOpen(item.id);
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "1", shift: true },
		() => {
			const item = getFocusedItem();
			if (item) onCardMove(item.id, "backlog");
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "2", shift: true },
		() => {
			const item = getFocusedItem();
			if (item) onCardMove(item.id, "todo");
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "3", shift: true },
		() => {
			const item = getFocusedItem();
			if (item) onCardMove(item.id, "in-progress");
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "4", shift: true },
		() => {
			const item = getFocusedItem();
			if (item) onCardMove(item.id, "in-review");
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "5", shift: true },
		() => {
			const item = getFocusedItem();
			if (item) onCardMove(item.id, "done");
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "A" },
		() => {
			const item = getFocusedItem();
			if (item) onAssignToSelf(item.id);
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "D" },
		() => {
			const item = getFocusedItem();
			if (item) onCardDelete(item.id);
		},
		hotkeyOpts,
	);

	useHotkey(
		{ key: "E" },
		() => {
			const item = getFocusedItem();
			if (item) window.open(item.issueUrl, "_blank");
		},
		hotkeyOpts,
	);

	useHotkey({ key: "N" }, () => onAddIssue(), hotkeyOpts);
	useHotkey("F1", () => onShowShortcuts(), hotkeyOpts);
	useHotkey("Shift+R", () => onRefreshAll(), hotkeyOpts);
}
