import type { CommitInfo } from "@pierre/storage";

type RemoteListCommits = {
	listCommits: (options?: { branch?: string; cursor?: string; limit?: number }) => Promise<{
		commits: CommitInfo[];
		nextCursor?: string;
		hasMore: boolean;
	}>;
};

function shaMatches(candidate: string, requested: string): boolean {
	const c = candidate.toLowerCase();
	const r = requested.toLowerCase();
	return c === r || (r.length >= 7 && c.startsWith(r));
}

/**
 * Walk paginated listCommits until `targetSha` is found or history ends.
 */
export async function findCommitMetadataInBranch(
	remote: RemoteListCommits,
	branch: string,
	targetSha: string,
	options?: { maxPages?: number; pageSize?: number },
): Promise<CommitInfo | null> {
	const maxPages = options?.maxPages ?? 40;
	const pageSize = options?.pageSize ?? 100;
	let cursor: string | undefined;

	for (let page = 0; page < maxPages; page++) {
		const opts: { branch: string; cursor?: string; limit: number } = {
			branch,
			limit: pageSize,
		};
		if (cursor !== undefined) opts.cursor = cursor;
		const result = await remote.listCommits(opts);
		const hit = result.commits.find((c) => shaMatches(c.sha, targetSha));
		if (hit) return hit;
		if (!result.hasMore || !result.nextCursor) return null;
		cursor = result.nextCursor;
	}

	return null;
}
