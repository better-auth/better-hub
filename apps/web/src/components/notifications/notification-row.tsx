"use client";

import Link from "next/link";
import { Bell, Check, CircleDot, GitPullRequest, Loader2 } from "lucide-react";
import type { NotificationEnrichedItem } from "@/lib/github-types";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { NotificationStatusChip } from "@/components/notifications/notification-status-chip";

function NotificationTypeIcon({ subjectType }: { subjectType: string }) {
	if (subjectType === "PullRequest") return <GitPullRequest className="h-3.5 w-3.5" />;
	if (subjectType === "Issue") return <CircleDot className="h-3.5 w-3.5" />;
	return <Bell className="h-3.5 w-3.5" />;
}

export function NotificationRow({
	item,
	isUnread,
	isMarking,
	onMarkRead,
	onOpen,
}: {
	item: NotificationEnrichedItem;
	isUnread: boolean;
	isMarking: boolean;
	onMarkRead: (id: string) => void;
	onOpen: (item: NotificationEnrichedItem) => void;
}) {
	return (
		<div className="group flex items-start gap-3 border-b border-border/60 px-4 py-3 transition-colors hover:bg-muted/40">
			<span className="mt-0.5 shrink-0 text-muted-foreground/70">
				<NotificationTypeIcon subjectType={item.subjectType} />
			</span>

			<Link
				href={item.href}
				onClick={() => onOpen(item)}
				className="min-w-0 flex-1"
			>
				<div className="flex items-start gap-2">
					{isUnread && (
						<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
					)}
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<p className="truncate text-[13px] leading-tight text-foreground/90">
								{item.title}
							</p>
							<NotificationStatusChip
								kind={item.statusKind}
								className="shrink-0"
							/>
						</div>
						<div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
							<span className="truncate">
								{item.contextLine}
							</span>
							{item.ci && (
								<span className="shrink-0 font-mono text-[10px] text-muted-foreground/80">
									{item.ci.failure}f /{" "}
									{item.ci.pending}p /{" "}
									{item.ci.success}s
								</span>
							)}
						</div>
						<div className="mt-1 flex items-center gap-2">
							<span className="text-[10px] text-muted-foreground/80">
								<TimeAgo date={item.updatedAt} />
							</span>
							<span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
								{item.primaryAction.label}
							</span>
						</div>
					</div>
				</div>
			</Link>

			<div className="mt-0.5 flex shrink-0 flex-col items-end gap-1">
				<Link
					href={item.primaryAction.href}
					className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground"
				>
					{item.primaryAction.label}
				</Link>
				<button
					type="button"
					disabled={isMarking}
					onClick={() => onMarkRead(item.id)}
					className={cn(
						"p-1 text-muted-foreground/40 transition-all hover:text-foreground",
						"opacity-0 group-hover:opacity-100 disabled:opacity-100",
					)}
					aria-label="Mark as read"
					title="Mark as read"
				>
					{isMarking ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Check className="h-3.5 w-3.5" />
					)}
				</button>
			</div>
		</div>
	);
}
