"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIssueComments } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";
import {
	IssueConversation,
	type IssueTimelineEntry,
	type IssueCommentEntry,
} from "@/components/issue/issue-conversation";

export interface IssueComment {
	id: number;
	body?: string | null;
	bodyHtml?: string;
	user: { login: string; avatar_url: string; type?: string } | null;
	created_at: string;
	author_association?: string;
	reactions?: Record<string, unknown>;
}

function toEntries(comments: IssueComment[]): IssueCommentEntry[] {
	return comments.map((c) => ({
		type: "comment" as const,
		id: c.id,
		user: c.user,
		body: c.body || "",
		bodyHtml: c.bodyHtml,
		created_at: c.created_at,
		author_association: c.author_association,
		reactions: c.reactions ?? undefined,
	}));
}

export function IssueCommentsClient({
	owner,
	repo,
	issueNumber,
	initialComments,
}: {
	owner: string;
	repo: string;
	issueNumber: number;
	initialComments: IssueComment[];
}) {
	const { data: comments = initialComments } = useQuery({
		queryKey: ["issue-comments", owner, repo, issueNumber],
		queryFn: () =>
			fetchIssueComments(owner, repo, issueNumber) as Promise<IssueComment[]>,
		initialData: initialComments,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	const entries: IssueTimelineEntry[] = toEntries(comments);

	if (entries.length === 0) {
		return (
			<div className="flex items-center justify-center py-8 text-[11px] font-mono text-muted-foreground/30">
				No comments yet
			</div>
		);
	}

	return (
		<IssueConversation
			entries={entries}
			owner={owner}
			repo={repo}
			issueNumber={issueNumber}
		/>
	);
}
