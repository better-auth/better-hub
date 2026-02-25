"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
	Bell,
	GitPullRequest,
	CircleDot,
	CheckCircle2,
	AlertCircle,
	MessageSquare,
	Tag,
	Clock,
	Check,
	Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import type { NotificationItem } from "@/lib/github-types";
import { markNotificationDone, markAllNotificationsRead } from "@/app/(app)/repos/actions";

type FilterType = "all" | "unread" | "participating" | "mention";

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

const typeIcons: Record<string, React.ReactNode> = {
	PullRequest: <GitPullRequest className="w-3.5 h-3.5" />,
	Issue: <CircleDot className="w-3.5 h-3.5" />,
	CheckSuite: <CheckCircle2 className="w-3.5 h-3.5" />,
	Release: <Tag className="w-3.5 h-3.5" />,
	Discussion: <MessageSquare className="w-3.5 h-3.5" />,
	RepositoryVulnerabilityAlert: <AlertCircle className="w-3.5 h-3.5" />,
};

function getNotificationHref(notif: NotificationItem): string | null {
	const repo = notif.repository.full_name;
	if (!notif.subject.url) return `/${repo}`;
	// API URLs look like https://api.github.com/repos/owner/repo/pulls/123
	const match = notif.subject.url.match(/repos\/[^/]+\/[^/]+\/(pulls|issues)\/(\d+)/);
	if (match) {
		const type = match[1] === "pulls" ? "pulls" : "issues";
		return `/${repo}/${type}/${match[2]}`;
	}
	return `/${repo}`;
}

export function NotificationsContent({ notifications }: { notifications: NotificationItem[] }) {
	const [filter, setFilter] = useState<FilterType>("all");
	const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
	const [markingAll, startMarkAll] = useTransition();
	const [markingId, setMarkingId] = useState<string | null>(null);

	const visibleNotifications = notifications.filter((n) => !doneIds.has(n.id));

	const filtered = visibleNotifications.filter((n) => {
		if (filter === "unread") return n.unread;
		if (filter === "participating")
			return [
				"author",
				"comment",
				"mention",
				"review_requested",
				"assign",
			].includes(n.reason);
		if (filter === "mention")
			return n.reason === "mention" || n.reason === "team_mention";
		return true;
	});

	const unreadCount = visibleNotifications.filter((n) => n.unread).length;

	const grouped = filtered.reduce(
		(acc, notif) => {
			const repo = notif.repository.full_name;
			if (!acc[repo]) acc[repo] = [];
			acc[repo].push(notif);
			return acc;
		},
		{} as Record<string, NotificationItem[]>,
	);

	async function handleMarkDone(e: React.MouseEvent, notifId: string) {
		e.preventDefault();
		e.stopPropagation();
		setMarkingId(notifId);
		const res = await markNotificationDone(notifId);
		if (res.success) {
			setDoneIds((prev) => new Set([...prev, notifId]));
		}
		setMarkingId(null);
	}

	return (
		<div className="py-4 md:py-6 max-w-[1100px] mx-auto">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-lg font-medium tracking-tight">
						Notifications
					</h1>
					<p className="text-xs text-muted-foreground font-mono mt-1">
						{unreadCount > 0
							? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
							: "All caught up"}
					</p>
				</div>
				{unreadCount > 0 && (
					<button
						disabled={markingAll}
						onClick={() => {
							startMarkAll(async () => {
								const res =
									await markAllNotificationsRead();
								if (res.success) {
									setDoneIds(
										new Set(
											notifications.map(
												(
													n,
												) =>
													n.id,
											),
										),
									);
								}
							});
						}}
						className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground border border-border hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{markingAll ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<Check className="w-3.5 h-3.5" />
						)}
						Mark all read
					</button>
				)}
			</div>

			{/* Filters */}
			<div className="flex items-center gap-0 border-b border-border mb-6 overflow-x-auto no-scrollbar">
				{(
					[
						["all", "All", "01"],
						["unread", "Unread", "02"],
						["participating", "Participating", "03"],
						["mention", "Mentions", "04"],
					] as const
				).map(([value, label, num]) => (
					<button
						key={value}
						onClick={() => setFilter(value)}
						className={cn(
							"flex items-center gap-2 px-3 sm:px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider shrink-0 whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer",
							filter === value
								? "border-foreground/60 text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground/60",
						)}
					>
						<span className="text-[9px] text-muted-foreground/30">
							{num}
						</span>
						{label}
					</button>
				))}
			</div>

			{/* Grouped notifications */}
			<div className="space-y-6">
				{Object.entries(grouped).map(([repo, notifs]) => (
					<div key={repo}>
						<div className="flex items-center gap-2 mb-2 px-1">
							<Link
								href={`/${repo}`}
								className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
							>
								{repo}
							</Link>
							<span className="text-[9px] font-mono text-muted-foreground/60 border border-border px-1 py-0.5">
								{notifs.length}
							</span>
						</div>
						<div className="border border-border divide-y divide-border">
							{notifs.map((notif) => {
								const href =
									getNotificationHref(notif);
								const isMarking =
									markingId === notif.id;
								return (
									<div
										key={notif.id}
										className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
									>
										<div className="mt-0.5 text-muted-foreground/70">
											{typeIcons[
												notif
													.subject
													.type
											] || (
												<Bell className="w-3.5 h-3.5" />
											)}
										</div>
										<Link
											href={
												href ||
												"#"
											}
											className="flex-1 min-w-0"
										>
											<div className="flex items-center gap-2">
												{notif.unread && (
													<span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
												)}
												<span className="text-sm text-foreground/90 truncate">
													{
														notif
															.subject
															.title
													}
												</span>
											</div>
											<div className="flex items-center gap-2 mt-1">
												<span
													className={cn(
														"text-[9px] font-mono px-1 py-0.5 border",
														notif.reason ===
															"review_requested"
															? "border-warning/30 text-warning"
															: notif.reason ===
																		"mention" ||
																  notif.reason ===
																		"team_mention"
																? "border-foreground/20 text-foreground/60"
																: "border-border text-muted-foreground",
													)}
												>
													{reasonLabels[
														notif
															.reason
													] ||
														notif.reason}
												</span>
												<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
													<Clock className="w-3 h-3" />
													<TimeAgo
														date={
															notif.updated_at
														}
													/>
												</span>
											</div>
										</Link>
										<button
											disabled={
												isMarking
											}
											onClick={(
												e,
											) =>
												handleMarkDone(
													e,
													notif.id,
												)
											}
											className="shrink-0 mt-0.5 p-1 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground/70 transition-all cursor-pointer disabled:opacity-100"
											title="Mark as done"
										>
											{isMarking ? (
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
											) : (
												<Check className="w-3.5 h-3.5" />
											)}
										</button>
									</div>
								);
							})}
						</div>
					</div>
				))}

				{filtered.length === 0 && (
					<div className="py-16 text-center">
						<Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
						<p className="text-xs text-muted-foreground font-mono">
							{filter === "all"
								? "No notifications"
								: "No notifications in this category"}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
