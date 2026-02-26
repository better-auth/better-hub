"use server";

import {
	getDiscussionComments,
	addDiscussionCommentViaGraphQL,
	invalidateRepoDiscussionsCache,
	type DiscussionComment,
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
