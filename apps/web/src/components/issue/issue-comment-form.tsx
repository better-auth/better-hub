"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
	Loader2,
	CornerDownLeft,
	ChevronDown,
	CheckCircle2,
	CircleOff,
	CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import {
	addIssueComment,
	closeIssue,
	reopenIssue,
} from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface OptimisticComment {
	id: number;
	body: string;
	created_at: string;
}

type CloseReason = "completed" | "not_planned";

interface IssueCommentFormProps {
	owner: string;
	repo: string;
	issueNumber: number;
	issueState: string;
	userAvatarUrl?: string;
	userName?: string;
	participants?: Array<{ login: string; avatar_url: string }>;
}

export function IssueCommentForm({
	owner,
	repo,
	issueNumber,
	issueState,
	userAvatarUrl,
	userName,
	participants,
}: IssueCommentFormProps) {
	const router = useRouter();
	const [body, setBody] = useState("");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [optimisticComments, setOptimisticComments] = useState<OptimisticComment[]>([]);
	const [closeDropdownOpen, setCloseDropdownOpen] = useState(false);
	const [selectedReason, setSelectedReason] = useState<CloseReason>("completed");
	const dropdownRef = useRef<HTMLDivElement>(null);
	const { emit } = useMutationEvents();

	useClickOutside(dropdownRef, () => setCloseDropdownOpen(false));

	const isOpen = issueState === "open";

	const handleSubmit = () => {
		if (!body.trim()) return;
		const commentBody = body.trim();
		setError(null);

		const optimisticId = Date.now();
		setOptimisticComments((prev) => [
			...prev,
			{
				id: optimisticId,
				body: commentBody,
				created_at: new Date().toISOString(),
			},
		]);
		setBody("");

		(async () => {
			const res = await addIssueComment(owner, repo, issueNumber, commentBody);
			if (res.error) {
				setError(res.error);
				setOptimisticComments((prev) =>
					prev.filter((c) => c.id !== optimisticId),
				);
				setBody(commentBody);
			} else {
				emit({ type: "issue:commented", owner, repo, number: issueNumber });
				router.refresh();
				setTimeout(
					() =>
						setOptimisticComments((prev) =>
							prev.filter((c) => c.id !== optimisticId),
						),
					2000,
				);
			}
		})();
	};

	const handleClose = (reason: CloseReason) => {
		setError(null);
		setCloseDropdownOpen(false);
		startTransition(async () => {
			const res = await closeIssue(
				owner,
				repo,
				issueNumber,
				reason,
				body.trim() || undefined,
			);
			if (res.error) {
				setError(res.error);
			} else {
				setBody("");
				emit({ type: "issue:closed", owner, repo, number: issueNumber });
				router.refresh();
			}
		});
	};

	const handleReopen = () => {
		setError(null);
		startTransition(async () => {
			const res = await reopenIssue(
				owner,
				repo,
				issueNumber,
				body.trim() || undefined,
			);
			if (res.error) {
				setError(res.error);
			} else {
				setBody("");
				emit({ type: "issue:reopened", owner, repo, number: issueNumber });
				router.refresh();
			}
		});
	};

	return (
		<div className="space-y-3">
			{/* Optimistic comments */}
			{optimisticComments.map((c) => (
				<div
					key={c.id}
					className="border border-border/60 rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
				>
					<div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-muted/40">
						{userAvatarUrl ? (
							<Image
								src={userAvatarUrl}
								alt=""
								width={16}
								height={16}
								className="rounded-full shrink-0"
							/>
						) : (
							<div className="w-4 h-4 rounded-full bg-muted-foreground shrink-0" />
						)}
						<span className="text-xs font-medium text-foreground/80">
							{userName || "You"}
						</span>
						<span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
							<TimeAgo date={c.created_at} />
						</span>
					</div>
					<div className="px-3 py-2.5 text-sm">
						<ClientMarkdown content={c.body} />
					</div>
				</div>
			))}

			{/* Comment form */}
			<div className="border border-border/60 rounded-md overflow-hidden">
				<div className="px-3.5 py-2 border-b border-border/60 bg-muted/40">
					<div className="flex items-center gap-2">
						{userAvatarUrl && (
							<Image
								src={userAvatarUrl}
								alt=""
								width={16}
								height={16}
								className="rounded-full shrink-0"
							/>
						)}
						<span className="text-xs font-medium text-muted-foreground/60">
							Add a comment
						</span>
					</div>
				</div>
				<div className="p-2.5">
					<MarkdownEditor
						value={body}
						onChange={setBody}
						placeholder="Leave a comment..."
						rows={3}
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
						}}
					/>
					<div className="flex items-center justify-between mt-2">
						<div>
							{error && (
								<span className="text-xs text-destructive">
									{error}
								</span>
							)}
						</div>
						<div className="flex items-center gap-2">
							{/* Close / Reopen button */}
							{isOpen ? (
								<div
									className="relative"
									ref={dropdownRef}
								>
									<div className="inline-flex items-stretch border border-border rounded-md overflow-hidden">
										<button
											onClick={() =>
												handleClose(
													selectedReason,
												)
											}
											disabled={
												isPending
											}
											className={cn(
												"inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium",
												"text-foreground/80 hover:text-foreground hover:bg-muted/50",
												"transition-colors cursor-pointer",
												"disabled:opacity-40 disabled:cursor-not-allowed",
											)}
										>
											{isPending ? (
												<Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
											) : selectedReason ===
											  "completed" ? (
												<CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
											) : (
												<CircleOff className="w-3.5 h-3.5 shrink-0" />
											)}
											<span className="whitespace-nowrap">
												{body.trim()
													? "Close with comment"
													: selectedReason ===
														  "completed"
														? "Close as completed"
														: "Close as not planned"}
											</span>
										</button>
										<button
											onClick={() =>
												setCloseDropdownOpen(
													!closeDropdownOpen,
												)
											}
											disabled={
												isPending
											}
											className={cn(
												"inline-flex items-center justify-center w-7 border-l border-border",
												"text-foreground/80 hover:text-foreground hover:bg-muted/50",
												"transition-colors cursor-pointer",
												"disabled:opacity-40 disabled:cursor-not-allowed",
											)}
										>
											<ChevronDown className="w-3.5 h-3.5" />
										</button>
									</div>

									{closeDropdownOpen && (
										<div className="absolute bottom-full right-0 mb-1 w-60 bg-background border border-border rounded-md shadow-lg z-30 overflow-hidden">
											<div className="px-3 py-1.5 border-b border-border">
												<span className="text-[11px] font-medium text-muted-foreground">
													Close
													reason
												</span>
											</div>
											<button
												onClick={() => {
													setSelectedReason(
														"completed",
													);
													setCloseDropdownOpen(
														false,
													);
												}}
												className={cn(
													"flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted/60 transition-colors cursor-pointer",
													selectedReason ===
														"completed" &&
														"bg-muted/40",
												)}
											>
												<CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
												<div>
													<p className="text-xs font-medium">
														Completed
													</p>
													<p className="text-[10px] text-muted-foreground/70 leading-tight">
														Done,
														closed
														with
														resolution
													</p>
												</div>
											</button>
											<button
												onClick={() => {
													setSelectedReason(
														"not_planned",
													);
													setCloseDropdownOpen(
														false,
													);
												}}
												className={cn(
													"flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted/60 transition-colors cursor-pointer",
													selectedReason ===
														"not_planned" &&
														"bg-muted/40",
												)}
											>
												<CircleOff className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
												<div>
													<p className="text-xs font-medium">
														Not
														planned
													</p>
													<p className="text-[10px] text-muted-foreground/70 leading-tight">
														Won&apos;t
														fix,
														duplicate,
														or
														stale
													</p>
												</div>
											</button>
										</div>
									)}
								</div>
							) : (
								<button
									onClick={handleReopen}
									disabled={isPending}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
										"border border-border",
										"text-foreground/80 hover:text-foreground hover:bg-muted/50",
										"transition-colors cursor-pointer",
										"disabled:opacity-40 disabled:cursor-not-allowed",
									)}
								>
									{isPending ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<CircleDot className="w-3.5 h-3.5" />
									)}
									{body.trim()
										? "Reopen with comment"
										: "Reopen issue"}
								</button>
							)}

							{/* Comment button */}
							<button
								onClick={handleSubmit}
								disabled={!body.trim()}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
									"border border-border",
									"text-foreground/80 hover:text-foreground hover:bg-muted/50",
									"transition-colors cursor-pointer",
									"disabled:opacity-40 disabled:cursor-not-allowed",
								)}
							>
								<CornerDownLeft className="w-3.5 h-3.5" />
								Comment
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
