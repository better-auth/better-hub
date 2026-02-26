"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import { CollapsibleBody } from "@/components/issue/collapsible-body";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";
import { UserTooltip } from "@/components/shared/user-tooltip";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { updateIssue } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";

interface EditableIssueDescriptionProps {
	entry: {
		user: { login: string; avatar_url: string } | null;
		body: string;
		bodyHtml?: string;
		created_at: string;
		reactions?: Reactions;
	};
	issueTitle: string;
	owner: string;
	repo: string;
	issueNumber: number;
}

export function EditableIssueDescription({
	entry,
	issueTitle,
	owner,
	repo,
	issueNumber,
}: EditableIssueDescriptionProps) {
	const router = useRouter();
	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(issueTitle);
	const [editBody, setEditBody] = useState(entry.body);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const hasBody = Boolean(entry.body && entry.body.trim().length > 0);
	const isLong = hasBody && entry.body.length > 800;

	const renderedBody = entry.bodyHtml ? (
		<MarkdownCopyHandler>
			<div
				className="ghmd"
				dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
			/>
		</MarkdownCopyHandler>
	) : null;

	const handleSave = () => {
		if (!editTitle.trim()) {
			setError("Title is required");
			return;
		}
		setError(null);
		startTransition(async () => {
			const result = await updateIssue(
				owner,
				repo,
				issueNumber,
				editTitle.trim(),
				editBody.trim(),
			);
			if (result.error) {
				setError(result.error);
			} else {
				setIsEditing(false);
				router.refresh();
			}
		});
	};

	const handleCancel = () => {
		setEditTitle(issueTitle);
		setEditBody(entry.body);
		setError(null);
		setIsEditing(false);
	};

	return (
		<div className="border border-border/60 rounded-lg overflow-hidden">
			<div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/60 bg-card/80">
				{entry.user && (
					<UserTooltip username={entry.user.login}>
						<Link
							href={`/users/${entry.user.login}`}
							className="text-xs font-semibold text-foreground/90 hover:text-foreground hover:underline transition-colors"
						>
							{entry.user.login}
						</Link>
					</UserTooltip>
				)}
				<span className="text-[11px] text-muted-foreground/50">
					commented <TimeAgo date={entry.created_at} />
				</span>
				{!isEditing ? (
					<button
						onClick={() => setIsEditing(true)}
						className="ml-auto p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
						title="Edit issue"
					>
						<Pencil className="w-3.5 h-3.5" />
					</button>
				) : (
					<button
						onClick={handleCancel}
						disabled={isPending}
						className="ml-auto p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
						title="Cancel edit"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				)}
			</div>

			{isEditing ? (
				<div className="p-3.5 space-y-3">
					<div>
						<label className="text-[11px] text-muted-foreground/50 mb-1 block">
							Title
						</label>
						<input
							type="text"
							value={editTitle}
							onChange={(e) =>
								setEditTitle(e.target.value)
							}
							className="w-full bg-muted/20 border border-border/50 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-foreground/20 transition-colors"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Escape")
									handleCancel();
							}}
						/>
					</div>

					<div>
						<label className="text-[11px] text-muted-foreground/50 mb-1 block">
							Body
						</label>
						<MarkdownEditor
							value={editBody}
							onChange={setEditBody}
							placeholder="Describe the issue... (Markdown supported)"
							rows={10}
							owner={owner}
							onKeyDown={(e) => {
								if (e.key === "Escape")
									handleCancel();
								if (
									e.key === "Enter" &&
									(e.metaKey || e.ctrlKey)
								) {
									e.preventDefault();
									handleSave();
								}
							}}
						/>
					</div>

					{error && (
						<div className="flex items-center gap-2 text-[11px] text-destructive">
							<AlertCircle className="w-3 h-3 shrink-0" />
							{error}
						</div>
					)}

					<div className="flex items-center justify-between">
						<span className="text-[10px] text-muted-foreground/25">
							{typeof navigator !== "undefined" &&
							/Mac|iPhone|iPad/.test(navigator.userAgent)
								? "⌘"
								: "Ctrl"}
							+Enter to save
						</span>
						<div className="flex items-center gap-2">
							<button
								onClick={handleCancel}
								disabled={isPending}
								className="px-3 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer rounded-md"
							>
								Cancel
							</button>
							<button
								onClick={handleSave}
								disabled={
									isPending ||
									!editTitle.trim()
								}
								className={cn(
									"flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer",
									editTitle.trim()
										? "bg-foreground text-background hover:bg-foreground/90"
										: "bg-muted text-muted-foreground/30 cursor-not-allowed",
									"disabled:opacity-50 disabled:cursor-not-allowed",
								)}
							>
								{isPending && (
									<Loader2 className="w-3 h-3 animate-spin" />
								)}
								Save changes
							</button>
						</div>
					</div>
				</div>
			) : (
				<>
					{hasBody && renderedBody ? (
						<div className="px-3.5 py-3">
							{isLong ? (
								<CollapsibleBody>
									{renderedBody}
								</CollapsibleBody>
							) : (
								renderedBody
							)}
						</div>
					) : (
						<div className="px-3.5 py-4">
							<p className="text-sm text-muted-foreground/30 italic">
								No description provided.
							</p>
						</div>
					)}
					<div className="px-3.5 pb-2.5">
						<ReactionDisplay
							reactions={entry.reactions ?? {}}
							owner={owner}
							repo={repo}
							contentType="issue"
							contentId={issueNumber}
						/>
					</div>
				</>
			)}
		</div>
	);
}
