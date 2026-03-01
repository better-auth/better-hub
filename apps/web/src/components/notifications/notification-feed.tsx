"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { Bell, Check, Loader2 } from "lucide-react";
import type { NotificationEnrichedItem } from "@/lib/github-types";
import { markAllNotificationsRead, markNotificationDone } from "@/app/(app)/repos/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { NotificationRow } from "@/components/notifications/notification-row";
import { NotificationUndoBar } from "@/components/notifications/notification-undo-bar";
import { cn } from "@/lib/utils";

const notificationTabs = ["all", "unread", "mentions", "ci"] as const;
type NotificationTab = (typeof notificationTabs)[number];

type GroupKey = "Today" | "Yesterday" | "Earlier";

function toDayBucket(dateStr: string): GroupKey {
	const now = new Date();
	const date = new Date(dateStr);
	const nowY = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const dateY = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	const diffDays = Math.floor((nowY - dateY) / 86400000);
	if (diffDays <= 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	return "Earlier";
}

export function NotificationFeed({
	items,
	className,
	persistTabInQuery = true,
	onOpenItem,
}: {
	items: NotificationEnrichedItem[];
	className?: string;
	persistTabInQuery?: boolean;
	onOpenItem?: () => void;
}) {
	const { emit, subscribe } = useMutationEvents();
	const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
	const [markingId, setMarkingId] = useState<string | null>(null);
	const [markingAll, startMarkAll] = useTransition();
	const [errorText, setErrorText] = useState<string | null>(null);
	const [secondsLeft, setSecondsLeft] = useState(5);
	const pendingRef = useRef<{
		id: string;
		timer: ReturnType<typeof setTimeout>;
		tickTimer: ReturnType<typeof setInterval>;
		expiresAt: number;
	} | null>(null);

	const [queryTab, setQueryTab] = useQueryState(
		"notifTab",
		parseAsStringLiteral(notificationTabs).withDefault("all"),
	);
	const [localTab, setLocalTab] = useState<NotificationTab>("all");
	const tab = persistTabInQuery ? queryTab : localTab;
	const setTab = persistTabInQuery ? setQueryTab : setLocalTab;

	useEffect(() => {
		return subscribe((event) => {
			if (event.type === "notification:read") {
				setDoneIds((prev) => new Set([...prev, event.id]));
			}
			if (event.type === "notification:all-read") {
				setDoneIds((prev) => new Set([...prev, ...event.ids]));
			}
		});
	}, [subscribe]);

	useEffect(() => {
		return () => {
			if (!pendingRef.current) return;
			clearTimeout(pendingRef.current.timer);
			clearInterval(pendingRef.current.tickTimer);
		};
	}, []);

	const visibleItems = useMemo(
		() =>
			items
				.filter((item) => !doneIds.has(item.id))
				.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
		[items, doneIds],
	);

	const filteredItems = useMemo(() => {
		if (tab === "unread") return visibleItems.filter((item) => item.unread);
		if (tab === "mentions")
			return visibleItems.filter(
				(item) =>
					item.reason === "mention" || item.reason === "team_mention",
			);
		if (tab === "ci")
			return visibleItems.filter(
				(item) => item.reason === "ci_activity" || !!item.ci,
			);
		return visibleItems;
	}, [tab, visibleItems]);

	const grouped = useMemo(() => {
		const output: Record<GroupKey, NotificationEnrichedItem[]> = {
			Today: [],
			Yesterday: [],
			Earlier: [],
		};
		for (const item of filteredItems) {
			output[toDayBucket(item.updatedAt)].push(item);
		}
		return output;
	}, [filteredItems]);

	const unreadCount = visibleItems.filter((item) => item.unread).length;

	async function commitRead(id: string) {
		const res = await markNotificationDone(id);
		if (res.success) {
			emit({ type: "notification:read", id });
			return;
		}
		setDoneIds((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
		setErrorText(res.error ?? "Failed to mark notification as read");
	}

	function clearPending() {
		if (!pendingRef.current) return;
		clearTimeout(pendingRef.current.timer);
		clearInterval(pendingRef.current.tickTimer);
		pendingRef.current = null;
		setSecondsLeft(5);
	}

	function beginUndoWindow(id: string) {
		clearPending();
		setDoneIds((prev) => new Set([...prev, id]));
		setSecondsLeft(5);
		const expiresAt = Date.now() + 5000;
		const tickTimer = setInterval(() => {
			const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
			setSecondsLeft(left);
		}, 200);
		const timer = setTimeout(async () => {
			clearPending();
			await commitRead(id);
		}, 5000);
		pendingRef.current = { id, timer, tickTimer, expiresAt };
	}

	function handleUndo() {
		if (!pendingRef.current) return;
		const { id } = pendingRef.current;
		clearPending();
		setDoneIds((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}

	async function handleMarkRead(id: string) {
		setMarkingId(id);
		setDoneIds((prev) => new Set([...prev, id]));
		const res = await markNotificationDone(id);
		if (res.success) {
			emit({ type: "notification:read", id });
		} else {
			setDoneIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			setErrorText(res.error ?? "Failed to mark notification as read");
		}
		setMarkingId(null);
	}

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			<div className="flex items-center justify-between border-b border-border px-3 py-2">
				<div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
					{(
						[
							["all", "All"],
							["unread", "Unread"],
							["mentions", "Mentions"],
							["ci", "CI"],
						] as const
					).map(([value, label]) => (
						<button
							key={value}
							type="button"
							onClick={() => setTab(value)}
							className={cn(
								"rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-wide",
								tab === value
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</div>
				<button
					type="button"
					disabled={markingAll || unreadCount === 0}
					onClick={() => {
						setErrorText(null);
						const previous = new Set(doneIds);
						const ids = items.map((item) => item.id);
						setDoneIds(new Set(ids));
						startMarkAll(async () => {
							const res =
								await markAllNotificationsRead();
							if (res.success) {
								emit({
									type: "notification:all-read",
									ids,
								});
							} else {
								setDoneIds(previous);
								setErrorText(
									res.error ??
										"Failed to mark all notifications as read",
								);
							}
						});
					}}
					className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground disabled:opacity-40"
				>
					{markingAll ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<Check className="h-3 w-3" />
					)}
					Mark all read
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{errorText && (
					<div className="border-b border-border bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
						{errorText}
					</div>
				)}
				{(["Today", "Yesterday", "Earlier"] as GroupKey[]).map(
					(groupKey) => {
						const rows = grouped[groupKey];
						if (rows.length === 0) return null;
						return (
							<section key={groupKey}>
								<div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-muted-foreground backdrop-blur">
									{groupKey}
								</div>
								{rows.map((item) => (
									<NotificationRow
										key={item.id}
										item={item}
										isUnread={
											item.unread &&
											!doneIds.has(
												item.id,
											)
										}
										isMarking={
											markingId ===
											item.id
										}
										onMarkRead={
											handleMarkRead
										}
										onOpen={(
											opened,
										) => {
											setErrorText(
												null,
											);
											if (
												opened.unread &&
												!doneIds.has(
													opened.id,
												)
											) {
												beginUndoWindow(
													opened.id,
												);
											}
											onOpenItem?.();
										}}
									/>
								))}
							</section>
						);
					},
				)}
				{filteredItems.length === 0 && (
					<div className="px-4 py-16 text-center">
						<Bell className="mx-auto mb-3 h-6 w-6 text-muted-foreground/30" />
						<p className="text-xs font-mono text-muted-foreground">
							No notifications in this view
						</p>
					</div>
				)}
			</div>

			{pendingRef.current && (
				<NotificationUndoBar
					onUndo={handleUndo}
					secondsLeft={secondsLeft}
				/>
			)}
		</div>
	);
}
