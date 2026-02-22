"use server";

import { getOctokit, getAuthenticatedUser } from "@/lib/github";
import { getErrorMessage } from "@/lib/utils";

export type ReactionContent =
	| "+1"
	| "-1"
	| "laugh"
	| "confused"
	| "heart"
	| "hooray"
	| "rocket"
	| "eyes";

export type ReactionUser = {
	login: string;
	avatar_url: string;
	content: string;
};

export type ReactionWithId = ReactionUser & {
	id: number;
};

export async function getReactionUsers(
	owner: string,
	repo: string,
	contentType: "issue" | "issueComment" | "pullRequestReviewComment",
	contentId: number,
): Promise<{ users: ReactionWithId[]; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { users: [], error: "Not authenticated" };

	try {
		let res;
		if (contentType === "issue") {
			res = await octokit.reactions.listForIssue({
				owner,
				repo,
				issue_number: contentId,
				per_page: 100,
			});
		} else if (contentType === "issueComment") {
			res = await octokit.reactions.listForIssueComment({
				owner,
				repo,
				comment_id: contentId,
				per_page: 100,
			});
		} else {
			res = await octokit.reactions.listForPullRequestReviewComment({
				owner,
				repo,
				comment_id: contentId,
				per_page: 100,
			});
		}

		return {
			users: res.data.map((r) => ({
				id: r.id,
				login: r.user?.login ?? "unknown",
				avatar_url: r.user?.avatar_url ?? "",
				content: r.content,
			})),
		};
	} catch (e: unknown) {
		return { users: [], error: getErrorMessage(e) || "Failed to fetch reactions" };
	}
}

export async function addReaction(
	owner: string,
	repo: string,
	contentType: "issue" | "issueComment" | "pullRequestReviewComment",
	contentId: number,
	content: ReactionContent,
): Promise<{ success: boolean; reactionId?: number; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		let res;
		if (contentType === "issue") {
			res = await octokit.reactions.createForIssue({
				owner,
				repo,
				issue_number: contentId,
				content,
			});
		} else if (contentType === "issueComment") {
			res = await octokit.reactions.createForIssueComment({
				owner,
				repo,
				comment_id: contentId,
				content,
			});
		} else {
			res = await octokit.reactions.createForPullRequestReviewComment({
				owner,
				repo,
				comment_id: contentId,
				content,
			});
		}

		return { success: true, reactionId: res.data.id };
	} catch (e: unknown) {
		return { success: false, error: getErrorMessage(e) || "Failed to add reaction" };
	}
}

export async function removeReaction(
	owner: string,
	repo: string,
	contentType: "issue" | "issueComment" | "pullRequestReviewComment",
	contentId: number,
	reactionId: number,
): Promise<{ success: boolean; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		if (contentType === "issue") {
			await octokit.reactions.deleteForIssue({
				owner,
				repo,
				issue_number: contentId,
				reaction_id: reactionId,
			});
		} else if (contentType === "issueComment") {
			await octokit.reactions.deleteForIssueComment({
				owner,
				repo,
				comment_id: contentId,
				reaction_id: reactionId,
			});
		} else {
			await octokit.request(
				"DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions/{reaction_id}",
				{
					owner,
					repo,
					comment_id: contentId,
					reaction_id: reactionId,
				},
			);
		}

		return { success: true };
	} catch (e: unknown) {
		return { success: false, error: getErrorMessage(e) || "Failed to remove reaction" };
	}
}

export async function getCurrentUserLogin(): Promise<string | null> {
	const user = await getAuthenticatedUser();
	return user?.login ?? null;
}

export async function getCurrentUser(): Promise<{ login: string; avatar_url: string } | null> {
	const user = await getAuthenticatedUser();
	if (!user) return null;
	return { login: user.login, avatar_url: user.avatar_url };
}
