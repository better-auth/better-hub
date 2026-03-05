"use client";

import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { CommentActionsMenu } from "@/components/shared/comment-actions-menu";
import { deleteDiscussionCommentAction } from "@/app/(app)/repos/[owner]/[repo]/discussions/discussion-actions";
import { formatQuotedReplyMarkdown } from "@/lib/comment-quote";

interface DiscussionActionsMenuProps {
	owner: string;
	repo: string;
	discussionNumber: number;
	commentId: string;
	body: string;
	url: string;
	canEdit?: boolean;
	canDelete: boolean;
	onEdit?: () => void;
	onDelete?: () => void;
}

export function DiscussionActionsMenu({
	owner,
	repo,
	discussionNumber,
	commentId,
	body,
	url,
	canEdit = false,
	canDelete,
	onEdit,
	onDelete,
}: DiscussionActionsMenuProps) {
	const { emit } = useMutationEvents();

	const handleDelete = async () => {
		const result = await deleteDiscussionCommentAction(
			owner,
			repo,
			discussionNumber,
			commentId,
		);
		if (!result.error) onDelete?.();
		return result;
	};

	return (
		<CommentActionsMenu
			body={body}
			url={url}
			ariaLabel="Discussion comment actions"
			canEdit={canEdit}
			canDelete={canDelete}
			onEdit={onEdit}
			onDelete={handleDelete}
			onQuoteReply={() =>
				emit({
					type: "comment:draft-quoted",
					owner,
					repo,
					threadType: "discussion",
					number: discussionNumber,
					body: formatQuotedReplyMarkdown(body),
				})
			}
		/>
	);
}
