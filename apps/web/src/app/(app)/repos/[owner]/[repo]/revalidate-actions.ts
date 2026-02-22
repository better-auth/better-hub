"use server";

import { fetchAndCacheRepoPageData, getRepoTree } from "@/lib/github";
import { buildFileTree } from "@/lib/file-tree";
import { setCachedRepoTree } from "@/lib/repo-data-cache";

export async function revalidateRepoPageData(owner: string, repo: string): Promise<void> {
	await fetchAndCacheRepoPageData(owner, repo);
}

export async function revalidateRepoTree(
	owner: string,
	repo: string,
	defaultBranch: string,
): Promise<void> {
	const treeResult = await getRepoTree(owner, repo, defaultBranch, true);
	if (treeResult && !treeResult.truncated && treeResult.tree) {
		const tree = buildFileTree(
			treeResult.tree as { path: string; type: string; size?: number }[],
		);
		await setCachedRepoTree(owner, repo, tree);
	}
}
