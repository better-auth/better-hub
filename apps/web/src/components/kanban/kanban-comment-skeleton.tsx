"use client";

import { cn } from "@/lib/utils";

interface KanbanCommentSkeletonProps {
	count?: number;
	variant?: "default" | "compact";
}

export function KanbanCommentSkeleton({
	count = 3,
	variant = "default",
}: KanbanCommentSkeletonProps) {
	const isCompact = variant === "compact";
	const avatarSize = isCompact ? "w-5 h-5" : "w-6 h-6";
	const padding = isCompact ? "p-3" : "p-4";
	const contentPadding = isCompact ? "pl-7" : "pl-9";

	return (
		<>
			{Array.from({ length: count }).map((_, i) => (
				<div
					key={i}
					className={cn(
						"border border-border/50 rounded-lg bg-background animate-pulse",
						padding,
						"space-y-2",
					)}
				>
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"rounded-full bg-muted",
								avatarSize,
							)}
						/>
						<div
							className={cn(
								"h-3 bg-muted rounded",
								isCompact ? "w-20" : "w-24",
							)}
						/>
						<div
							className={cn(
								"bg-muted/60 rounded",
								isCompact
									? "h-2.5 w-12"
									: "h-3 w-14",
							)}
						/>
					</div>
					<div className={cn(contentPadding, "space-y-1.5")}>
						<div className="h-3 w-full bg-muted/50 rounded" />
						<div className="h-3 w-3/4 bg-muted/50 rounded" />
					</div>
				</div>
			))}
		</>
	);
}
