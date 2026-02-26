"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIssueComments } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";
import {
	IssueConversation,
	type IssueTimelineEntry,
	type IssueCommentEntry,
	type IssueDescriptionEntry,
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
	descriptionEntry,
	canEdit,
	issueTitle,
}: {
	owner: string;
	repo: string;
	issueNumber: number;
	initialComments: IssueComment[];
	descriptionEntry: IssueDescriptionEntry;
	canEdit?: boolean;
	issueTitle?: string;
}) {
	const { data: comments = initialComments } = useQuery({
		queryKey: ["issue-comments", owner, repo, issueNumber],
		queryFn: () =>
			fetchIssueComments(owner, repo, issueNumber) as Promise<IssueComment[]>,
		initialData: initialComments,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	const entries: IssueTimelineEntry[] = [descriptionEntry, ...toEntries(comments)];

	return (
		<IssueConversation
			entries={entries}
			owner={owner}
			repo={repo}
			issueNumber={issueNumber}
			canEdit={canEdit}
			issueTitle={issueTitle}
		/>
	);
}
