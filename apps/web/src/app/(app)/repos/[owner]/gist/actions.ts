"use server";

import { getOctokit } from "@/lib/github";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";

export async function starGist(owner: string, gistId: string) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };
	try {
		await octokit.gists.star({ gist_id: gistId });
		revalidatePath(`/repos/${owner}/gist/${gistId}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to star gist" };
	}
}

export async function unstarGist(owner: string, gistId: string) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };
	try {
		await octokit.gists.unstar({ gist_id: gistId });
		revalidatePath(`/repos/${owner}/gist/${gistId}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to unstar gist" };
	}
}
