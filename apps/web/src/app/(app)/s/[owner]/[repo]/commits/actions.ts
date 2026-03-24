"use server";

import { listStorageCommits, getStorageCommitDetailPayload } from "@/lib/storage-git";
import { highlightDiffLines, type SyntaxToken } from "@/lib/shiki";
import type { CommitDetailData } from "@/app/(app)/repos/[owner]/[repo]/commits/actions";
import type { StorageCommitListRow } from "@/lib/storage-git";

export async function fetchStorageCommitsByDate(
	owner: string,
	repo: string,
	_since?: string,
	_until?: string,
	branch?: string,
): Promise<{ commits: StorageCommitListRow[]; nextCursor: string | null; hasMore: boolean }> {
	return (
		(await listStorageCommits(owner, repo, { branch, limit: 30 })) ?? {
			commits: [],
			nextCursor: null,
			hasMore: false,
		}
	);
}

export async function fetchStorageCommitsNext(
	owner: string,
	repo: string,
	branch: string,
	cursor: string,
	_since?: string,
	_until?: string,
): Promise<{ commits: StorageCommitListRow[]; nextCursor: string | null; hasMore: boolean }> {
	return (
		(await listStorageCommits(owner, repo, { branch, cursor, limit: 30 })) ?? {
			commits: [],
			nextCursor: null,
			hasMore: false,
		}
	);
}

export async function fetchStorageCommitDetail(
	owner: string,
	repo: string,
	sha: string,
	branch?: string,
): Promise<{
	commit: CommitDetailData | null;
	highlightData: Record<string, Record<string, SyntaxToken[]>>;
}> {
	const commit = await getStorageCommitDetailPayload(owner, repo, sha, branch);
	if (!commit) {
		return { commit: null, highlightData: {} };
	}

	const highlightData: Record<string, Record<string, SyntaxToken[]>> = {};
	if (commit.files && commit.files.length > 0) {
		await Promise.all(
			commit.files.map(async (file: { filename: string; patch?: string }) => {
				if (file.patch) {
					try {
						highlightData[file.filename] =
							await highlightDiffLines(
								file.patch,
								file.filename,
							);
					} catch {
						// silent
					}
				}
			}),
		);
	}

	return { commit, highlightData };
}
