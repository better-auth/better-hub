import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { auth } from "./auth";
import { prisma } from "@/lib/db";

export type StorageListItem = {
	name: string;
	path: string;
	type: "file" | "dir";
	size?: number;
};

export type ListStorageDirectoryResult =
	| { ok: false; reason: "no_branches"; defaultBranch: string }
	| { ok: false; reason: "ref_not_found"; ref: string; defaultBranch: string }
	| {
			ok: true;
			items: StorageListItem[];
			resolvedRef: string;
			defaultBranch: string;
	  };

export type StorageBlobResult =
	| { kind: "no_branches"; defaultBranch: string }
	| { kind: "ref_not_found"; ref: string }
	| { kind: "file_not_found" }
	| { kind: "file"; content: string; size: number };

export type StorageGitMeta = {
	defaultBranch: string;
	branches: { name: string }[];
	files: Array<{ path: string; size: number }> | null;
};

export async function getMemberStorageRepository(owner: string, repo: string, userId: string) {
	const slug = `${owner}/${repo}`;
	return prisma.repository.findFirst({
		where: {
			slug,
			repositorymembers: { some: { userId } },
		},
	});
}

function storageSlug(owner: string, repo: string): `${string}/${string}` {
	return `${owner}/${repo}`;
}

export async function getStorageGitMeta(
	owner: string,
	repo: string,
): Promise<StorageGitMeta | null> {
	const slug = storageSlug(owner, repo);
	const h = await headers();
	try {
		return await auth.api.repoGitMeta({
			query: { slug },
			headers: h,
		});
	} catch (e) {
		if (isAPIError(e) && e.statusCode === 404) return null;
		throw e;
	}
}

export async function listStorageDirectory(
	owner: string,
	repo: string,
	options: { ref?: string; pathPrefix: string },
): Promise<ListStorageDirectoryResult | null> {
	const slug = storageSlug(owner, repo);
	const h = await headers();
	try {
		return await auth.api.repoListDirectory({
			query: {
				slug,
				ref: options.ref,
				pathPrefix: options.pathPrefix,
			},
			headers: h,
		});
	} catch (e) {
		if (isAPIError(e) && e.statusCode === 404) return null;
		throw e;
	}
}

export async function getStorageFileText(
	owner: string,
	repo: string,
	path: string,
	ref: string,
): Promise<StorageBlobResult | null> {
	const slug = storageSlug(owner, repo);
	const h = await headers();
	try {
		return await auth.api.repoFile({
			query: { slug, ref, path },
			headers: h,
		});
	} catch (e) {
		if (isAPIError(e) && e.statusCode === 404) return null;
		throw e;
	}
}
