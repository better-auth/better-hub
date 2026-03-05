"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDiscussionComments } from "@/app/(app)/repos/[owner]/[repo]/discussions/discussion-actions";
import { DiscussionConversation } from "@/components/discussion/discussion-conversation";
import type { DiscussionComment } from "@/lib/github";

interface DescriptionEntry {
	body: string;
	bodyHtml?: string;
	author: { login: string; avatar_url: string } | null;
	createdAt: string;
	discussionId?: string;
	reactions?: Record<string, unknown>;
	upvoteCount?: number;
	viewerHasUpvoted?: boolean;
}

export function DiscussionCommentsClient({
	owner,
	repo,
	discussionNumber,
	initialComments,
	descriptionEntry,
}: {
	owner: string;
	repo: string;
	discussionNumber: number;
	initialComments: DiscussionComment[];
	descriptionEntry: DescriptionEntry;
}) {
	const { data: comments = initialComments } = useQuery({
		queryKey: ["discussion-comments", owner, repo, discussionNumber],
		queryFn: () => fetchDiscussionComments(owner, repo, discussionNumber),
		initialData: initialComments,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	return <DiscussionConversation description={descriptionEntry} comments={comments} />;
}
