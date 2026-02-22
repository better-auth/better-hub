"use server";

import { getOctokit } from "@/lib/github";
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
