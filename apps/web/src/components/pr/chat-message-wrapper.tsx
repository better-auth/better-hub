"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { MessageActionsMenu } from "./message-actions-menu";
import { useDeletedComments } from "./deleted-comments-context";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { updateIssueComment } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { formatQuotedReplyMarkdown } from "@/lib/comment-quote";

type ChatMessageWrapperProps = {
	headerContent: ReactNode;
	bodyContent: ReactNode;
	reactionsContent: ReactNode;
	owner: string;
	repo: string;
	commentId: number;
	body: string;
	canEdit?: boolean;
	canDelete?: boolean;
} & (
	| { contentType: "pr"; pullNumber: number; issueNumber?: never }
	| { contentType: "issue"; issueNumber: number; pullNumber?: never }
);

export function ChatMessageWrapper({
	headerContent,
	bodyContent,
	reactionsContent,
	owner,
	repo,
	contentType,
	pullNumber,
	issueNumber,
	commentId,
	body,
	canEdit = false,
	canDelete = false,
}: ChatMessageWrapperProps) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [deleted, setDeleted] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editBody, setEditBody] = useState(body);
	const [editError, setEditError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const deletedContext = useDeletedComments();

	if (deleted) return null;

	const handleDelete = () => {
		setDeleted(true);
		deletedContext?.markDeleted();
	};

	const handleEdit = () => {
		setEditBody(body);
		setEditError(null);
		setIsEditing(true);
	};

	const handleCancelEdit = () => {
		setEditBody(body);
		setEditError(null);
		setIsEditing(false);
	};

	const handleSave = () => {
		setEditError(null);
		startTransition(async () => {
			const result = await updateIssueComment(
				owner,
				repo,
				contentType === "pr" ? pullNumber! : issueNumber!,
				commentId,
				editBody.trim(),
			);
			if (result.error) {
				setEditError(result.error);
			} else {
				setIsEditing(false);
				router.refresh();
			}
		});
	};

	const handleQuoteReply = () => {
		emit({
			type: "comment:draft-quoted",
			owner,
			repo,
			threadType: contentType,
			number: contentType === "pr" ? pullNumber! : issueNumber!,
			body: formatQuotedReplyMarkdown(body),
		});
	};

	return (
		<div className="group">
			<div className="border border-border/60 rounded-lg overflow-hidden">
				<div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-card/50">
					{headerContent}
					<MessageActionsMenu
						owner={owner}
						repo={repo}
						commentId={commentId}
						body={body}
						canDelete={canDelete}
						onDelete={handleDelete}
						onEdit={canEdit ? handleEdit : undefined}
						onQuoteReply={handleQuoteReply}
						{...(contentType === "pr"
							? { contentType: "pr" as const, pullNumber }
							: {
									contentType:
										"issue" as const,
									issueNumber,
								})}
					/>
				</div>

				{isEditing ? (
					<div className="p-3 space-y-2">
						<MarkdownEditor
							value={editBody}
							onChange={setEditBody}
							placeholder="Leave a comment... (Markdown supported)"
							rows={6}
							compact
							autoFocus
							owner={owner}
							onKeyDown={(e) => {
								if (e.key === "Escape")
									handleCancelEdit();
								if (
									e.key === "Enter" &&
									(e.metaKey || e.ctrlKey)
								) {
									e.preventDefault();
									handleSave();
								}
							}}
						/>

						{editError && (
							<div className="flex items-center gap-2 text-[11px] text-destructive">
								<AlertCircle className="w-3 h-3 shrink-0" />
								{editError}
							</div>
						)}

						<div className="flex items-center justify-between">
							<span className="text-[10px] text-muted-foreground/25">
								{typeof navigator !== "undefined" &&
								/Mac|iPhone|iPad/.test(
									navigator.userAgent,
								)
									? "⌘"
									: "Ctrl"}
								+Enter to save
							</span>
							<div className="flex items-center gap-2">
								<button
									onClick={handleCancelEdit}
									disabled={isPending}
									className="px-3 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer rounded-md"
								>
									Cancel
								</button>
								<button
									onClick={handleSave}
									disabled={isPending}
									className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
						{bodyContent}
						<div className="px-3 pb-2">{reactionsContent}</div>
					</>
				)}
			</div>
		</div>
	);
}
