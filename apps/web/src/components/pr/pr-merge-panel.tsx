"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside } from "@/hooks/use-click-outside";
import {
	GitMerge,
	ChevronDown,
	XCircle,
	RotateCcw,
	Loader2,
	Check,
	Ghost,
	Sparkles,
	GitBranch,
	FilePenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalChat } from "@/components/shared/global-chat-provider";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
	mergePullRequest,
	closePullRequest,
	reopenPullRequest,
	updatePRBranch,
	convertPRToDraft,
	type MergeMethod,
} from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { useQueryClient } from "@tanstack/react-query";

interface PRMergePanelProps {
	owner: string;
	repo: string;
	pullNumber: number;
	prTitle: string;
	prBody?: string;
	commitMessages?: string[];
	state: string;
	merged: boolean;
	mergeable: boolean | null;
	allowMergeCommit: boolean;
	allowSquashMerge: boolean;
	allowRebaseMerge: boolean;
	headBranch: string;
	baseBranch: string;
	draft?: boolean;
	canWrite?: boolean;
	canTriage?: boolean;
	isAuthor?: boolean;
	branchBehindBase?: boolean;
}

const mergeMethodLabels: Record<MergeMethod, { short: string; description: string }> = {
	squash: {
		short: "Squash",
		description: "Squash and merge",
	},
	merge: {
		short: "Merge",
		description: "Merge commit",
	},
	rebase: {
		short: "Rebase",
		description: "Rebase and merge",
	},
};

export function PRMergePanel({
	owner,
	repo,
	pullNumber,
	prTitle,
	prBody,
	commitMessages,
	state,
	merged,
	mergeable,
	allowMergeCommit,
	allowSquashMerge,
	allowRebaseMerge,
	headBranch,
	baseBranch,
	draft = false,
	canWrite = true,
	canTriage = true,
	isAuthor = false,
	branchBehindBase = false,
}: PRMergePanelProps) {
	const hasPermission = canTriage || isAuthor;
	const availableMethods: MergeMethod[] = [
		...(allowSquashMerge ? ["squash" as const] : []),
		...(allowMergeCommit ? ["merge" as const] : []),
		...(allowRebaseMerge ? ["rebase" as const] : []),
	];

	const router = useRouter();
	const { openChat } = useGlobalChat();
	const { emit } = useMutationEvents();
	const queryClient = useQueryClient();
	const [method, setMethod] = useState<MergeMethod>(availableMethods[0] ?? "merge");
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [squashDialogOpen, setSquashDialogOpen] = useState(false);
	const [commitTitle, setCommitTitle] = useState("");
	const [commitMessage, setCommitMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const [pendingAction, setPendingAction] = useState<
		"merge" | "close" | "reopen" | "draft" | "updateBranch" | null
	>(null);
	const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(
		null,
	);
	const [isMerged, setIsMerged] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const isOpen = state === "open" && !merged && !isMerged;
	const showUpdateBranch =
		isOpen && hasPermission && (branchBehindBase || mergeable === false);
	const updateBranchDisabled = mergeable === false;
	const canConvertToDraft = isOpen && (canWrite || isAuthor) && !draft;

	useClickOutside(
		dropdownRef,
		useCallback(() => setDropdownOpen(false), []),
	);

	const handleFixWithGhost = () => {
		openChat({
			chatType: "pr",
			contextKey: `${owner}/${repo}#${pullNumber}`,
			contextBody: {
				prContext: {
					owner,
					repo,
					pullNumber,
					prTitle,
					prBody: "",
					baseBranch,
					headBranch,
					files: [],
					mergeConflict: true,
				},
			},
			placeholder: "Ask Ghost about this PR...",
			emptyTitle: "Ghost",
			emptyDescription: "Resolving merge conflicts...",
		});
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("ghost-auto-send", {
					detail: {
						message: "Fix the merge conflicts in this PR. Resolve all conflicting files and push the fix.",
					},
				}),
			);
		}, 300);
	};

	const generateCommitMessage = async () => {
		setIsGenerating(true);
		try {
			const res = await fetch("/api/ai/commit-message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode: "squash",
					prTitle,
					prBody: prBody || "",
					prNumber: pullNumber,
					commits: commitMessages || [],
				}),
			});
			const data = await res.json();
			if (data.title) setCommitTitle(data.title);
			if (data.description) setCommitMessage(data.description);
		} catch {
			// silently fail
		} finally {
			setIsGenerating(false);
		}
	};

	useEffect(() => {
		if (result) {
			const timer = setTimeout(() => setResult(null), 3000);
			return () => clearTimeout(timer);
		}
	}, [result]);

	const invalidatePRQueries = useCallback(() => {
		queryClient.removeQueries({ queryKey: ["prs", owner, repo] });
		queryClient.removeQueries({ queryKey: ["pr-check-statuses", owner, repo] });
	}, [queryClient, owner, repo]);

	const doMerge = (mergeMethod: MergeMethod, title?: string, message?: string) => {
		setResult(null);
		setPendingAction("merge");
		startTransition(async () => {
			const res = await mergePullRequest(
				owner,
				repo,
				pullNumber,
				mergeMethod,
				title,
				message,
			);
			if (res.error) {
				setResult({ type: "error", message: res.error });
			} else {
				setResult({ type: "success", message: "Merged" });
				emit({ type: "pr:merged", owner, repo, number: pullNumber });
				invalidatePRQueries();
				setSquashDialogOpen(false);
				setIsMerged(true);
				router.refresh();
			}
		});
	};

	const handleMergeClick = () => {
		if (method === "squash") {
			setCommitTitle(`${prTitle} (#${pullNumber})`);
			setCommitMessage("");
			setSquashDialogOpen(true);
		} else {
			doMerge(method);
		}
	};

	const handleSquashConfirm = () => {
		doMerge("squash", commitTitle || undefined, commitMessage || undefined);
	};

	const handleClose = () => {
		setResult(null);
		setPendingAction("close");
		startTransition(async () => {
			const res = await closePullRequest(owner, repo, pullNumber);
			if (res.error) {
				setResult({ type: "error", message: res.error });
			} else {
				setResult({ type: "success", message: "Closed" });
				emit({ type: "pr:closed", owner, repo, number: pullNumber });
				invalidatePRQueries();
				router.refresh();
			}
		});
	};

	const handleReopen = () => {
		setResult(null);
		setPendingAction("reopen");
		startTransition(async () => {
			const res = await reopenPullRequest(owner, repo, pullNumber);
			if (res.error) {
				setResult({ type: "error", message: res.error });
			} else {
				setResult({ type: "success", message: "Reopened" });
				emit({ type: "pr:reopened", owner, repo, number: pullNumber });
				invalidatePRQueries();
				router.refresh();
			}
		});
	};

	const handleUpdateBranch = () => {
		setResult(null);
		setPendingAction("updateBranch");
		startTransition(async () => {
			const res = await updatePRBranch(owner, repo, pullNumber);
			if (res.error) {
				setResult({ type: "error", message: res.error });
			} else {
				setResult({ type: "success", message: "Branch updated" });
				invalidatePRQueries();
				router.refresh();
			}
		});
	};

	const handleConvertToDraft = () => {
		setResult(null);
		setPendingAction("draft");
		startTransition(async () => {
			const res = await convertPRToDraft(owner, repo, pullNumber);
			if (res.error) {
				setResult({ type: "error", message: res.error });
			} else {
				setResult({ type: "success", message: "Converted to draft" });
				emit({
					type: "pr:converted_to_draft",
					owner,
					repo,
					number: pullNumber,
				});
				invalidatePRQueries();
				router.refresh();
			}
		});
	};

	if (merged || isMerged) return null;

	if (state === "closed") {
		if (!canTriage && !isAuthor) return null;
		return (
			<div className="flex items-center gap-2">
				{result && (
					<span
						className={cn(
							"text-[10px] font-mono",
							result.type === "error"
								? "text-destructive"
								: "text-success",
						)}
					>
						{result.message}
					</span>
				)}
				<button
					onClick={handleReopen}
					disabled={isPending}
					className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isPending && pendingAction === "reopen" ? (
						<Loader2 className="w-3 h-3 animate-spin" />
					) : (
						<RotateCcw className="w-3 h-3" />
					)}
					Reopen
				</button>
			</div>
		);
	}

	if (!canWrite && !canTriage && !isAuthor) return null;

	return (
		<>
			<div className="flex items-center gap-2">
				{result && (
					<span
						className={cn(
							"text-[10px] font-mono",
							result.type === "error"
								? "text-destructive"
								: "text-success",
						)}
					>
						{result.message}
					</span>
				)}

				{/* Merge button with dropdown */}
				{canWrite && (
					<div ref={dropdownRef} className="relative">
						<div
							className={cn(
								"flex items-center divide-x",
								mergeable === false
									? "border border-amber-500/40 divide-amber-500/20"
									: "border border-foreground/80 divide-foreground/20",
							)}
						>
							<button
								onClick={
									mergeable === false
										? undefined
										: handleMergeClick
								}
								disabled={
									isPending ||
									mergeable === false
								}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors disabled:cursor-not-allowed",
									mergeable === false
										? "bg-amber-500/80 text-background opacity-90"
										: "bg-foreground text-background hover:bg-foreground/90 cursor-pointer disabled:opacity-50",
								)}
								title={
									mergeable === false
										? "Resolve conflicts before merging"
										: undefined
								}
							>
								{isPending &&
								pendingAction === "merge" ? (
									<Loader2 className="w-3 h-3 animate-spin" />
								) : mergeable === false ? (
									<>
										<GitMerge className="w-3 h-3" />
										<span className="text-[9px] opacity-70">
											⚠
										</span>
									</>
								) : (
									<GitMerge className="w-3 h-3" />
								)}
								{mergeable === false
									? "Conflicts"
									: mergeMethodLabels[method]
											.short}
							</button>

							<button
								onClick={() =>
									setDropdownOpen((o) => !o)
								}
								disabled={isPending}
								className={cn(
									"flex items-center self-stretch px-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
									mergeable === false
										? "bg-amber-500/80 text-background hover:bg-amber-500/70"
										: "bg-foreground text-background hover:bg-foreground/90",
								)}
							>
								<ChevronDown className="w-3 h-3" />
							</button>
						</div>

						{dropdownOpen && (
							<div className="absolute top-full right-0 mt-1 w-52 bg-background border border-border shadow-lg dark:shadow-2xl z-50 py-1">
								{availableMethods.map((m) => {
									const disabled =
										mergeable === false;
									return (
										<button
											key={m}
											disabled={
												disabled
											}
											onClick={() => {
												if (
													disabled
												)
													return;
												setMethod(
													m,
												);
												setDropdownOpen(
													false,
												);
											}}
											className={cn(
												"w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
												disabled
													? "opacity-40 cursor-not-allowed"
													: "cursor-pointer",
												!disabled &&
													method ===
														m
													? "bg-muted/50 dark:bg-white/[0.04] text-foreground"
													: !disabled
														? "text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.03] hover:text-foreground"
														: "text-muted-foreground",
											)}
										>
											{!disabled &&
											method ===
												m ? (
												<Check className="w-3 h-3 shrink-0" />
											) : (
												<div className="w-3 h-3 shrink-0" />
											)}
											<span className="text-xs">
												{
													mergeMethodLabels[
														m
													]
														.description
												}
											</span>
										</button>
									);
								})}
								{mergeable === false && (
									<>
										<div className="border-t border-border/40 my-1" />
										<button
											onClick={() => {
												setDropdownOpen(
													false,
												);
												router.push(
													`?resolve=conflicts`,
												);
											}}
											className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
										>
											<GitMerge className="w-3 h-3 shrink-0" />
											<span className="text-xs">
												Resolve
												conflicts
											</span>
										</button>
										<button
											onClick={() => {
												setDropdownOpen(
													false,
												);
												handleFixWithGhost();
											}}
											className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
										>
											<Ghost className="w-3 h-3 shrink-0" />
											<span className="text-xs">
												Fix
												conflicts
												with
												Ghost
											</span>
										</button>
									</>
								)}
							</div>
						)}
					</div>
				)}

				{showUpdateBranch &&
					(updateBranchDisabled ? (
						<Tooltip delayDuration={0}>
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<button
										disabled
										className={cn(
											"flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border transition-colors cursor-not-allowed",
											"border-amber-500/40 text-amber-600 dark:text-amber-400 opacity-70",
										)}
									>
										<GitBranch className="w-3 h-3" />
										Update branch
									</button>
								</span>
							</TooltipTrigger>
							<TooltipContent
								side="bottom"
								className="text-xs font-mono max-w-[240px]"
							>
								Update branch is unavailable while
								there are merge conflicts.
							</TooltipContent>
						</Tooltip>
					) : (
						<button
							onClick={handleUpdateBranch}
							disabled={isPending}
							title="Merge the latest changes from the base branch into this branch"
							className={cn(
								"flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
							)}
						>
							{isPending &&
							pendingAction === "updateBranch" ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<GitBranch className="w-3 h-3" />
							)}
							Update branch
						</button>
					))}

				{/* Convert to draft */}
				{canConvertToDraft && (
					<button
						onClick={handleConvertToDraft}
						disabled={isPending}
						className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isPending && pendingAction === "draft" ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<FilePenLine className="w-3 h-3" />
						)}
						Convert to draft
					</button>
				)}

				{/* Close button */}
				{isOpen && (canTriage || isAuthor) && (
					<button
						onClick={handleClose}
						disabled={isPending}
						className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-red-300/40 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isPending && pendingAction === "close" ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<XCircle className="w-3 h-3" />
						)}
						Close
					</button>
				)}
			</div>

			{/* Squash merge dialog */}
			<Dialog open={squashDialogOpen} onOpenChange={setSquashDialogOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle className="text-sm font-mono">
							Squash and merge
						</DialogTitle>
						<DialogDescription className="text-xs text-muted-foreground">
							All commits will be squashed into a single
							commit.
						</DialogDescription>
					</DialogHeader>
					{mergeable === false && (
						<div className="flex items-center gap-2.5 px-3 py-2.5 border border-amber-500/30 bg-amber-500/5 rounded-md">
							<GitMerge className="w-3.5 h-3.5 text-amber-500 shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-xs font-medium text-amber-600 dark:text-amber-400">
									This branch has merge
									conflicts
								</p>
								<p className="text-[11px] text-muted-foreground mt-0.5">
									Resolve conflicts before
									merging, or let Ghost fix
									them.
								</p>
							</div>
							<button
								type="button"
								onClick={() => {
									setSquashDialogOpen(false);
									handleFixWithGhost();
								}}
								className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer rounded shrink-0"
							>
								<Ghost className="w-3 h-3" />
								Fix
							</button>
						</div>
					)}
					<div className="space-y-3">
						<div>
							<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1.5">
								Commit message
							</label>
							<div className="relative">
								<input
									type="text"
									value={commitTitle}
									onChange={(e) =>
										setCommitTitle(
											e.target
												.value,
										)
									}
									className="w-full bg-transparent border border-border px-3 py-2 pr-8 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
									placeholder="Commit title"
								/>
								<button
									type="button"
									onClick={
										generateCommitMessage
									}
									disabled={isGenerating}
									className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground/70 transition-colors cursor-pointer disabled:cursor-wait"
									title="Generate with AI"
								>
									<Sparkles
										className={cn(
											"w-3.5 h-3.5",
											isGenerating &&
												"animate-pulse text-foreground/50",
										)}
									/>
								</button>
							</div>
						</div>
						<div>
							<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1.5">
								Description
								<span className="text-muted-foreground normal-case tracking-normal">
									{" "}
									(optional)
								</span>
							</label>
							<textarea
								value={commitMessage}
								onChange={(e) =>
									setCommitMessage(
										e.target.value,
									)
								}
								rows={4}
								className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md resize-none"
								placeholder="Add an optional extended description..."
							/>
						</div>
					</div>
					<DialogFooter>
						<button
							onClick={() => setSquashDialogOpen(false)}
							className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							onClick={handleSquashConfirm}
							disabled={
								isPending ||
								!commitTitle.trim() ||
								mergeable === false
							}
							className={cn(
								"flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
								mergeable === false
									? "bg-amber-500/80 text-background border border-amber-500/40 cursor-not-allowed"
									: "bg-foreground text-background hover:bg-foreground/90 border border-foreground/80 cursor-pointer",
							)}
						>
							{isPending ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<GitMerge className="w-3 h-3" />
							)}
							Confirm squash and merge
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
