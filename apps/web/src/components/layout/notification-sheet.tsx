"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, GitPullRequest, CircleDot, CheckCircle2, Clock, Check, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { markNotificationDone, markAllNotificationsRead } from "@/app/(app)/repos/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import type { NotificationItem } from "@/lib/github-types";

const reasonLabels: Record<string, string> = {
	assign: "Assigned",
	author: "Author",
	comment: "Comment",
	ci_activity: "CI",
	invitation: "Invited",
	manual: "Subscribed",
	mention: "Mentioned",
	review_requested: "Review requested",
	security_alert: "Security",
	state_change: "State change",
	subscribed: "Watching",
	team_mention: "Team mention",
};

function getNotifHref(notif: NotificationItem): string {
	const repo = notif.repository.full_name;
	if (!notif.subject.url) return `/${repo}`;
	const match = notif.subject.url.match(/repos\/[^/]+\/[^/]+\/(pulls|issues)\/(\d+)/);
	if (match) {
		const type = match[1] === "pulls" ? "pulls" : "issues";
		return `/${repo}/${type}/${match[2]}`;
	}
	return `/${repo}`;
}

interface NotificationSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	notifications: NotificationItem[];
	doneIds: Set<string>;
	setDoneIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function NotificationSheet({
	open,
	onOpenChange,
	notifications,
	doneIds,
	setDoneIds,
}: NotificationSheetProps) {
	const { emit } = useMutationEvents();
	const [markingAll, startMarkAll] = useTransition();
	const [markingId, setMarkingId] = useState<string | null>(null);

	const visibleNotifs = notifications.filter((n) => !doneIds.has(n.id));
	const unreadCount = visibleNotifs.filter((n) => n.unread).length;

	async function handleMarkDone(notifId: string) {
		setMarkingId(notifId);
		const res = await markNotificationDone(notifId);
		if (res.success) {
			setDoneIds((prev) => new Set([...prev, notifId]));
		}
		setMarkingId(null);
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				showCloseButton={false}
				className="p-0 rounded-t-xl max-h-[70vh] flex flex-col border-t border-border"
				title="Notifications"
			>
				{/* Header */}
				<div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
					<div className="flex items-center gap-2">
						<Bell className="w-3.5 h-3.5 text-muted-foreground" />
						<span className="text-[12px] font-medium">
							Notifications
						</span>
						{unreadCount > 0 && (
							<span className="text-[9px] font-mono px-1.5 py-0.5 bg-foreground text-background rounded-full tabular-nums">
								{unreadCount}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2">
						{unreadCount > 0 && (
							<button
								disabled={markingAll}
								onClick={() => {
									startMarkAll(async () => {
										const res =
											await markAllNotificationsRead();
										if (res.success) {
											const ids =
												notifications.map(
													(
														n,
													) =>
														n.id,
												);
											setDoneIds(
												new Set(
													ids,
												),
											);
											emit({
												type: "notification:all-read",
												ids,
											});
										}
									});
								}}
								className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
							>
								{markingAll ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : (
									<CheckCircle2 className="w-3 h-3" />
								)}
								Clear all
							</button>
						)}
						<Link
							href="/notifications"
							onClick={() => onOpenChange(false)}
							className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
						>
							View all
						</Link>
					</div>
				</div>

				{/* Notification list */}
				<div className="flex-1 overflow-y-auto min-h-0">
					{visibleNotifs.length > 0 ? (
						visibleNotifs.map((notif) => {
							const href = getNotifHref(notif);
							const isMarking = markingId === notif.id;
							const icon =
								notif.subject.type ===
								"PullRequest" ? (
									<GitPullRequest className="w-3.5 h-3.5" />
								) : notif.subject.type ===
								  "Issue" ? (
									<CircleDot className="w-3.5 h-3.5" />
								) : (
									<Bell className="w-3.5 h-3.5" />
								);

							return (
								<div
									key={notif.id}
									className="group flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/50 last:border-b-0"
								>
									<span className="mt-0.5 text-muted-foreground/60 shrink-0">
										{icon}
									</span>
									<Link
										href={href}
										onClick={async () => {
											onOpenChange(
												false,
											);
											if (
												notif.unread
											) {
												setDoneIds(
													(
														prev,
													) =>
														new Set(
															[
																...prev,
																notif.id,
															],
														),
												);
												emit(
													{
														type: "notification:read",
														id: notif.id,
													},
												);
												const res =
													await markNotificationDone(
														notif.id,
													);
												if (
													!res.success
												) {
													setDoneIds(
														(
															prev,
														) => {
															const next =
																new Set(
																	prev,
																);
															next.delete(
																notif.id,
															);
															return next;
														},
													);
												}
											}
										}}
										className="flex-1 min-w-0"
									>
										<div className="flex items-center gap-1.5">
											{notif.unread && (
												<span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
											)}
											<span className="text-[12px] text-foreground/90 truncate leading-tight">
												{
													notif
														.subject
														.title
												}
											</span>
										</div>
										<div className="flex items-center gap-2 mt-1">
											<span className="text-[10px] font-mono text-muted-foreground/50 truncate">
												{
													notif
														.repository
														.full_name
												}
											</span>
											<span
												className={cn(
													"text-[9px] font-mono px-1 py-px border shrink-0",
													notif.reason ===
														"review_requested"
														? "border-warning/30 text-warning"
														: notif.reason ===
																	"mention" ||
															  notif.reason ===
																	"team_mention"
															? "border-foreground/20 text-foreground/60"
															: "border-border text-muted-foreground/60",
												)}
											>
												{reasonLabels[
													notif
														.reason
												] ||
													notif.reason}
											</span>
											<span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
												<Clock className="w-2.5 h-2.5" />
												<TimeAgo
													date={
														notif.updated_at
													}
												/>
											</span>
										</div>
									</Link>
									<button
										disabled={isMarking}
										onClick={() =>
											handleMarkDone(
												notif.id,
											)
										}
										className="shrink-0 mt-0.5 p-0.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-foreground/70 transition-all cursor-pointer disabled:opacity-100"
										title="Dismiss"
									>
										{isMarking ? (
											<Loader2 className="w-3 h-3 animate-spin" />
										) : (
											<Check className="w-3 h-3" />
										)}
									</button>
								</div>
							);
						})
					) : (
						<div className="py-12 text-center">
							<Bell className="w-5 h-5 text-muted-foreground/20 mx-auto mb-2" />
							<p className="text-[11px] text-muted-foreground/50 font-mono">
								All caught up
							</p>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
