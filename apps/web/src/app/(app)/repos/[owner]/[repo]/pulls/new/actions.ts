"use server";

import { getOctokit, invalidateRepoPullRequestsCache } from "@/lib/github";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";
import { highlightDiffLines, type SyntaxToken } from "@/lib/shiki";

export interface CompareFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

export interface CompareResult {
	ahead_by: number;
	behind_by: number;
	total_commits: number;
	files: CompareFile[];
	commits: Array<{
		sha: string;
		message: string;
		author: { login: string; avatar_url: string } | null;
		date: string;
	}>;
}

export async function compareBranches(
	owner: string,
	repo: string,
	base: string,
	head: string,
): Promise<{ success: boolean; data?: CompareResult; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		const { data } = await octokit.repos.compareCommits({
			owner,
			repo,
			base,
			head,
		});

		return {
			success: true,
			data: {
				ahead_by: data.ahead_by,
				behind_by: data.behind_by,
				total_commits: data.total_commits,
				files: (data.files ?? []).map((f) => ({
					filename: f.filename,
					status: f.status ?? "modified",
					additions: f.additions,
					deletions: f.deletions,
					patch: f.patch,
					previous_filename: f.previous_filename,
				})),
				commits: data.commits.map((c) => ({
					sha: c.sha,
					message: c.commit.message,
					author: c.author
						? {
								login: c.author.login,
								avatar_url: c.author.avatar_url,
							}
						: null,
					date: c.commit.author?.date ?? "",
				})),
			},
		};
	} catch (err: unknown) {
		return { success: false, error: getErrorMessage(err) };
	}
}

export async function createPullRequest(
	owner: string,
	repo: string,
	title: string,
	body: string,
	head: string,
	base: string,
	draft?: boolean,
): Promise<{ success: boolean; number?: number; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		const { data } = await octokit.pulls.create({
			owner,
			repo,
			title,
			body: body || undefined,
			head,
			base,
			draft: draft ?? false,
		});

		await invalidateRepoPullRequestsCache(owner, repo);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/pulls`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true, number: data.number };
	} catch (err: unknown) {
		return {
			success: false,
			error: getErrorMessage(err),
		};
	}
}

export interface BranchInfo {
	name: string;
	isDefault: boolean;
	owner: string;
	repo: string;
}

async function listBranchesForRepo(
	octokit: Awaited<ReturnType<typeof getOctokit>>,
	repoOwner: string,
	repoName: string,
	defaultBranch: string,
): Promise<BranchInfo[]> {
	if (!octokit) return [];
	const branches: BranchInfo[] = [];
	let page = 1;
	while (true) {
		const { data } = await octokit.repos.listBranches({
			owner: repoOwner,
			repo: repoName,
			per_page: 100,
			page,
		});
		for (const b of data) {
			branches.push({
				name: b.name,
				isDefault: b.name === defaultBranch,
				owner: repoOwner,
				repo: repoName,
			});
		}
		if (data.length < 100) break;
		page++;
	}
	return branches;
}

export async function fetchBranches(owner: string, repo: string): Promise<BranchInfo[]> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		const { data: repoData } = await octokit.repos.get({ owner, repo });
		const defaultBranch = repoData.default_branch;

		const originBranches = await listBranchesForRepo(
			octokit,
			owner,
			repo,
			defaultBranch,
		);
		originBranches.sort((a, b) => {
			if (a.isDefault) return -1;
			if (b.isDefault) return 1;
			return a.name.localeCompare(b.name);
		});

		let forkBranches: BranchInfo[] = [];
		try {
			const { data: currentUser } = await octokit.users.getAuthenticated();
			if (currentUser.login !== owner) {
				const { data: userFork } = await octokit.repos.get({
					owner: currentUser.login,
					repo,
				});
				if (userFork.fork) {
					forkBranches = await listBranchesForRepo(
						octokit,
						currentUser.login,
						repo,
						userFork.default_branch ?? "main",
					);
				}
			}
		} catch {
			// user may not have a fork — that's fine
		}

		return [...forkBranches, ...originBranches];
	} catch {
		return [];
	}
}

export async function highlightDiffFiles(
	files: { filename: string; patch?: string }[],
): Promise<Record<string, Record<string, SyntaxToken[]>>> {
	const result: Record<string, Record<string, SyntaxToken[]>> = {};

	await Promise.allSettled(
		files.map(async (file) => {
			if (!file.patch) return;
			const tokens = await highlightDiffLines(file.patch, file.filename);
			if (Object.keys(tokens).length > 0) {
				result[file.filename] = tokens;
			}
		}),
	);

	return result;
}
