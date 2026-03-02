"use server";

import { getRepoTagsPage } from "@/lib/github";

export async function fetchTagsPage(owner: string, repo: string, page: number) {
	return getRepoTagsPage(owner, repo, page);
}
