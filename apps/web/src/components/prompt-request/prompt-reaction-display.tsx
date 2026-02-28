"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { togglePromptReaction } from "@/app/(app)/repos/[owner]/[repo]/prompts/actions";
import type { PromptRequestReaction, PromptReactionContent } from "@/lib/prompt-request-store";

const REACTION_EMOJI: [PromptReactionContent, string][] = [
	["+1", "👍"],
	["-1", "👎"],
	["laugh", "😄"],
	["hooray", "🎉"],
	["confused", "😕"],
	["heart", "❤️"],
	["rocket", "🚀"],
	["eyes", "👀"],
];

interface PromptReactionDisplayProps {
	promptRequestId: string;
	reactions: PromptRequestReaction[];
	currentUserId: string | null;
	className?: string;
}

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

function ReactionPicker({
	anchorRef,
	onSelect,
	onClose,
	existingReactions,
}: {
	anchorRef: React.RefObject<HTMLElement | null>;
	onSelect: (content: PromptReactionContent) => void;
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

export function PromptReactionDisplay({
	promptRequestId,
	reactions,
	currentUserId,
	className,
}: PromptReactionDisplayProps) {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);
	const [showPicker, setShowPicker] = useState(false);
	const [optimisticReactions, setOptimisticReactions] =
		useState<PromptRequestReaction[]>(reactions);
	const [, startTransition] = useTransition();
	const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
	const hoveredRef = useRef<HTMLSpanElement | null>(null);
	const addButtonRef = useRef<HTMLButtonElement | null>(null);

	const canInteract = !!currentUserId;

	useEffect(() => {
		setOptimisticReactions(reactions);
	}, [reactions]);

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

	const currentUserReactions = new Set(
		optimisticReactions.filter((r) => r.userId === currentUserId).map((r) => r.content),
	);

	const handleToggleReaction = useCallback(
		async (content: PromptReactionContent) => {
			if (!canInteract || !currentUserId) return;

			const existingReaction = optimisticReactions.find(
				(r) => r.userId === currentUserId && r.content === content,
			);

			if (existingReaction) {
				setOptimisticReactions((prev) =>
					prev.filter((r) => r.id !== existingReaction.id),
				);
			} else {
				const tempReaction: PromptRequestReaction = {
					id: `optimistic-${Date.now()}`,
					promptRequestId,
					userId: currentUserId,
					userLogin: null,
					userName: "You",
					userAvatarUrl: "",
					content,
					createdAt: new Date().toISOString(),
				};
				setOptimisticReactions((prev) => [...prev, tempReaction]);
			}

			startTransition(async () => {
				try {
					await togglePromptReaction(promptRequestId, content);
				} catch {
					setOptimisticReactions(reactions);
				}
			});

			setShowPicker(false);
		},
		[canInteract, currentUserId, optimisticReactions, promptRequestId, reactions],
	);

	const reactionCounts = REACTION_EMOJI.map(([key, emoji]) => {
		const count = optimisticReactions.filter((r) => r.content === key).length;
		const users = optimisticReactions.filter((r) => r.content === key);
		return { key, emoji, count, users };
	}).filter((r) => r.count > 0);

	return (
		<>
			<div className={cn("flex items-center gap-1 flex-wrap", className)}>
				{reactionCounts.map((r) => {
					const isHovered = hoveredKey === r.key;
					const displayAvatars = r.users.slice(0, 3);
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
								canInteract &&
								handleToggleReaction(
									r.key as PromptReactionContent,
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
										u.userAvatarUrl ? (
											<Image
												key={
													u.id
												}
												src={
													u.userAvatarUrl
												}
												alt={
													u.userName
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
													u.id
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
										{r.users.length >
										0 ? (
											<span className="truncate block">
												{r.users
													.slice(
														0,
														10,
													)
													.map(
														(
															u,
														) =>
															u.userLogin ||
															u.userName,
													)
													.join(
														", ",
													)}
												{r
													.users
													.length >
													10 &&
													` +${r.users.length - 10}`}
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
		</>
	);
}
