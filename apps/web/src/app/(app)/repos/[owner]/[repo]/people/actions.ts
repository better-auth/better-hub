"use server";

import { getOctokit } from "@/lib/github";
import { revalidatePath } from "next/cache";

export async function inviteOrgMember(
	org: string,
	username: string,
	role: "member" | "admin" = "member",
): Promise<{ success: boolean; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		await octokit.orgs.setMembershipForUser({
			org,
			username,
			role,
		});
		revalidatePath(`/repos/${org}`);
		return { success: true };
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Failed to invite member";
		return { success: false, error: msg };
	}
}

export async function removeOrgMember(
	org: string,
	username: string,
): Promise<{ success: boolean; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		await octokit.orgs.removeMember({ org, username });
		revalidatePath(`/repos/${org}`);
		return { success: true };
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : "Failed to remove member";
		return { success: false, error: msg };
	}
}
