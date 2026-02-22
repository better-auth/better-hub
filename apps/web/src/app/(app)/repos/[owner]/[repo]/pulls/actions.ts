"use server";

import {
	getOctokit,
	invalidateRepoPullRequestsCache,
	getRepoPullRequestsWithStats,
	batchFetchCheckStatuses,
	getPullRequestBundle,
	getPullRequestFiles,
	getRepo,
	getUser,
	getUserPublicRepos,
	getUserPublicOrgs,
	getPersonRepoActivity,
	getRepoContributors,
	type PRPageResult,
} from "@/lib/github";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";
import { all } from "better-all";

export async function refreshPullRequests(owner: string, repo: string) {
	await invalidateRepoPullRequestsCache(owner, repo);
	invalidateRepoCache(owner, repo);
	revalidatePath(`/repos/${owner}/${repo}/pulls`);
}

export async function fetchPRsByAuthor(owner: string, repo: string, author: string) {
	const octokit = await getOctokit();
	if (!octokit) return { open: [], closed: [] };

	const { openRes, closedRes } = await all({
		openRes: () =>
			octokit.search.issuesAndPullRequests({
				q: `is:pr is:open repo:${owner}/${repo} author:${author}`,
				per_page: 100,
				sort: "updated",
				order: "desc",
			}),
		closedRes: () =>
			octokit.search.issuesAndPullRequests({
				q: `is:pr is:closed repo:${owner}/${repo} author:${author}`,
				per_page: 100,
				sort: "updated",
				order: "desc",
			}),
	});

	return {
		open: openRes.data.items,
		closed: closedRes.data.items,
	};
}

export async function fetchClosedPRs(owner: string, repo: string) {
	const { prs } = await getRepoPullRequestsWithStats(owner, repo, "closed", { perPage: 50 });
	return prs;
}

export async function fetchPRPage(
	owner: string,
	repo: string,
	state: "open" | "closed" | "all",
	cursor: string | null,
): Promise<{ prs: PRPageResult["prs"]; pageInfo: PRPageResult["pageInfo"] }> {
	const { prs, pageInfo } = await getRepoPullRequestsWithStats(owner, repo, state, {
		perPage: 20,
		cursor,
	});
	return { prs, pageInfo };
}

export async function fetchAllCheckStatuses(owner: string, repo: string, prNumbers: number[]) {
	return batchFetchCheckStatuses(
		owner,
		repo,
		prNumbers.map((n) => ({ number: n })),
	);
}

export async function prefetchPRDetail(
	owner: string,
	repo: string,
	pullNumber: number,
	authorLogin?: string | null,
) {
	await all({
		bundle: () => getPullRequestBundle(owner, repo, pullNumber),
		files: () => getPullRequestFiles(owner, repo, pullNumber),
		repo: () => getRepo(owner, repo),
		authorProfile: () => (authorLogin ? getUser(authorLogin) : Promise.resolve(null)),
		authorRepos: () =>
			authorLogin ? getUserPublicRepos(authorLogin, 6) : Promise.resolve([]),
		authorOrgs: () =>
			authorLogin ? getUserPublicOrgs(authorLogin) : Promise.resolve([]),
		authorActivity: () =>
			authorLogin
				? getPersonRepoActivity(owner, repo, authorLogin)
				: Promise.resolve(null),
		contributors: () => getRepoContributors(owner, repo),
	});
}
