"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle, MessageSquare, Loader2, ChevronDown, Eye } from "lucide-react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/use-click-outside";
import {
	submitPRReview,
	type ReviewEvent,
} from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface PRReviewFormProps {
	owner: string;
	repo: string;
	pullNumber: number;
	participants?: Array<{ login: string; avatar_url: string }>;
}

const reviewOptions: {
	key: ReviewEvent;
	label: string;
	desc: string;
	icon: typeof Check;
	accent: string;
}[] = [
	{
		key: "COMMENT",
		label: "Comment",
		desc: "General feedback without explicit approval.",
		icon: MessageSquare,
		accent: "text-foreground",
	},
	{
		key: "APPROVE",
		label: "Approve",
		desc: "Approve merging these changes.",
		icon: Check,
		accent: "text-success",
	},
	{
		key: "REQUEST_CHANGES",
		label: "Request changes",
		desc: "Changes must be addressed before merging.",
		icon: AlertTriangle,
		accent: "text-warning",
	},
];

export function PRReviewForm({ owner, repo, pullNumber, participants }: PRReviewFormProps) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [open, setOpen] = useState(false);
	const [body, setBody] = useState("");
	const [selected, setSelected] = useState<ReviewEvent>("COMMENT");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	useClickOutside(
		panelRef,
		useCallback(() => setOpen(false), []),
	);

	const handleSubmit = () => {
		if (selected === "REQUEST_CHANGES" && !body.trim()) return;
		setError(null);
		startTransition(async () => {
			const res = await submitPRReview(
				owner,
				repo,
				pullNumber,
				selected,
				body.trim() || undefined,
			);
			if (res.error) {
				setError(res.error);
			} else {
				setBody("");
				setSelected("COMMENT");
				setOpen(false);
				emit({ type: "pr:reviewed", owner, repo, number: pullNumber });
				router.refresh();
			}
		});
	};

	return (
		<div ref={panelRef} className="relative">
			<button
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"flex items-center gap-1.5 px-3 py-1.5 text-xs",
					"border border-border",
					"text-foreground/80 hover:text-foreground hover:bg-muted",
					"transition-all cursor-pointer",
					open && "bg-muted",
				)}
			>
				<Eye className="w-3.5 h-3.5" />
				Review
				<ChevronDown
					className={cn(
						"w-3 h-3 text-muted-foreground/50 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div className="absolute top-full right-0 mt-1.5 w-96 z-50 border border-border bg-background shadow-lg dark:shadow-2xl">
					{/* Toolbar + Textarea */}
					<div className="p-3 pb-2">
						<MarkdownEditor
							value={body}
							onChange={setBody}
							placeholder="Leave a comment"
							rows={4}
							autoFocus
							participants={participants}
							owner={owner}
							onKeyDown={(e) => {
								if (
									e.key === "Enter" &&
									(e.metaKey || e.ctrlKey)
								) {
									e.preventDefault();
									handleSubmit();
								}
								if (e.key === "Escape") {
									setOpen(false);
								}
							}}
						/>
					</div>

					{/* Review type options */}
					<div className="px-3 pb-2 space-y-px">
						{reviewOptions.map(
							({
								key,
								label,
								desc,
								icon: Icon,
								accent,
							}) => {
								const isSelected = selected === key;
								const isDisabled =
									key === "REQUEST_CHANGES" &&
									!body.trim() &&
									!isSelected;

								return (
									<button
										key={key}
										onClick={() =>
											!isDisabled &&
											setSelected(
												key,
											)
										}
										disabled={
											isDisabled
										}
										className={cn(
											"w-full flex items-start gap-2.5 px-2 py-2 text-left transition-colors cursor-pointer rounded-sm",
											isSelected
												? "bg-muted/60 dark:bg-white/[0.04]"
												: "hover:bg-muted/40 dark:hover:bg-white/[0.02]",
											"disabled:opacity-30 disabled:cursor-not-allowed",
										)}
									>
										{/* Radio */}
										<div
											className={cn(
												"mt-0.5 w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
												isSelected
													? "border-foreground/70"
													: "border-muted-foreground/30",
											)}
										>
											{isSelected && (
												<div className="w-2 h-2 rounded-full bg-foreground/80" />
											)}
										</div>

										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-1.5">
												<Icon
													className={cn(
														"w-3.5 h-3.5",
														accent,
													)}
												/>
												<span
													className={cn(
														"text-xs font-medium",
														isSelected
															? "text-foreground"
															: "text-foreground/70",
													)}
												>
													{
														label
													}
												</span>
											</div>
											<p className="text-[11px] text-muted-foreground/50 mt-0.5 leading-snug">
												{
													desc
												}
											</p>
										</div>
									</button>
								);
							},
						)}
					</div>

					{/* Error */}
					{error && (
						<div className="px-3 pb-2">
							<p className="text-[11px] text-destructive">
								{error}
							</p>
						</div>
					)}

					{/* Footer */}
					<div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-border">
						<button
							onClick={() => setOpen(false)}
							className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							onClick={handleSubmit}
							disabled={
								isPending ||
								(selected === "REQUEST_CHANGES" &&
									!body.trim())
							}
							className={cn(
								"flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider",
								"bg-foreground text-background hover:bg-foreground/90",
								"transition-colors cursor-pointer",
								"disabled:opacity-40 disabled:cursor-not-allowed",
							)}
						>
							{isPending && (
								<Loader2 className="w-3 h-3 animate-spin" />
							)}
							Submit review
							{!isPending && (
								<kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-background/50 ml-0.5">
									<span>
										{formatForDisplay(
											"Mod+Enter",
										)}
									</span>
								</kbd>
							)}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
