"use server";

import {
	getRepoPullRequests,
	getRepoIssues,
	getCommitActivity,
	getRepoEvents,
	getOctokit,
	fetchCheckStatusForRef,
	type CommitActivityWeek,
	type CheckStatus,
} from "@/lib/github";
import {
	setCachedOverviewPRs,
	setCachedOverviewIssues,
	setCachedOverviewEvents,
	setCachedOverviewCommitActivity,
	setCachedOverviewCI,
} from "@/lib/repo-data-cache";

export interface OverviewPRItem {
	number: number;
	title: string;
	user: { login: string; avatar_url: string } | null;
	created_at: string;
	comments: number;
	draft?: boolean;
}

export interface OverviewIssueItem {
	number: number;
	title: string;
	user: { login: string; avatar_url: string } | null;
	created_at: string;
	comments: number;
	reactions?: { total_count: number };
	labels?: Array<{ name?: string; color?: string }>;
}

export interface OverviewRepoEvent {
	type: string;
	actor: { login: string; avatar_url: string } | null;
	created_at: string;
	repo?: { name: string };
	payload?: {
		action?: string;
		ref?: string;
		ref_type?: string;
		size?: number;
		commits?: { sha: string; message: string }[];
		pull_request?: { number: number; title: string };
		issue?: { number: number; title: string };
		comment?: { body: string };
		forkee?: { full_name: string };
		release?: { tag_name: string; name: string };
	};
}

export async function fetchOverviewPRs(owner: string, repo: string): Promise<OverviewPRItem[]> {
	const raw = await getRepoPullRequests(owner, repo, "open");
	if (!raw) return [];
	const result = raw.map((pr) => ({
		number: pr.number,
		title: pr.title,
		user: pr.user ? { login: pr.user.login, avatar_url: pr.user.avatar_url } : null,
		created_at: pr.created_at,
		comments: 0,
		draft: pr.draft,
	}));
	await setCachedOverviewPRs(owner, repo, result);
	return result;
}

export async function fetchOverviewIssues(
	owner: string,
	repo: string,
): Promise<OverviewIssueItem[]> {
	const raw = await getRepoIssues(owner, repo, "open");
	if (!raw) return [];
	const result = raw
		.filter((item) => !item.pull_request)
		.map((issue) => ({
			number: issue.number,
			title: issue.title,
			user: issue.user
				? { login: issue.user.login, avatar_url: issue.user.avatar_url }
				: null,
			created_at: issue.created_at,
			comments: issue.comments ?? 0,
			reactions: issue.reactions
				? { total_count: issue.reactions.total_count ?? 0 }
				: undefined,
			labels: issue.labels?.map((l) =>
				typeof l === "string"
					? { name: l }
					: { name: l.name, color: l.color ?? undefined },
			),
		}));
	await setCachedOverviewIssues(owner, repo, result);
	return result;
}

export async function fetchOverviewCommitActivity(
	owner: string,
	repo: string,
): Promise<CommitActivityWeek[]> {
	const result = await getCommitActivity(owner, repo);
	await setCachedOverviewCommitActivity(owner, repo, result);
	return result;
}

export async function fetchOverviewEvents(
	owner: string,
	repo: string,
): Promise<OverviewRepoEvent[]> {
	const raw = await getRepoEvents(owner, repo, 30);
	const result = raw as OverviewRepoEvent[];
	await setCachedOverviewEvents(owner, repo, result);
	return result;
}

export async function fetchOverviewCIStatus(
	owner: string,
	repo: string,
	defaultBranch: string,
): Promise<CheckStatus | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;
	const result = await fetchCheckStatusForRef(octokit, owner, repo, defaultBranch);
	if (result) await setCachedOverviewCI(owner, repo, result);
	return result;
}
