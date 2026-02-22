"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	getReactionUsers,
	addReaction,
	removeReaction,
	getCurrentUser,
	type ReactionWithId,
	type ReactionContent,
} from "@/app/(app)/repos/[owner]/[repo]/reaction-actions";

export interface Reactions {
	"+1"?: number;
	"-1"?: number;
	laugh?: number;
	hooray?: number;
	confused?: number;
	heart?: number;
	rocket?: number;
	eyes?: number;
	total_count?: number;
	[key: string]: unknown;
}

const REACTION_EMOJI: [ReactionContent, string][] = [
	["+1", "👍"],
	["-1", "👎"],
	["laugh", "😄"],
	["hooray", "🎉"],
	["confused", "😕"],
	["heart", "❤️"],
	["rocket", "🚀"],
	["eyes", "👀"],
];

interface ReactionDisplayProps {
	reactions: Reactions;
	owner?: string;
	repo?: string;
	contentType?: "issue" | "issueComment" | "pullRequestReviewComment";
	contentId?: number;
	className?: string;
	interactive?: boolean;
}

// Portal-based tooltip that escapes overflow:hidden
function Tooltip({
	anchorRef,
	children,
}: {
	anchorRef: React.RefObject<HTMLElement | null>;
	children: React.ReactNode;
}) {
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useEffect(() => {
		const el = anchorRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		setPos({
			top: rect.top + window.scrollY - 4,
			left: rect.left + rect.width / 2 + window.scrollX,
		});
	}, [anchorRef]);

	if (!pos) return null;

	return createPortal(
		<div
			className="fixed z-[9999] pointer-events-none"
			style={{
				top: pos.top,
				left: pos.left,
				transform: "translate(-50%, -100%)",
			}}
		>
			{children}
		</div>,
		document.body,
	);
}

// Context menu for right-click "see all reactions"
function ReactionsContextMenu({
	x,
	y,
	entries,
	reactionUsers,
	onClose,
}: {
	x: number;
	y: number;
	entries: { key: string; emoji: string; count: number }[];
	reactionUsers: ReactionWithId[] | null;
	onClose: () => void;
}) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", handler);
		document.addEventListener("keydown", escHandler);
		return () => {
			document.removeEventListener("mousedown", handler);
			document.removeEventListener("keydown", escHandler);
		};
	}, [onClose]);

	// Clamp position to viewport
	const style: React.CSSProperties = {
		top: Math.min(y, window.innerHeight - 300),
		left: Math.min(x, window.innerWidth - 240),
	};

	return createPortal(
		<div
			ref={menuRef}
			className="fixed z-[9999] w-56 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
			style={style}
		>
			<div className="px-3 py-2 border-b border-border">
				<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Reactions
				</span>
			</div>
			{entries.map((r) => {
				const users = reactionUsers
					? reactionUsers.filter((u) => u.content === r.key)
					: [];
				return (
					<div
						key={r.key}
						className="px-3 py-1.5 border-b border-border/50 last:border-0"
					>
						<div className="flex items-center gap-2 mb-1">
							<span className="text-sm">{r.emoji}</span>
							<span className="text-[10px] font-mono text-muted-foreground">
								{r.count}
							</span>
						</div>
						{users.length > 0 ? (
							<div className="space-y-1">
								{users.map((u) => (
									<Link
										key={u.login}
										href={`/users/${u.login}`}
										onClick={onClose}
										className="flex items-center gap-1.5 hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors"
									>
										{u.avatar_url ? (
											<Image
												src={
													u.avatar_url
												}
												alt={
													u.login
												}
												width={
													14
												}
												height={
													14
												}
												className="rounded-full shrink-0"
											/>
										) : (
											<div className="w-3.5 h-3.5 rounded-full bg-muted-foreground shrink-0" />
										)}
										<span className="text-[11px] font-mono text-foreground/80 truncate">
											{u.login}
										</span>
									</Link>
								))}
							</div>
						) : (
							<span className="text-[10px] text-muted-foreground/50">
								Loading...
							</span>
						)}
					</div>
				);
			})}
		</div>,
		document.body,
	);
}

function ReactionPicker({
	anchorRef,
	onSelect,
	onClose,
	existingReactions,
}: {
	anchorRef: React.RefObject<HTMLElement | null>;
	onSelect: (content: ReactionContent) => void;
	onClose: () => void;
	existingReactions: Set<string>;
}) {
	const pickerRef = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useEffect(() => {
		const el = anchorRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const pickerWidth = 240;
		let left = rect.left + window.scrollX;
		if (left + pickerWidth > window.innerWidth) {
			left = window.innerWidth - pickerWidth - 8;
		}
		setPos({
			top: rect.bottom + window.scrollY + 4,
			left,
		});
	}, [anchorRef]);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const escHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", handler);
		document.addEventListener("keydown", escHandler);
		return () => {
			document.removeEventListener("mousedown", handler);
			document.removeEventListener("keydown", escHandler);
		};
	}, [onClose]);

	if (!pos) return null;

	return createPortal(
		<div
			ref={pickerRef}
			className="fixed z-[9999] bg-card border border-border rounded-lg shadow-xl p-2"
			style={{ top: pos.top, left: pos.left }}
		>
			<div className="flex gap-1">
				{REACTION_EMOJI.map(([key, emoji]) => {
					const hasReacted = existingReactions.has(key);
					return (
						<button
							key={key}
							type="button"
							onClick={() => onSelect(key)}
							className={cn(
								"w-8 h-8 flex items-center justify-center rounded-md text-base transition-all hover:bg-muted hover:scale-110",
								hasReacted &&
									"bg-primary/20 ring-1 ring-primary/40",
							)}
							title={
								hasReacted
									? `Remove ${key} reaction`
									: `React with ${key}`
							}
						>
							{emoji}
						</button>
					);
				})}
			</div>
		</div>,
		document.body,
	);
}

export function ReactionDisplay({
	reactions,
	owner,
	repo,
	contentType,
	contentId,
	className,
	interactive = true,
}: ReactionDisplayProps) {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [reactionUsers, setReactionUsers] = useState<ReactionWithId[] | null>(null);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const [showPicker, setShowPicker] = useState(false);
	const [currentUser, setCurrentUser] = useState<{
		login: string;
		avatar_url: string;
	} | null>(null);
	const [optimisticReactions, setOptimisticReactions] = useState<Reactions>(reactions);
	const [, startTransition] = useTransition();
	const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
	const hoveredRef = useRef<HTMLSpanElement | null>(null);
	const addButtonRef = useRef<HTMLButtonElement | null>(null);

	const canFetch = !!(owner && repo && contentType && contentId);
	const canInteract = interactive && canFetch;

	useEffect(() => {
		setOptimisticReactions(reactions);
	}, [reactions]);

	useEffect(() => {
		if (!canFetch) return;
		let cancelled = false;
		getReactionUsers(owner!, repo!, contentType!, contentId!).then((res) => {
			if (!cancelled) setReactionUsers(res.users);
		});
		return () => {
			cancelled = true;
		};
	}, [canFetch, owner, repo, contentType, contentId]);

	useEffect(() => {
		if (!canInteract) return;
		let cancelled = false;
		getCurrentUser().then((user) => {
			if (!cancelled) setCurrentUser(user);
		});
		return () => {
			cancelled = true;
		};
	}, [canInteract]);

	const handleMouseEnter = (key: string, el: HTMLSpanElement) => {
		hoverTimeout.current = setTimeout(() => {
			hoveredRef.current = el;
			setHoveredKey(key);
		}, 300);
	};

	const handleMouseLeave = () => {
		clearTimeout(hoverTimeout.current);
		setHoveredKey(null);
		hoveredRef.current = null;
	};

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY });
	}, []);

	const closeContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	const getUsersForReaction = (key: string): ReactionWithId[] => {
		if (!reactionUsers) return [];
		return reactionUsers.filter((u) => u.content === key);
	};

	const currentUserReactions = new Set(
		reactionUsers
			?.filter((u) => u.login === currentUser?.login)
			.map((u) => u.content) ?? [],
	);

	const handleToggleReaction = useCallback(
		async (content: ReactionContent) => {
			if (!canInteract || !currentUser) return;

			const existingReaction = reactionUsers?.find(
				(u) => u.login === currentUser.login && u.content === content,
			);

			if (existingReaction) {
				setOptimisticReactions((prev) => ({
					...prev,
					[content]: Math.max(
						0,
						((prev[content] as number) || 0) - 1,
					),
				}));
				setReactionUsers((prev) =>
					prev
						? prev.filter((u) => u.id !== existingReaction.id)
						: prev,
				);

				startTransition(async () => {
					const result = await removeReaction(
						owner!,
						repo!,
						contentType!,
						contentId!,
						existingReaction.id,
					);
					if (!result.success) {
						setOptimisticReactions((prev) => ({
							...prev,
							[content]:
								((prev[content] as number) || 0) +
								1,
						}));
						setReactionUsers((prev) =>
							prev
								? [...prev, existingReaction]
								: [existingReaction],
						);
					}
				});
			} else {
				setOptimisticReactions((prev) => ({
					...prev,
					[content]: ((prev[content] as number) || 0) + 1,
				}));

				startTransition(async () => {
					const result = await addReaction(
						owner!,
						repo!,
						contentType!,
						contentId!,
						content,
					);
					if (result.success && result.reactionId) {
						setReactionUsers((prev) => [
							...(prev ?? []),
							{
								id: result.reactionId!,
								login: currentUser.login,
								avatar_url: currentUser.avatar_url,
								content,
							},
						]);
					} else {
						setOptimisticReactions((prev) => ({
							...prev,
							[content]: Math.max(
								0,
								((prev[content] as number) || 0) -
									1,
							),
						}));
					}
				});
			}

			setShowPicker(false);
		},
		[canInteract, currentUser, reactionUsers, owner, repo, contentType, contentId],
	);

	const handleReactionClick = useCallback(
		(key: ReactionContent) => {
			if (!canInteract) return;
			handleToggleReaction(key);
		},
		[canInteract, handleToggleReaction],
	);

	const entries = REACTION_EMOJI.map(([key, emoji]) => ({
		key,
		emoji,
		count: (typeof optimisticReactions[key] === "number"
			? optimisticReactions[key]
			: 0) as number,
	})).filter((r) => r.count > 0);

	const showEmptyState = entries.length === 0 && !canInteract;
	if (showEmptyState) return null;

	return (
		<>
			<div
				className={cn("flex items-center gap-1 flex-wrap", className)}
				onContextMenu={handleContextMenu}
			>
				{entries.map((r) => {
					const isHovered = hoveredKey === r.key;
					const users = getUsersForReaction(r.key);
					const displayAvatars = users.slice(0, 3);
					const hasReacted = currentUserReactions.has(r.key);

					return (
						<span
							key={r.key}
							className={cn(
								"relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] select-none transition-colors",
								canInteract
									? "cursor-pointer hover:bg-muted/60"
									: "cursor-default",
								hasReacted
									? "border-primary/50 bg-primary/10"
									: "border-border bg-muted/40 dark:bg-white/[0.03]",
							)}
							onClick={() =>
								handleReactionClick(
									r.key as ReactionContent,
								)
							}
							onMouseEnter={(e) =>
								handleMouseEnter(
									r.key,
									e.currentTarget,
								)
							}
							onMouseLeave={handleMouseLeave}
						>
							<span>{r.emoji}</span>

							{displayAvatars.length > 0 && (
								<span className="inline-flex -space-x-1">
									{displayAvatars.map((u) =>
										u.avatar_url ? (
											<Image
												key={
													u.login
												}
												src={
													u.avatar_url
												}
												alt={
													u.login
												}
												width={
													12
												}
												height={
													12
												}
												className="rounded-full ring-1 ring-background shrink-0"
											/>
										) : (
											<span
												key={
													u.login
												}
												className="w-3 h-3 rounded-full bg-muted-foreground ring-1 ring-background shrink-0"
											/>
										),
									)}
								</span>
							)}

							<span
								className={cn(
									"font-mono text-[10px]",
									hasReacted
										? "text-primary"
										: "text-muted-foreground/70",
								)}
							>
								{r.count}
							</span>

							{isHovered && (
								<Tooltip anchorRef={hoveredRef}>
									<div className="bg-card text-foreground text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-border whitespace-nowrap max-w-[220px]">
										{users.length >
										0 ? (
											<span className="truncate block">
												{users
													.slice(
														0,
														10,
													)
													.map(
														(
															u,
														) =>
															u.login,
													)
													.join(
														", ",
													)}
												{users.length >
													10 &&
													` +${users.length - 10}`}
											</span>
										) : (
											<span>
												{
													r.emoji
												}{" "}
												{
													r.count
												}{" "}
												reaction
												{r.count !==
												1
													? "s"
													: ""}
											</span>
										)}
									</div>
								</Tooltip>
							)}
						</span>
					);
				})}

				{canInteract && (
					<button
						ref={addButtonRef}
						type="button"
						onClick={() => setShowPicker((v) => !v)}
						className={cn(
							"inline-flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-border text-muted-foreground/50 hover:text-muted-foreground hover:border-border/80 hover:bg-muted/40 transition-colors",
							showPicker &&
								"bg-muted/60 border-border/80 text-muted-foreground",
						)}
						title="Add reaction"
					>
						<SmilePlus className="w-3.5 h-3.5" />
					</button>
				)}
			</div>

			{showPicker && (
				<ReactionPicker
					anchorRef={addButtonRef}
					onSelect={handleToggleReaction}
					onClose={() => setShowPicker(false)}
					existingReactions={currentUserReactions}
				/>
			)}

			{contextMenu && (
				<ReactionsContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					entries={entries}
					reactionUsers={reactionUsers}
					onClose={closeContextMenu}
				/>
			)}
		</>
	);
}
