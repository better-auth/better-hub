"use server";

import {
	getDiscussionComments,
	addDiscussionCommentViaGraphQL,
	invalidateRepoDiscussionsCache,
	addDiscussionReaction,
	removeDiscussionReaction,
	toggleDiscussionUpvote,
	toggleDiscussionCommentUpvote,
	getAuthenticatedUser,
	type DiscussionComment,
	type DiscussionReactionContent,
} from "@/lib/github";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export async function fetchDiscussionComments(
	owner: string,
	repo: string,
	discussionNumber: number,
): Promise<DiscussionComment[]> {
	const comments = await getDiscussionComments(owner, repo, discussionNumber);
	const refCtx = { owner, repo };

	const withHtml = await Promise.all(
		comments.map(async (c) => {
			const bodyHtml = c.body
				? await renderMarkdownToHtml(c.body, undefined, refCtx)
				: "";
			const repliesWithHtml = await Promise.all(
				c.replies.map(async (r) => {
					const replyHtml = r.body
						? await renderMarkdownToHtml(
								r.body,
								undefined,
								refCtx,
							)
						: "";
					return { ...r, bodyHtml: replyHtml };
				}),
			);
			return { ...c, bodyHtml, replies: repliesWithHtml };
		}),
	);
	return withHtml;
}

export async function addDiscussionComment(
	owner: string,
	repo: string,
	discussionNumber: number,
	discussionId: string,
	body: string,
	replyToId?: string,
): Promise<{ success?: boolean; error?: string }> {
	try {
		const result = await addDiscussionCommentViaGraphQL(discussionId, body, replyToId);
		if (!result) return { error: "Failed to add comment" };

		await invalidateRepoDiscussionsCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/discussions/${discussionNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) };
	}
}

export type DiscussionReactionContentType =
	| "+1"
	| "-1"
	| "laugh"
	| "confused"
	| "heart"
	| "hooray"
	| "rocket"
	| "eyes";

function mapReactionContent(content: DiscussionReactionContentType): DiscussionReactionContent {
	const map: Record<DiscussionReactionContentType, DiscussionReactionContent> = {
		"+1": "THUMBS_UP",
		"-1": "THUMBS_DOWN",
		laugh: "LAUGH",
		confused: "CONFUSED",
		heart: "HEART",
		hooray: "HOORAY",
		rocket: "ROCKET",
		eyes: "EYES",
	};
	return map[content];
}

export async function addDiscussionReactionAction(
	subjectId: string,
	content: DiscussionReactionContentType,
): Promise<{ success: boolean; reactionId?: number; error?: string }> {
	const gqlContent = mapReactionContent(content);
	return addDiscussionReaction(subjectId, gqlContent);
}

export async function removeDiscussionReactionAction(
	subjectId: string,
	content: DiscussionReactionContentType,
): Promise<{ success: boolean; error?: string }> {
	const gqlContent = mapReactionContent(content);
	return removeDiscussionReaction(subjectId, gqlContent);
}

export async function toggleDiscussionUpvoteAction(
	discussionId: string,
	hasUpvoted: boolean,
): Promise<{ success: boolean; upvoteCount?: number; viewerHasUpvoted?: boolean; error?: string }> {
	return toggleDiscussionUpvote(discussionId, hasUpvoted);
}

export async function toggleDiscussionCommentUpvoteAction(
	commentId: string,
	hasUpvoted: boolean,
): Promise<{ success: boolean; upvoteCount?: number; viewerHasUpvoted?: boolean; error?: string }> {
	return toggleDiscussionCommentUpvote(commentId, hasUpvoted);
}

export async function getCurrentUser(): Promise<{ login: string; avatar_url: string } | null> {
	const user = await getAuthenticatedUser();
	if (!user) return null;
	return { login: user.login, avatar_url: user.avatar_url };
}
