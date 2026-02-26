"use server";

import {
	getRepoDiscussionsPage,
	fetchMoreDiscussions,
	createDiscussionViaGraphQL,
	invalidateRepoDiscussionsCache,
} from "@/lib/github";
import type { RepoDiscussionNode } from "@/lib/github";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export async function fetchDiscussionsByCategory(owner: string, repo: string, _category: string) {
	const data = await getRepoDiscussionsPage(owner, repo);
	return data;
}

export async function loadMoreDiscussions(
	owner: string,
	repo: string,
	cursor: string,
): Promise<{ discussions: RepoDiscussionNode[]; hasNextPage: boolean; endCursor: string | null }> {
	return fetchMoreDiscussions(owner, repo, cursor);
}

export async function createDiscussion(
	owner: string,
	repo: string,
	repositoryId: string,
	categoryId: string,
	title: string,
	body: string,
): Promise<{ success: boolean; number?: number; error?: string }> {
	try {
		const result = await createDiscussionViaGraphQL(
			repositoryId,
			categoryId,
			title,
			body,
		);
		if (!result) return { success: false, error: "Not authenticated" };

		await invalidateRepoDiscussionsCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/discussions`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true, number: result.number };
	} catch (err: unknown) {
		return { success: false, error: getErrorMessage(err) };
	}
}
