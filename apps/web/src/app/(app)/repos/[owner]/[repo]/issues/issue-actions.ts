"use server";

import { getOctokit, getIssueComments, invalidateIssueCache } from "@/lib/github";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";

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
