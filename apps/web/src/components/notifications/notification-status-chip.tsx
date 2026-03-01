"use client";

import type { NotificationStatusKind } from "@/lib/github-types";
import { cn } from "@/lib/utils";

const labels: Record<NotificationStatusKind, string> = {
	failed: "Failed",
	running: "Running",
	passed: "Passed",
	review_requested: "Review",
	mention: "Mention",
	comment: "Comment",
	security: "Security",
	state_change: "Update",
	info: "Info",
};

const tones: Record<NotificationStatusKind, string> = {
	failed: "border-destructive/40 text-destructive bg-destructive/10",
	running: "border-warning/40 text-warning bg-warning/10",
	passed: "border-success/40 text-success bg-success/10",
	review_requested: "border-warning/30 text-warning bg-warning/10",
	mention: "border-foreground/20 text-foreground/80 bg-muted/60",
	comment: "border-border text-muted-foreground bg-muted/40",
	security: "border-destructive/30 text-destructive bg-destructive/10",
	state_change: "border-border text-muted-foreground bg-muted/40",
	info: "border-border text-muted-foreground bg-muted/40",
};

export function NotificationStatusChip({
	kind,
	className,
}: {
	kind: NotificationStatusKind;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide",
				tones[kind],
				className,
			)}
		>
			{labels[kind]}
		</span>
	);
}
