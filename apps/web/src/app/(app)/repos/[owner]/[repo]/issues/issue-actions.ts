"use server";

import {
	getOctokit,
	getIssueComments,
	invalidateIssueCache,
	getIssue,
	getRepo,
	getCrossReferences,
	getIssueTimelineEvents,
	getAuthenticatedUser,
	extractRepoPermissions,
	type CrossReference,
	type IssueTimelineEvent,
} from "@/lib/github";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";
import { extractParticipants } from "@/lib/github-utils";
import type { IssueComment } from "@/components/issue/issue-comments-client";
import type { IssueDescriptionEntry } from "@/components/issue/issue-conversation";

export type IssueDetailData = {
	issue: {
		title: string;
		number: number;
		state: string;
		body: string | null;
		created_at: string;
		updated_at?: string;
		closed_at?: string | null;
		state_reason?: string | null;
		locked?: boolean;
		active_lock_reason?: string | null;
		comments: number;
		user: { login: string; avatar_url: string } | null;
		labels: Array<{ name?: string; color?: string | null }>;
		assignees: Array<{ login: string; avatar_url: string }>;
		milestone: {
			title: string;
			description?: string | null;
			open_issues?: number;
			closed_issues?: number;
		} | null;
		closed_by?: { login: string; avatar_url: string } | null;
		reactions?: Record<string, unknown>;
	};
	comments: IssueComment[];
	descriptionEntry: IssueDescriptionEntry;
	crossRefs: CrossReference[];
	timelineEvents: IssueTimelineEvent[];
	participants: Array<{ login: string; avatar_url: string }>;
	currentUserLogin?: string;
	userAvatarUrl?: string;
	userName?: string;
	canEditIssue: boolean;
	canClose: boolean;
	canReopen: boolean;
	viewerHasWriteAccess: boolean;
	isPullRequest: boolean;
};

export async function fetchIssueDetail(
	owner: string,
	repo: string,
	issueNumber: number,
): Promise<IssueDetailData | null> {
	const [issue, rawComments, repoData, crossRefs, currentUser, timelineEvents] =
		await Promise.all([
			getIssue(owner, repo, issueNumber),
			getIssueComments(owner, repo, issueNumber),
			getRepo(owner, repo),
			getCrossReferences(owner, repo, issueNumber),
			getAuthenticatedUser(),
			getIssueTimelineEvents(owner, repo, issueNumber),
		]);

	if (!issue) return null;

	const isPullRequest = (issue as { pull_request?: unknown }).pull_request != null;
	if (isPullRequest) {
		return {
			isPullRequest: true,
			issue: {
				title: issue.title,
				number: issue.number,
				state: issue.state,
				body: issue.body ?? null,
				created_at: issue.created_at,
				comments: issue.comments,
				user: issue.user
					? {
							login: issue.user.login,
							avatar_url: issue.user.avatar_url,
						}
					: null,
				labels: [],
				assignees: [],
				milestone: null,
			},
			comments: [],
			descriptionEntry: {
				type: "description",
				id: "description",
				user: issue.user
					? {
							login: issue.user.login,
							avatar_url: issue.user.avatar_url,
						}
					: null,
				body: issue.body || "",
				created_at: issue.created_at,
			},
			crossRefs: [],
			timelineEvents: [],
			participants: [],
			canEditIssue: false,
			canClose: false,
			canReopen: false,
			viewerHasWriteAccess: false,
		};
	}

	const comments = (rawComments || []) as IssueComment[];
	const issueRefCtx = { owner, repo };
	const [descriptionHtml, ...commentHtmls] = await Promise.all([
		issue.body
			? renderMarkdownToHtml(issue.body, undefined, issueRefCtx)
			: Promise.resolve(""),
		...comments.map((c) =>
			c.body
				? renderMarkdownToHtml(c.body, undefined, issueRefCtx)
				: Promise.resolve(""),
		),
	]);

	const commentsWithHtml: IssueComment[] = comments.map((c, i) => ({
		...c,
		bodyHtml: commentHtmls[i],
	}));

	const descriptionEntry: IssueDescriptionEntry = {
		type: "description",
		id: "description",
		user: issue.user
			? { login: issue.user.login, avatar_url: issue.user.avatar_url }
			: null,
		body: issue.body || "",
		bodyHtml: descriptionHtml,
		created_at: issue.created_at,
		reactions:
			(issue as { reactions?: Record<string, unknown> }).reactions ?? undefined,
	};

	const permissions = extractRepoPermissions(repoData ?? {});
	const currentUserLogin = (currentUser as { login?: string } | null)?.login;
	const isAuthor = currentUserLogin === issue.user?.login && currentUserLogin != null;
	const viewerHasWriteAccess = permissions.push || permissions.maintain || permissions.admin;
	const canTriage = viewerHasWriteAccess || permissions.triage;

	const participants = extractParticipants([
		issue.user ? { login: issue.user.login, avatar_url: issue.user.avatar_url } : null,
		...comments.map((c) =>
			c.user ? { login: c.user.login, avatar_url: c.user.avatar_url } : null,
		),
	]);

	const issueRecord = issue as {
		assignees?: Array<{ login: string; avatar_url: string }>;
		milestone?: {
			title: string;
			description?: string | null;
			open_issues?: number;
			closed_issues?: number;
		} | null;
		state_reason?: string | null;
		updated_at?: string;
		closed_at?: string | null;
		closed_by?: { login: string; avatar_url: string } | null;
		locked?: boolean;
		active_lock_reason?: string | null;
		reactions?: Record<string, unknown>;
	};

	return {
		issue: {
			title: issue.title,
			number: issue.number,
			state: issue.state,
			body: issue.body ?? null,
			created_at: issue.created_at,
			updated_at: issueRecord.updated_at,
			closed_at: issueRecord.closed_at ?? null,
			state_reason: issueRecord.state_reason ?? null,
			locked: issueRecord.locked ?? false,
			active_lock_reason: issueRecord.active_lock_reason ?? null,
			comments: issue.comments,
			user: issue.user
				? { login: issue.user.login, avatar_url: issue.user.avatar_url }
				: null,
			labels: (issue.labels || []).map((l) =>
				typeof l === "string"
					? { name: l }
					: { name: l.name, color: l.color ?? null },
			),
			assignees: (issueRecord.assignees || []).map((a) => ({
				login: a.login,
				avatar_url: a.avatar_url,
			})),
			milestone: issueRecord.milestone
				? {
						title: issueRecord.milestone.title,
						description:
							issueRecord.milestone.description ?? null,
						open_issues: issueRecord.milestone.open_issues,
						closed_issues: issueRecord.milestone.closed_issues,
					}
				: null,
			closed_by: issueRecord.closed_by ?? null,
			reactions: issueRecord.reactions,
		},
		comments: commentsWithHtml,
		descriptionEntry,
		crossRefs,
		timelineEvents,
		participants,
		currentUserLogin,
		userAvatarUrl: (currentUser as { avatar_url?: string } | null)?.avatar_url,
		userName: currentUserLogin,
		canEditIssue: !!(currentUserLogin && (isAuthor || viewerHasWriteAccess)),
		canClose: canTriage || isAuthor,
		canReopen: canTriage,
		viewerHasWriteAccess,
		isPullRequest: false,
	};
}

export async function fetchIssueComments(owner: string, repo: string, issueNumber: number) {
	const comments = await getIssueComments(owner, repo, issueNumber);
	if (!Array.isArray(comments)) return comments;

	const withHtml = await Promise.all(
		comments.map(async (c: Record<string, unknown>) => {
			const body = (c.body as string) || "";
			const bodyHtml = body
				? await renderMarkdownToHtml(body, undefined, { owner, repo })
				: "";
			return { ...c, bodyHtml };
		}),
	);
	return withHtml;
}

export async function addIssueComment(
	owner: string,
	repo: string,
	issueNumber: number,
	body: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.issues.createComment({
			owner,
			repo,
			issue_number: issueNumber,
			body,
		});
		await invalidateIssueCache(owner, repo, issueNumber);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) };
	}
}

export async function updateIssueComment(
	owner: string,
	repo: string,
	issueNumber: number,
	commentId: number,
	body: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.issues.updateComment({
			owner,
			repo,
			comment_id: commentId,
			body,
		});
		await invalidateIssueCache(owner, repo, issueNumber);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) };
	}
}

export async function deleteIssueComment(
	owner: string,
	repo: string,
	issueNumber: number,
	commentId: number,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.issues.deleteComment({
			owner,
			repo,
			comment_id: commentId,
		});
		await invalidateIssueCache(owner, repo, issueNumber);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to delete comment" };
	}
}

export async function closeIssue(
	owner: string,
	repo: string,
	issueNumber: number,
	stateReason: "completed" | "not_planned",
	comment?: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		if (comment?.trim()) {
			await octokit.issues.createComment({
				owner,
				repo,
				issue_number: issueNumber,
				body: comment.trim(),
			});
		}
		await octokit.issues.update({
			owner,
			repo,
			issue_number: issueNumber,
			state: "closed",
			state_reason: stateReason,
		});
		await invalidateIssueCache(owner, repo, issueNumber);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/issues`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) };
	}
}

export async function updateIssue(
	owner: string,
	repo: string,
	issueNumber: number,
	title: string,
	body: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		await octokit.issues.update({
			owner,
			repo,
			issue_number: issueNumber,
			title,
			body,
		});
		await invalidateIssueCache(owner, repo, issueNumber);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/issues`);
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) };
	}
}

export async function reopenIssue(
	owner: string,
	repo: string,
	issueNumber: number,
	comment?: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };

	try {
		if (comment?.trim()) {
			await octokit.issues.createComment({
				owner,
				repo,
				issue_number: issueNumber,
				body: comment.trim(),
			});
		}
		await octokit.issues.update({
			owner,
			repo,
			issue_number: issueNumber,
			state: "open",
		});
		await invalidateIssueCache(owner, repo, issueNumber);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/issues/${issueNumber}`);
		revalidatePath(`/repos/${owner}/${repo}/issues`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true };
	} catch (e: unknown) {
		return { error: getErrorMessage(e) };
	}
}
