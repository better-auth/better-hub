"use server";

import { getOctokit } from "@/lib/github";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";
import { getErrorMessage } from "@/lib/utils";

type ForkSyncContext =
	| {
			ok: true;
			octokit: NonNullable<Awaited<ReturnType<typeof getOctokit>>>;
			defaultBranch: string;
			upstreamOwner: string;
			upstreamRepo: string;
			upstreamDefaultBranch: string;
	  }
	| { ok: false; code: ForkSyncErrorCode; error: string };

type ForkSyncErrorCode =
	| "NOT_AUTHENTICATED"
	| "NOT_FORK"
	| "NO_PERMISSION"
	| "UPSTREAM_MISSING"
	| "CONFLICT"
	| "UNKNOWN";

export type ForkSyncActionResult =
	| { success: true; message: string }
	| { success: false; code: ForkSyncErrorCode; error: string };

async function getForkSyncContext(owner: string, repo: string): Promise<ForkSyncContext> {
	const octokit = await getOctokit();
	if (!octokit) {
		return { ok: false, code: "NOT_AUTHENTICATED", error: "Not authenticated" };
	}

	try {
		const { data: repoData } = await octokit.repos.get({ owner, repo });
		if (!repoData.fork) {
			return { ok: false, code: "NOT_FORK", error: "Repository is not a fork" };
		}

		const parent = repoData.parent;
		if (!parent) {
			return {
				ok: false,
				code: "UPSTREAM_MISSING",
				error: "Upstream repository not found",
			};
		}

		const canWrite = Boolean(
			repoData.permissions?.admin ||
			repoData.permissions?.maintain ||
			repoData.permissions?.push,
		);
		if (!canWrite) {
			return {
				ok: false,
				code: "NO_PERMISSION",
				error: "You do not have permission to sync this fork",
			};
		}

		return {
			ok: true,
			octokit,
			defaultBranch: repoData.default_branch,
			upstreamOwner: parent.owner.login,
			upstreamRepo: parent.name,
			upstreamDefaultBranch: parent.default_branch,
		};
	} catch (error: unknown) {
		return {
			ok: false,
			code: "UNKNOWN",
			error: getErrorMessage(error),
		};
	}
}

function revalidateRepoPaths(owner: string, repo: string): void {
	invalidateRepoCache(owner, repo);
	revalidatePath(`/repos/${owner}/${repo}`);
	revalidatePath(`/repos/${owner}/${repo}/code`);
}

export async function deleteBranch(owner: string, repo: string, branch: string) {
	const octokit = await getOctokit();
	if (!octokit) return { success: false };
	try {
		await octokit.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}`);
		return { success: true };
	} catch {
		return { success: false };
	}
}

export async function syncForkWithUpstream(
	owner: string,
	repo: string,
	branch?: string,
): Promise<ForkSyncActionResult> {
	const context = await getForkSyncContext(owner, repo);
	if (!context.ok) {
		return { success: false, code: context.code, error: context.error };
	}

	const targetBranch = branch?.trim() || context.defaultBranch;
	try {
		await context.octokit.repos.mergeUpstream({
			owner,
			repo,
			branch: targetBranch,
		});

		revalidateRepoPaths(owner, repo);
		return { success: true, message: `Updated ${targetBranch} from upstream` };
	} catch (error: unknown) {
		const message = getErrorMessage(error);
		if (message.toLowerCase().includes("up to date")) {
			revalidateRepoPaths(owner, repo);
			return { success: true, message: `${targetBranch} is already up to date` };
		}

		const status = (error as { status?: number })?.status;
		if (status === 409) {
			return {
				success: false,
				code: "CONFLICT",
				error: "Unable to sync automatically due to a merge conflict",
			};
		}

		return {
			success: false,
			code: "UNKNOWN",
			error: message,
		};
	}
}

export async function discardForkCommits(
	owner: string,
	repo: string,
	branch?: string,
): Promise<ForkSyncActionResult> {
	const context = await getForkSyncContext(owner, repo);
	if (!context.ok) {
		return { success: false, code: context.code, error: context.error };
	}

	const targetBranch = branch?.trim() || context.defaultBranch;
	try {
		const { data: upstreamRef } = await context.octokit.git.getRef({
			owner: context.upstreamOwner,
			repo: context.upstreamRepo,
			ref: `heads/${context.upstreamDefaultBranch}`,
		});

		await context.octokit.git.updateRef({
			owner,
			repo,
			ref: `heads/${targetBranch}`,
			sha: upstreamRef.object.sha,
			force: true,
		});

		revalidateRepoPaths(owner, repo);
		return { success: true, message: `Discarded commits on ${targetBranch}` };
	} catch (error: unknown) {
		return {
			success: false,
			code: "UNKNOWN",
			error: getErrorMessage(error),
		};
	}
}
