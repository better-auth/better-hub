"use server";

import { getOctokit } from "@/lib/github";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";

export async function updateRepoSettings(
	owner: string,
	repo: string,
	settings: {
		name?: string;
		description?: string;
		homepage?: string;
		private?: boolean;
		has_wiki?: boolean;
		has_issues?: boolean;
		has_projects?: boolean;
		has_discussions?: boolean;
		allow_merge_commit?: boolean;
		allow_squash_merge?: boolean;
		allow_rebase_merge?: boolean;
		delete_branch_on_merge?: boolean;
	},
) {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };
	try {
		const { data } = await octokit.repos.update({
			owner,
			repo,
			...settings,
		});
		invalidateRepoCache(owner, repo);
		if (settings.name && settings.name !== repo) {
			invalidateRepoCache(owner, settings.name);
		}
		revalidatePath(`/repos/${owner}/${data.name}`);
		return { success: true, newName: data.name };
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : "Failed to update repository";
		return { success: false, error: message };
	}
}

export async function updateRepoTopics(owner: string, repo: string, topics: string[]) {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };
	try {
		await octokit.repos.replaceAllTopics({ owner, repo, names: topics });
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}`);
		return { success: true };
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : "Failed to update topics";
		return { success: false, error: message };
	}
}

export async function updateDefaultBranch(owner: string, repo: string, branch: string) {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };
	try {
		await octokit.repos.update({ owner, repo, default_branch: branch });
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}`);
		return { success: true };
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : "Failed to update default branch";
		return { success: false, error: message };
	}
}

export async function archiveRepository(owner: string, repo: string) {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };
	try {
		await octokit.repos.update({ owner, repo, archived: true });
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}`);
		return { success: true };
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : "Failed to archive repository";
		return { success: false, error: message };
	}
}

export async function deleteRepository(owner: string, repo: string) {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };
	try {
		await octokit.repos.delete({ owner, repo });
		invalidateRepoCache(owner, repo);
		return { success: true };
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : "Failed to delete repository";
		return { success: false, error: message };
	}
}
