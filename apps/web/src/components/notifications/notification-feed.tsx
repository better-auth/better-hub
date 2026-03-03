"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { Bell, Check, Loader2, X } from "lucide-react";
import type { NotificationEnrichedItem } from "@/lib/github-types";
import { markAllNotificationsRead, markNotificationDone } from "@/app/(app)/repos/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { NotificationRow } from "@/components/notifications/notification-row";
import { NotificationUndoBar } from "@/components/notifications/notification-undo-bar";
import { cn } from "@/lib/utils";

const notificationTabs = ["all", "unread", "mentions", "ci", "muted"] as const;
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

const MUTED_STORAGE_KEY = "better-hub-muted-notification-ids";

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
	const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
	const [markingId, setMarkingId] = useState<string | null>(null);
	const [markingAll, startMarkAll] = useTransition();
	const [isBulkWorking, startBulkWork] = useTransition();
	const [errorText, setErrorText] = useState<string | null>(null);
	const [secondsLeft, setSecondsLeft] = useState(5);
	const [selectMode, setSelectMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
	const [tabIsSwitching, setTabIsSwitching] = useState(false);

	const pendingRef = useRef<{
		id: string;
		timer: ReturnType<typeof setTimeout>;
		tickTimer: ReturnType<typeof setInterval>;
		expiresAt: number;
	} | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const tabScrollByKey = useRef<Record<NotificationTab, number>>({
		all: 0,
		unread: 0,
		mentions: 0,
		ci: 0,
		muted: 0,
	});

	const [queryTab, setQueryTab] = useQueryState(
		"notifTab",
		parseAsStringLiteral(notificationTabs).withDefault("all"),
	);
	const [localTab, setLocalTab] = useState<NotificationTab>("all");
	const tab = persistTabInQuery ? queryTab : localTab;
	const setTab = persistTabInQuery ? setQueryTab : setLocalTab;
	const previousTabRef = useRef<NotificationTab>(tab);

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
		if (typeof window === "undefined") return;
		try {
			const raw = window.localStorage.getItem(MUTED_STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as string[];
			setMutedIds(new Set(parsed));
		} catch {
			// ignore malformed local storage
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(MUTED_STORAGE_KEY, JSON.stringify([...mutedIds]));
	}, [mutedIds]);

	useEffect(() => {
		return () => {
			if (!pendingRef.current) return;
			clearTimeout(pendingRef.current.timer);
			clearInterval(pendingRef.current.tickTimer);
		};
	}, []);

	useEffect(() => {
		const prev = previousTabRef.current;
		if (prev !== tab && scrollRef.current) {
			tabScrollByKey.current[prev] = scrollRef.current.scrollTop;
			setTabIsSwitching(true);
			requestAnimationFrame(() => {
				if (scrollRef.current) {
					scrollRef.current.scrollTop =
						tabScrollByKey.current[tab] ?? 0;
				}
				setTimeout(() => setTabIsSwitching(false), 120);
			});
			previousTabRef.current = tab;
		}
	}, [tab]);

	const activeItems = useMemo(
		() =>
			items
				.filter((item) => !doneIds.has(item.id))
				.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
		[items, doneIds],
	);
	const visibleItems = useMemo(
		() => activeItems.filter((item) => !mutedIds.has(item.id)),
		[activeItems, mutedIds],
	);
	const mutedItems = useMemo(
		() => activeItems.filter((item) => mutedIds.has(item.id)),
		[activeItems, mutedIds],
	);

	const filteredItems = useMemo(() => {
		if (tab === "muted") return mutedItems;
		if (tab === "unread") return visibleItems.filter((item) => item.unread);
		if (tab === "mentions") {
			return visibleItems.filter(
				(item) =>
					item.reason === "mention" || item.reason === "team_mention",
			);
		}
		if (tab === "ci") {
			return visibleItems.filter(
				(item) => item.reason === "ci_activity" || !!item.ci,
			);
		}
		return visibleItems;
	}, [tab, visibleItems, mutedItems]);

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
	const mentionCount = visibleItems.filter(
		(item) => item.reason === "mention" || item.reason === "team_mention",
	).length;
	const ciCount = visibleItems.filter(
		(item) => item.reason === "ci_activity" || !!item.ci,
	).length;
	const mutedCount = mutedItems.length;

	useEffect(() => {
		if (tab === "muted" && mutedCount === 0) {
			setTab("all");
		}
	}, [tab, mutedCount, setTab]);

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

	function animateDismiss(id: string, onCommit: () => Promise<void> | void) {
		setDismissingIds((prev) => new Set([...prev, id]));
		setTimeout(async () => {
			setDoneIds((prev) => new Set([...prev, id]));
			setDismissingIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			await onCommit();
		}, 150);
	}

	function handleToggleMute(id: string) {
		setMutedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}

	async function handleMarkRead(id: string) {
		setMarkingId(id);
		setErrorText(null);
		animateDismiss(id, async () => {
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
		});
	}

	function toggleSelect(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function clearSelection() {
		setSelectedIds(new Set());
	}

	async function handleBulkMarkRead() {
		if (selectedIds.size === 0) return;
		const ids = [...selectedIds];
		const previousDone = new Set(doneIds);
		setErrorText(null);
		setDoneIds((prev) => new Set([...prev, ...ids]));
		clearSelection();
		startBulkWork(async () => {
			const results = await Promise.all(
				ids.map((id) => markNotificationDone(id)),
			);
			const failedIds: string[] = [];
			for (let i = 0; i < ids.length; i++) {
				if (results[i]?.success) {
					emit({ type: "notification:read", id: ids[i] });
				} else {
					failedIds.push(ids[i]);
				}
			}
			if (failedIds.length > 0) {
				setDoneIds(previousDone);
				setErrorText("Failed to mark one or more notifications as read");
			}
		});
	}

	function handleBulkMuteToggle() {
		if (selectedIds.size === 0) return;
		setMutedIds((prev) => {
			const next = new Set(prev);
			for (const id of selectedIds) {
				if (tab === "muted") {
					next.delete(id);
				} else {
					next.add(id);
				}
			}
			return next;
		});
		clearSelection();
	}

	const markAllSourceItems = tab === "muted" ? mutedItems : visibleItems;
	const markAllUnreadIds = markAllSourceItems
		.filter((item) => item.unread)
		.map((item) => item.id);
	const canMarkAllRead = markAllUnreadIds.length > 0;

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col", className)}>
			<div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
				<div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
					{(
						[
							["all", "All"],
							["unread", "Unread"],
							["mentions", "Mentions"],
							["ci", "CI"],
						] as const
					).map(([value, label]) => {
						const count =
							value === "all"
								? visibleItems.length
								: value === "unread"
									? unreadCount
									: value === "mentions"
										? mentionCount
										: ciCount;

						return (
							<button
								key={value}
								type="button"
								onClick={() => setTab(value)}
								className={cn(
									"inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors",
									tab === value
										? "bg-muted text-foreground"
										: "text-muted-foreground/80 hover:bg-muted/35 hover:text-foreground/85",
								)}
							>
								{label}
								<span
									className={cn(
										"rounded-sm px-1 py-px text-[9px] tabular-nums",
										tab === value
											? "bg-background/70 text-foreground/80"
											: "bg-muted text-muted-foreground/90",
									)}
								>
									{count}
								</span>
							</button>
						);
					})}
				</div>
				<div className="flex items-center gap-2">
					{mutedCount > 0 && (
						<>
							<span className="h-4 w-px shrink-0 bg-border/70" />
							<button
								type="button"
								onClick={() => setTab("muted")}
								className={cn(
									"inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors",
									tab === "muted"
										? "bg-muted text-foreground"
										: "text-muted-foreground/80 hover:bg-muted/35 hover:text-foreground/85",
								)}
							>
								Muted
								<span
									className={cn(
										"rounded-sm px-1 py-px text-[9px] tabular-nums",
										tab === "muted"
											? "bg-background/70 text-foreground/80"
											: "bg-muted text-muted-foreground/90",
									)}
								>
									{mutedCount}
								</span>
							</button>
						</>
					)}
					{selectMode && selectedIds.size > 0 ? (
						<>
							<button
								type="button"
								onClick={handleBulkMarkRead}
								disabled={isBulkWorking}
								className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/35 px-2 text-[10px] font-mono uppercase tracking-wide text-foreground/85 hover:border-foreground/30 hover:bg-muted/55 hover:text-foreground disabled:opacity-40"
							>
								{isBulkWorking ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<Check className="h-3 w-3" />
								)}
								Mark read
							</button>
							<button
								type="button"
								onClick={handleBulkMuteToggle}
								className="inline-flex h-7 items-center rounded-md border border-border bg-muted/35 px-2 text-[10px] font-mono uppercase tracking-wide text-foreground/85 hover:border-foreground/30 hover:bg-muted/55 hover:text-foreground"
							>
								{tab === "muted"
									? "Unmute"
									: "Mute"}
							</button>
							<button
								type="button"
								onClick={clearSelection}
								className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-mono uppercase tracking-wide text-muted-foreground/80 hover:text-foreground/90"
							>
								<X className="h-3 w-3" />
								Clear
							</button>
							<button
								type="button"
								onClick={() => {
									setSelectMode(
										(prev) => !prev,
									);
									setSelectedIds(new Set());
								}}
								className={cn(
									"inline-flex h-7 items-center rounded-md px-1.5 text-[10px] font-mono uppercase tracking-wide transition-colors",
									selectMode
										? "text-foreground"
										: "text-muted-foreground/70 hover:text-foreground/90",
								)}
							>
								Select
							</button>
						</>
					) : (
						<>
							<button
								type="button"
								disabled={
									markingAll ||
									!canMarkAllRead
								}
								onClick={() => {
									setErrorText(null);
									const previous = new Set(
										doneIds,
									);
									const ids =
										markAllUnreadIds;
									setDoneIds(
										new Set([
											...doneIds,
											...ids,
										]),
									);
									startMarkAll(async () => {
										const res =
											await markAllNotificationsRead();
										if (res.success) {
											emit({
												type: "notification:all-read",
												ids,
											});
										} else {
											setDoneIds(
												previous,
											);
											setErrorText(
												res.error ??
													"Failed to mark all notifications as read",
											);
										}
									});
								}}
								className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/35 px-2 text-[10px] font-mono uppercase tracking-wide text-foreground/90 hover:border-foreground/30 hover:bg-muted/55 hover:text-foreground disabled:border-border/60 disabled:text-muted-foreground/55 disabled:opacity-100"
							>
								{markingAll ? (
									<Loader2 className="h-3 w-3 animate-spin" />
								) : (
									<Check className="h-3 w-3" />
								)}
								Mark all read
							</button>
							<button
								type="button"
								onClick={() => {
									setSelectMode(
										(prev) => !prev,
									);
									setSelectedIds(new Set());
								}}
								className={cn(
									"inline-flex h-7 items-center rounded-md px-1.5 text-[10px] font-mono uppercase tracking-wide transition-colors",
									selectMode
										? "text-foreground"
										: "text-muted-foreground/70 hover:text-foreground/90",
								)}
							>
								Select
							</button>
						</>
					)}
				</div>
			</div>

			<div
				ref={scrollRef}
				onScroll={() => {
					if (!scrollRef.current) return;
					tabScrollByKey.current[tab] = scrollRef.current.scrollTop;
				}}
				className={cn(
					"min-h-0 flex-1 overflow-y-auto transition-opacity duration-150",
					tabIsSwitching ? "opacity-80" : "opacity-100",
				)}
			>
				{errorText && (
					<div className="border-b border-border bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
						{errorText}
					</div>
				)}
				<div className="space-y-3 px-3 py-3">
					{(["Today", "Yesterday", "Earlier"] as GroupKey[]).map(
						(groupKey) => {
							const rows = grouped[groupKey];
							if (rows.length === 0) return null;
							return (
								<section
									key={groupKey}
									className="rounded-md bg-background/40"
								>
									<div className="sticky top-0 z-10 bg-background/95 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.12em] text-muted-foreground/80 backdrop-blur">
										{groupKey}
									</div>
									<div className="space-y-0.5">
										{rows.map(
											(item) => (
												<NotificationRow
													key={
														item.id
													}
													item={
														item
													}
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
													isSelected={selectedIds.has(
														item.id,
													)}
													isSelectMode={
														selectMode
													}
													isDismissing={dismissingIds.has(
														item.id,
													)}
													isMuted={mutedIds.has(
														item.id,
													)}
													onMarkRead={
														handleMarkRead
													}
													onToggleMute={
														handleToggleMute
													}
													onToggleSelect={
														toggleSelect
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
											),
										)}
									</div>
								</section>
							);
						},
					)}
				</div>
				{filteredItems.length === 0 && (
					<div className="px-4 py-16 text-center">
						<Bell className="mx-auto mb-3 h-6 w-6 text-muted-foreground/30" />
						<p className="text-xs font-mono text-muted-foreground">
							All caught up.
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
