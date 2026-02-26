import { revalidateTag } from "next/cache";

export {
	getCachedRepoPageData,
	getCachedRepoTree,
	getCachedBranches,
	getCachedTags,
	getCachedContributorAvatars,
	getCachedRepoLanguages,
	getCachedOverviewPRs,
	getCachedOverviewIssues,
	getCachedOverviewEvents,
	getCachedOverviewCommitActivity,
	getCachedOverviewCI,
	updateCachedRepoPageDataNavCounts,
	type ContributorAvatarsData,
	type BranchRef,
} from "./repo-data-cache";

export { getCachedReadmeHtml } from "./readme-cache";

export function repoTag(owner: string, repo: string): string {
	return `repo:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function invalidateRepoCache(owner: string, repo: string): void {
	revalidateTag(repoTag(owner, repo), { expire: 3600 });
}
