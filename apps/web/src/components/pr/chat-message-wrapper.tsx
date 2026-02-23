"use client";

import { useState, type ReactNode } from "react";
import { MessageActionsMenu } from "./message-actions-menu";
import { useDeletedComments } from "./deleted-comments-context";

type ChatMessageWrapperProps = {
	headerContent: ReactNode;
	bodyContent: ReactNode;
	reactionsContent: ReactNode;
	owner: string;
	repo: string;
	commentId: number;
	body: string;
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
}: ChatMessageWrapperProps) {
	const [deleted, setDeleted] = useState(false);
	const deletedContext = useDeletedComments();

	if (deleted) {
		return null;
	}

	const handleDelete = () => {
		setDeleted(true);
		deletedContext?.markDeleted();
	};

	return (
		<div className="group">
			<div className="border border-border/60 rounded-lg overflow-hidden">
				<div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-card/50">
					{headerContent}
					{contentType === "pr" ? (
						<MessageActionsMenu
							owner={owner}
							repo={repo}
							contentType="pr"
							pullNumber={pullNumber}
							commentId={commentId}
							body={body}
							onDelete={handleDelete}
						/>
					) : (
						<MessageActionsMenu
							owner={owner}
							repo={repo}
							contentType="issue"
							issueNumber={issueNumber}
							commentId={commentId}
							body={body}
							onDelete={handleDelete}
						/>
					)}
				</div>
				{bodyContent}
				<div className="px-3 pb-2">{reactionsContent}</div>
			</div>
		</div>
	);
}
