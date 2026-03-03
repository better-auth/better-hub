"use client";

import { Undo2 } from "lucide-react";

export function NotificationUndoBar({
	onUndo,
	secondsLeft,
}: {
	onUndo: () => void;
	secondsLeft: number;
}) {
	return (
		<div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border bg-background/95 px-3 py-2 backdrop-blur">
			<p className="text-[11px] text-muted-foreground">
				Marked as read. Undo in {secondsLeft}s
			</p>
			<button
				type="button"
				onClick={onUndo}
				className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-foreground/80 hover:text-foreground"
			>
				<Undo2 className="h-3 w-3" />
				Undo
			</button>
		</div>
	);
}
