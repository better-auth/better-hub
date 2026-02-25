"use server";

import { getOctokit, getGitHubToken } from "@/lib/github";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { setCachedReadmeHtml } from "@/lib/readme-cache";
import {
	setCachedRepoLanguages,
	setCachedContributorAvatars,
	setCachedBranches,
	setCachedTags,
	type ContributorAvatar,
	type BranchRef,
} from "@/lib/repo-data-cache";

export async function revalidateReadme(
	owner: string,
	repo: string,
	branch: string,
): Promise<string | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		const { data } = await octokit.repos.getReadme({
			owner,
			repo,
			ref: branch,
		});
		const content = Buffer.from(data.content, "base64").toString("utf-8");
		const html = await renderMarkdownToHtml(content, { owner, repo, branch });
		await setCachedReadmeHtml(owner, repo, html);
		return html;
	} catch {
		return null;
	}
}

export async function fetchReadmeMarkdown(
	owner: string,
	repo: string,
	branch: string,
): Promise<string | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		const { data } = await octokit.repos.getReadme({
			owner,
			repo,
			ref: branch,
		});
		return Buffer.from(data.content, "base64").toString("utf-8");
	} catch {
		return null;
	}
}

export async function revalidateLanguages(
	owner: string,
	repo: string,
): Promise<Record<string, number> | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		const { data } = await octokit.repos.listLanguages({ owner, repo });
		await setCachedRepoLanguages(owner, repo, data);
		return data;
	} catch {
		return null;
	}
}

export async function revalidateContributorAvatars(
	owner: string,
	repo: string,
): Promise<{ avatars: ContributorAvatar[]; totalCount: number } | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		const response = await octokit.repos.listContributors({
			owner,
			repo,
			per_page: 30,
		});
		const avatars: ContributorAvatar[] = response.data
			.filter((c): c is typeof c & { login: string } => !!c.login)
			.map((c) => ({ login: c.login!, avatar_url: c.avatar_url ?? "" }));

		let totalCount = avatars.length;
		const linkHeader = response.headers.link;
		if (linkHeader) {
			const lastMatch = linkHeader.match(/[&?]page=(\d+)>;\s*rel="last"/);
			if (lastMatch) {
				totalCount = (parseInt(lastMatch[1], 10) - 1) * 30 + avatars.length;
			}
		}

		await setCachedContributorAvatars(owner, repo, { avatars, totalCount });
		return { avatars, totalCount };
	} catch {
		return null;
	}
}

export async function revalidateBranches(owner: string, repo: string): Promise<BranchRef[] | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		const { data } = await octokit.repos.listBranches({
			owner,
			repo,
			per_page: 100,
		});
		const branches: BranchRef[] = data.map((b) => ({ name: b.name }));
		await setCachedBranches(owner, repo, branches);
		return branches;
	} catch {
		return null;
	}
}

export async function revalidateTags(owner: string, repo: string): Promise<BranchRef[] | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		const { data } = await octokit.repos.listTags({
			owner,
			repo,
			per_page: 100,
		});
		const tags: BranchRef[] = data.map((t) => ({ name: t.name }));
		await setCachedTags(owner, repo, tags);
		return tags;
	} catch {
		return null;
	}
}

export interface DependentRepo {
	owner: string;
	name: string;
	full_name: string;
	description: string | null;
	stars: number;
	avatar_url: string;
}

export interface UsedByData {
	dependents: DependentRepo[];
	total_count: number;
	package_name: string | null;
}

export async function fetchUsedBy(owner: string, repo: string): Promise<UsedByData | null> {
	const token = await getGitHubToken();
	if (!token) return null;

	try {
		// 1. Detect the package name from package.json
		const octokit = await getOctokit();
		if (!octokit) return null;

		let packageName: string | null = null;
		try {
			const { data } = await octokit.repos.getContent({
				owner,
				repo,
				path: "package.json",
			});
			if ("content" in data) {
				const content = Buffer.from(data.content, "base64").toString(
					"utf-8",
				);
				const pkg = JSON.parse(content);
				packageName = pkg.name || null;
			}
		} catch {
			// No package.json or couldn't parse — try pyproject.toml/setup.py name from repo name
			packageName = repo;
		}

		if (!packageName) return null;

		// 2. Search for repos that depend on this package using code search
		// Search in package.json dependencies for npm packages
		const searchQuery = `"${packageName}" filename:package.json NOT repo:${owner}/${repo}`;
		const res = await fetch(
			`https://api.github.com/search/code?${new URLSearchParams({
				q: searchQuery,
				per_page: "30",
			})}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/vnd.github+json",
				},
			},
		);

		if (!res.ok) return null;
		const searchData = await res.json();

		// 3. Deduplicate by repo and collect repo info
		const seen = new Set<string>();
		const dependents: DependentRepo[] = [];

		for (const item of searchData.items ?? []) {
			const repoFullName = item.repository?.full_name;
			if (!repoFullName || seen.has(repoFullName)) continue;
			// Skip the source repo itself
			if (repoFullName === `${owner}/${repo}`) continue;
			seen.add(repoFullName);

			dependents.push({
				owner: item.repository.owner?.login ?? "",
				name: item.repository.name ?? "",
				full_name: repoFullName,
				description: item.repository.description ?? null,
				stars: item.repository.stargazers_count ?? 0,
				avatar_url: item.repository.owner?.avatar_url ?? "",
			});
		}

		// Sort by stars descending
		dependents.sort((a, b) => b.stars - a.stars);

		return {
			dependents,
			total_count: searchData.total_count ?? dependents.length,
			package_name: packageName,
		};
	} catch {
		return null;
	}
}
