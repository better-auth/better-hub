import type { CommitInfo, DiffFileState, FileDiff, GetCommitDiffResult } from "@pierre/storage";

function mapFileState(state: DiffFileState): string {
	if (state === "deleted") return "removed";
	return state;
}

/** Shape expected by the web CommitDetail / CommitDetailData (GitHub-like). */
export function buildCommitDetailPayload(
	fullSha: string,
	meta: CommitInfo | null,
	diff: GetCommitDiffResult,
	repoBasePath: string,
): {
	sha: string;
	html_url: string;
	commit: {
		message: string;
		author: { name?: string | null; date?: string | null } | null;
		committer: { name?: string | null; date?: string | null } | null;
	};
	author: {
		login: string;
		avatar_url: string;
		html_url: string;
	} | null;
	committer: {
		login: string;
		avatar_url: string;
		html_url: string;
	} | null;
	parents: { sha: string; html_url: string }[];
	stats?: { total: number; additions: number; deletions: number };
	files: Array<{
		filename: string;
		status: string;
		additions: number;
		deletions: number;
		patch?: string;
		previous_filename?: string;
	}>;
} {
	const message = meta?.message ?? `Commit ${fullSha.slice(0, 7)}`;
	const authorName = meta?.authorName ?? "Unknown";
	const dateIso = meta ? meta.rawDate || meta.date.toISOString() : null;

	const mapFile = (f: FileDiff) => ({
		filename: f.path,
		status: mapFileState(f.state),
		additions: f.additions,
		deletions: f.deletions,
		patch: f.raw,
		...(f.oldPath ? { previous_filename: f.oldPath } : {}),
	});

	return {
		sha: fullSha,
		html_url: `${repoBasePath}/commits/${fullSha}`,
		commit: {
			message,
			author: { name: authorName, date: dateIso },
			committer: {
				name: meta?.committerName ?? authorName,
				date: dateIso,
			},
		},
		author: null,
		committer: null,
		parents: [],
		stats: {
			total: diff.stats.files,
			additions: diff.stats.additions,
			deletions: diff.stats.deletions,
		},
		files: diff.files.map(mapFile),
	};
}

/** GitHub-shaped row for CommitsList (author null → initials / name from commit.author). */
export function commitInfoToGithubListRow(c: CommitInfo): {
	sha: string;
	commit: {
		message: string;
		author: { name?: string | null; date?: string | null } | null;
	};
	author: Record<string, never> | null;
	html_url: string;
} {
	const dateIso = c.rawDate || c.date.toISOString();
	return {
		sha: c.sha,
		commit: {
			message: c.message,
			author: { name: c.authorName, date: dateIso },
		},
		author: null,
		html_url: "",
	};
}
