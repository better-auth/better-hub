"use server";

import { getRepoCommits, getCommit } from "@/lib/github";
import { highlightDiffLines, type SyntaxToken } from "@/lib/shiki";

export async function fetchCommitsByDate(
	owner: string,
	repo: string,
	since?: string,
	until?: string,
	branch?: string,
) {
	return getRepoCommits(
		owner,
		repo,
		branch || undefined,
		1,
		30,
		since || undefined,
		until || undefined,
	);
}

export async function fetchCommitsPage(
	owner: string,
	repo: string,
	page: number,
	branch?: string,
	since?: string,
	until?: string,
) {
	return getRepoCommits(
		owner,
		repo,
		branch || undefined,
		page,
		30,
		since || undefined,
		until || undefined,
	);
}

export async function fetchLatestCommit(owner: string, repo: string) {
	try {
		const commits = await getRepoCommits(owner, repo, undefined, 1, 1);
		const c = commits[0];
		if (!c) return null;
		return {
			sha: c.sha,
			message: (c.commit.message ?? "").split("\n")[0],
			date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
			author: c.author
				? { login: c.author.login, avatarUrl: c.author.avatar_url }
				: c.commit.author?.name
					? { login: c.commit.author.name, avatarUrl: "" }
					: null,
		};
	} catch {
		return null;
	}
}

export type CommitDetailData = {
	sha: string;
	html_url: string;
	commit: {
		message: string;
		author: {
			name?: string | null;
			date?: string | null;
		} | null;
		committer: {
			name?: string | null;
			date?: string | null;
		} | null;
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
	stats?: {
		total: number;
		additions: number;
		deletions: number;
	};
	files: Array<{
		filename: string;
		status: string;
		additions: number;
		deletions: number;
		patch?: string;
		previous_filename?: string;
	}>;
};

export async function fetchCommitDetail(
	owner: string,
	repo: string,
	sha: string,
): Promise<{
	commit: CommitDetailData | null;
	highlightData: Record<string, Record<string, SyntaxToken[]>>;
}> {
	const commit = await getCommit(owner, repo, sha);

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
						// silent - fall back to plain text
					}
				}
			}),
		);
	}

	return {
		commit: commit as CommitDetailData,
		highlightData,
	};
}
