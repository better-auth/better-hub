"use client";

import { CommentActionsMenu } from "@/components/shared/comment-actions-menu";
import { deletePRComment } from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { deleteIssueComment } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";

type MessageActionsMenuProps = {
	owner: string;
	repo: string;
	commentId: number;
	body: string;
	canDelete?: boolean;
	onDelete?: () => void;
	onEdit?: () => void;
	onQuoteReply?: () => void;
} & (
	| { contentType: "pr"; pullNumber: number; issueNumber?: never }
	| { contentType: "issue"; issueNumber: number; pullNumber?: never }
);

export function MessageActionsMenu({
	owner,
	repo,
	contentType,
	pullNumber,
	issueNumber,
	commentId,
	body,
	canDelete = false,
	onDelete,
	onEdit,
	onQuoteReply,
}: MessageActionsMenuProps) {
	const number = contentType === "pr" ? pullNumber : issueNumber;
	const urlType = contentType === "pr" ? "pull" : "issues";
	const commentUrl = `https://github.com/${owner}/${repo}/${urlType}/${number}#issuecomment-${commentId}`;

	const handleDelete = async () => {
		const result =
			contentType === "pr"
				? await deletePRComment(owner, repo, pullNumber!, commentId)
				: await deleteIssueComment(owner, repo, issueNumber!, commentId);
		if (!result.error) onDelete?.();
		return result;
	};

	return (
		<CommentActionsMenu
			body={body}
			url={commentUrl}
			ariaLabel="Message actions"
			canEdit={!!onEdit}
			canDelete={canDelete}
			onEdit={onEdit}
			onDelete={handleDelete}
			onQuoteReply={onQuoteReply}
		/>
	);
}
