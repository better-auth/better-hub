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
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";

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
		perPage: 30,
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

export type PRPeekData = {
	title: string;
	number: number;
	state: string;
	bodyHtml: string;
	user: { login: string; avatar_url: string } | null;
	merged_at: string | null;
	draft: boolean;
	head: { ref: string; sha: string };
	head_repo_owner?: string | null;
	base: { ref: string };
	labels: Array<{ name?: string; color?: string }>;
	additions: number;
	deletions: number;
	changed_files: number;
	created_at: string;
	updated_at: string;
	files: Array<{
		filename: string;
		status: string;
		additions: number;
		deletions: number;
	}>;
	commitsCount: number;
	commentsCount: number;
};

export async function fetchPRPeekDetail(
	owner: string,
	repo: string,
	pullNumber: number,
): Promise<PRPeekData | null> {
	const { bundle, files } = await all({
		bundle: () => getPullRequestBundle(owner, repo, pullNumber),
		files: () => getPullRequestFiles(owner, repo, pullNumber),
	});

	if (!bundle) return null;

	const { pr, issueComments, commits } = bundle;

	const bodyHtml = pr.body
		? await renderMarkdownToHtml(pr.body, undefined, { owner, repo })
		: "";

	return {
		title: pr.title,
		number: pr.number,
		state: pr.state,
		bodyHtml,
		user: pr.user ? { login: pr.user.login, avatar_url: pr.user.avatar_url } : null,
		merged_at: pr.merged_at ?? null,
		draft: pr.draft || false,
		head: { ref: pr.head.ref, sha: pr.head.sha },
		head_repo_owner: pr.head_repo_owner ?? null,
		base: { ref: pr.base.ref },
		labels: (pr.labels || []).map((l) => ({
			name: l.name,
			color: l.color ?? undefined,
		})),
		additions: pr.additions,
		deletions: pr.deletions,
		changed_files: pr.changed_files,
		created_at: pr.created_at,
		updated_at: (pr as { updated_at?: string }).updated_at ?? pr.created_at,
		files: (
			(files ?? []) as Array<{
				filename: string;
				status: string;
				additions: number;
				deletions: number;
			}>
		).map((f) => ({
			filename: f.filename,
			status: f.status,
			additions: f.additions,
			deletions: f.deletions,
		})),
		commitsCount: commits.length,
		commentsCount: issueComments.length,
	};
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
