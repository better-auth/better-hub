"use client";

import type { NotificationStatusKind } from "@/lib/github-types";
import {
	AlertTriangle,
	AtSign,
	CheckCircle2,
	GitPullRequest,
	Info,
	LoaderCircle,
	MessageSquare,
	ShieldAlert,
} from "lucide-react";
import type { ComponentType } from "react";
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
	failed: "border-destructive/25 text-destructive/90 bg-destructive/[0.08]",
	running: "border-warning/25 text-warning/90 bg-warning/[0.08]",
	passed: "border-success/25 text-success/90 bg-success/[0.08]",
	review_requested: "border-warning/20 text-warning/85 bg-warning/[0.08]",
	mention: "border-foreground/15 text-foreground/75 bg-muted/35",
	comment: "border-border/60 text-muted-foreground/75 bg-muted/25",
	security: "border-destructive/20 text-destructive/85 bg-destructive/[0.08]",
	state_change: "border-border/60 text-muted-foreground/75 bg-muted/25",
	info: "border-border/60 text-muted-foreground/75 bg-muted/25",
};

const icons: Record<NotificationStatusKind, ComponentType<{ className?: string }>> = {
	failed: AlertTriangle,
	running: LoaderCircle,
	passed: CheckCircle2,
	review_requested: GitPullRequest,
	mention: AtSign,
	comment: MessageSquare,
	security: ShieldAlert,
	state_change: Info,
	info: Info,
};

export function NotificationStatusChip({
	kind,
	className,
}: {
	kind: NotificationStatusKind;
	className?: string;
}) {
	const Icon = icons[kind];
	return (
		<span
			className={cn(
				"inline-flex min-w-[68px] items-center justify-center gap-1 rounded-md border px-1 py-0.5 text-[9px] font-mono uppercase tracking-wide",
				tones[kind],
				className,
			)}
		>
			<Icon
				className={cn(
					"h-2.5 w-2.5",
					kind === "running" ? "animate-spin" : "",
				)}
			/>
			{labels[kind]}
		</span>
	);
}
