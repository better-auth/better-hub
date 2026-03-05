"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { SmilePlus, ArrowBigUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	addDiscussionReactionAction,
	removeDiscussionReactionAction,
	toggleDiscussionCommentUpvoteAction,
	getCurrentUser,
	type DiscussionReactionContentType,
} from "@/app/(app)/repos/[owner]/[repo]/discussions/discussion-actions";

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

const REACTION_EMOJI: [DiscussionReactionContentType, string][] = [
	["+1", "👍"],
	["-1", "👎"],
	["laugh", "😄"],
	["hooray", "🎉"],
	["confused", "😕"],
	["heart", "❤️"],
	["rocket", "🚀"],
	["eyes", "👀"],
];

interface DiscussionReactionDisplayProps {
	reactions?: Reactions;
	subjectId: string;
	upvoteCount?: number;
	viewerHasUpvoted?: boolean;
	showUpvote?: boolean;
	className?: string;
}

function ReactionPicker({
	anchorRef,
	onSelect,
	onClose,
	existingReactions,
}: {
	anchorRef: React.RefObject<HTMLElement | null>;
	onSelect: (content: DiscussionReactionContentType) => void;
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

export function DiscussionReactionDisplay({
	reactions,
	subjectId,
	upvoteCount = 0,
	viewerHasUpvoted = false,
	showUpvote = false,
	className,
}: DiscussionReactionDisplayProps) {
	const [showPicker, setShowPicker] = useState(false);
	const [currentUser, setCurrentUser] = useState<{
		login: string;
		avatar_url: string;
	} | null>(null);
	const [optimisticReactions, setOptimisticReactions] = useState<Reactions>(reactions ?? {});
	const [userReactions, setUserReactions] = useState<Set<string>>(new Set());
	const [optimisticUpvoteCount, setOptimisticUpvoteCount] = useState(upvoteCount);
	const [optimisticHasUpvoted, setOptimisticHasUpvoted] = useState(viewerHasUpvoted);
	const [, startTransition] = useTransition();
	const addButtonRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		setOptimisticReactions(reactions ?? {});
	}, [reactions]);

	useEffect(() => {
		setOptimisticUpvoteCount(upvoteCount);
		setOptimisticHasUpvoted(viewerHasUpvoted);
	}, [upvoteCount, viewerHasUpvoted]);

	useEffect(() => {
		let cancelled = false;
		getCurrentUser().then((user) => {
			if (!cancelled) setCurrentUser(user);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleToggleReaction = useCallback(
		async (content: DiscussionReactionContentType) => {
			if (!currentUser) return;

			const hasReacted = userReactions.has(content);

			if (hasReacted) {
				setOptimisticReactions((prev) => ({
					...prev,
					[content]: Math.max(
						0,
						((prev[content] as number) || 0) - 1,
					),
				}));
				setUserReactions((prev) => {
					const next = new Set(prev);
					next.delete(content);
					return next;
				});

				startTransition(async () => {
					const result = await removeDiscussionReactionAction(
						subjectId,
						content,
					);
					if (!result.success) {
						setOptimisticReactions((prev) => ({
							...prev,
							[content]:
								((prev[content] as number) || 0) +
								1,
						}));
						setUserReactions((prev) =>
							new Set(prev).add(content),
						);
					}
				});
			} else {
				setOptimisticReactions((prev) => ({
					...prev,
					[content]: ((prev[content] as number) || 0) + 1,
				}));
				setUserReactions((prev) => new Set(prev).add(content));

				startTransition(async () => {
					const result = await addDiscussionReactionAction(
						subjectId,
						content,
					);
					if (!result.success) {
						setOptimisticReactions((prev) => ({
							...prev,
							[content]: Math.max(
								0,
								((prev[content] as number) || 0) -
									1,
							),
						}));
						setUserReactions((prev) => {
							const next = new Set(prev);
							next.delete(content);
							return next;
						});
					}
				});
			}

			setShowPicker(false);
		},
		[currentUser, userReactions, subjectId],
	);

	const handleToggleUpvote = useCallback(async () => {
		if (!currentUser) return;

		const wasUpvoted = optimisticHasUpvoted;
		setOptimisticHasUpvoted(!wasUpvoted);
		setOptimisticUpvoteCount((prev) => prev + (wasUpvoted ? -1 : 1));

		startTransition(async () => {
			const result = await toggleDiscussionCommentUpvoteAction(
				subjectId,
				wasUpvoted,
			);
			if (!result.success) {
				setOptimisticHasUpvoted(wasUpvoted);
				setOptimisticUpvoteCount((prev) => prev + (wasUpvoted ? 1 : -1));
			} else if (result.upvoteCount !== undefined) {
				setOptimisticUpvoteCount(result.upvoteCount);
				setOptimisticHasUpvoted(result.viewerHasUpvoted ?? !wasUpvoted);
			}
		});
	}, [currentUser, optimisticHasUpvoted, subjectId]);

	const handleReactionClick = useCallback(
		(key: DiscussionReactionContentType) => {
			if (!currentUser) return;
			handleToggleReaction(key);
		},
		[currentUser, handleToggleReaction],
	);

	const entries = REACTION_EMOJI.map(([key, emoji]) => ({
		key,
		emoji,
		count: (typeof optimisticReactions[key] === "number"
			? optimisticReactions[key]
			: 0) as number,
	})).filter((r) => r.count > 0);

	const canInteract = !!currentUser;
	const showEmptyState = entries.length === 0 && !canInteract && !showUpvote;
	if (showEmptyState) return null;

	return (
		<>
			<div className={cn("flex items-center gap-1 flex-wrap", className)}>
				{entries.map((r) => {
					const hasReacted = userReactions.has(r.key);

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
							onClick={() => handleReactionClick(r.key)}
						>
							<span>{r.emoji}</span>
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
						</span>
					);
				})}

				{showUpvote && (
					<button
						type="button"
						onClick={handleToggleUpvote}
						disabled={!canInteract}
						className={cn(
							"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] select-none transition-colors",
							canInteract
								? "cursor-pointer hover:bg-muted/60"
								: "cursor-default",
							optimisticHasUpvoted
								? "border-primary/50 bg-primary/10"
								: "border-border bg-muted/40 dark:bg-white/[0.03]",
						)}
						title={
							optimisticHasUpvoted
								? "Remove upvote"
								: "Upvote this comment"
						}
					>
						<ArrowBigUp
							className={cn(
								"w-3.5 h-3.5",
								optimisticHasUpvoted
									? "text-primary fill-primary"
									: "text-muted-foreground/70",
							)}
						/>
						{optimisticUpvoteCount > 0 && (
							<span
								className={cn(
									"font-mono text-[10px]",
									optimisticHasUpvoted
										? "text-primary"
										: "text-muted-foreground/70",
								)}
							>
								{optimisticUpvoteCount}
							</span>
						)}
					</button>
				)}

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
					existingReactions={userReactions}
				/>
			)}
		</>
	);
}
