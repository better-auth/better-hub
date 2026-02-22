"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
	pinItem,
	unpinItem,
	getPinnedItemUrls,
	getPinnedItems,
	type PinnedItem,
} from "@/lib/pinned-items-store";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";

export async function pinToOverview(
	owner: string,
	repo: string,
	url: string,
	title: string,
	itemType: string,
) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return { error: "Not authenticated" };

	await pinItem(session.user.id, owner, repo, url, title, itemType);
	invalidateRepoCache(owner, repo);
	revalidatePath(`/repos/${owner}/${repo}`);
	return { success: true };
}

export async function unpinFromOverview(owner: string, repo: string, url: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return { error: "Not authenticated" };

	await unpinItem(session.user.id, owner, repo, url);
	invalidateRepoCache(owner, repo);
	revalidatePath(`/repos/${owner}/${repo}`);
	return { success: true };
}

export async function fetchPinnedItemsForRepo(owner: string, repo: string): Promise<PinnedItem[]> {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return [];
	return getPinnedItems(session.user.id, owner, repo);
}

export async function getPinnedUrlsForRepo(owner: string, repo: string): Promise<string[]> {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) return [];
	return getPinnedItemUrls(session.user.id, owner, repo);
}
