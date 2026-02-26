"use server";

import { revalidatePath } from "next/cache";
import {
	createPromptRequest,
	updatePromptRequestStatus,
	acceptPromptRequest as acceptPromptRequestStore,
	deletePromptRequest,
	getPromptRequest,
	createPromptRequestComment,
	deletePromptRequestComment,
	getPromptRequestComment,
	addPromptRequestReaction,
	removePromptRequestReaction,
	listPromptRequestReactions,
	type PromptReactionContent,
} from "@/lib/prompt-request-store";
import { auth, getServerSession } from "@/lib/auth";
import { headers } from "next/headers";
import { getOctokit, extractRepoPermissions } from "@/lib/github";

async function assertAuthorOrMaintainer(promptUserId: string, owner: string, repo: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) throw new Error("Unauthorized");

	// Author can always manage their own prompt
	if (session.user.id === promptUserId) return session;

	// Check if user is a repo maintainer via GitHub API
	const octokit = await getOctokit();
	if (!octokit) throw new Error("Unauthorized");

	const { data } = await octokit.repos.get({ owner, repo });
	const perms = extractRepoPermissions(data);
	if (!perms.push && !perms.admin && !perms.maintain) {
		throw new Error("Not authorized");
	}

	return session;
}

async function assertMaintainer(owner: string, repo: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) throw new Error("Unauthorized");

	const octokit = await getOctokit();
	if (!octokit) throw new Error("Unauthorized");

	const { data } = await octokit.repos.get({ owner, repo });
	const perms = extractRepoPermissions(data);
	if (!perms.push && !perms.admin && !perms.maintain) {
		throw new Error("Not authorized");
	}

	return session;
}

export async function acceptPromptRequestAction(id: string) {
	const pr = await getPromptRequest(id);
	if (!pr) throw new Error("Prompt request not found");
	if (pr.status !== "open") throw new Error("Prompt request is not open");

	const session = await assertMaintainer(pr.owner, pr.repo);

	await acceptPromptRequestStore(id, session.user.id, session.user.name);
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${id}`);
}

export async function createPromptRequestAction(owner: string, repo: string, body: string) {
	const session = await getServerSession();
	if (!session?.user?.id) throw new Error("Unauthorized");

	// Auto-generate title from first line of body
	const firstLine =
		body
			.split("\n")[0]
			?.replace(/^#+\s*/, "")
			.trim() || "Untitled prompt";
	const title = firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine;

	const pr = await createPromptRequest(
		session.user.id,
		session.githubUser?.login ?? null,
		session.user.name,
		session.user.image ?? null,
		owner,
		repo,
		title,
		body,
	);
	revalidatePath(`/repos/${owner}/${repo}/prompts`);
	return pr;
}

export async function closePromptRequest(id: string) {
	const pr = await getPromptRequest(id);
	if (!pr) throw new Error("Prompt request not found");

	await assertAuthorOrMaintainer(pr.userId, pr.owner, pr.repo);

	await updatePromptRequestStatus(id, "closed");
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${id}`);
}

export async function reopenPromptRequest(id: string) {
	const pr = await getPromptRequest(id);
	if (!pr) throw new Error("Prompt request not found");
	if (pr.status !== "closed") throw new Error("Prompt request is not closed");

	await assertAuthorOrMaintainer(pr.userId, pr.owner, pr.repo);

	await updatePromptRequestStatus(id, "open");
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${id}`);
}

export async function deletePromptRequestAction(id: string) {
	const pr = await getPromptRequest(id);
	if (!pr) throw new Error("Prompt request not found");

	await assertAuthorOrMaintainer(pr.userId, pr.owner, pr.repo);

	await deletePromptRequest(id);
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts`);
}

export async function addPromptComment(promptRequestId: string, body: string) {
	const session = await getServerSession();
	if (!session?.user?.id) throw new Error("Unauthorized");

	const pr = await getPromptRequest(promptRequestId);
	if (!pr) throw new Error("Prompt request not found");

	const comment = await createPromptRequestComment(
		promptRequestId,
		session.user.id,
		session.githubUser?.login ?? null,
		session.user.name,
		session.user.image ?? "",
		body,
	);

	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${promptRequestId}`);
	return comment;
}

export async function deletePromptComment(commentId: string, promptRequestId: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) throw new Error("Unauthorized");

	const comment = await getPromptRequestComment(commentId);
	if (!comment) throw new Error("Comment not found");
	if (comment.userId !== session.user.id)
		throw new Error("Not authorized to delete this comment");

	const pr = await getPromptRequest(promptRequestId);
	if (!pr) throw new Error("Prompt request not found");

	await deletePromptRequestComment(commentId);
	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${promptRequestId}`);
}

export async function togglePromptReaction(
	promptRequestId: string,
	content: PromptReactionContent,
) {
	const session = await getServerSession();
	if (!session?.user?.id) throw new Error("Unauthorized");

	const pr = await getPromptRequest(promptRequestId);
	if (!pr) throw new Error("Prompt request not found");

	const existing = await listPromptRequestReactions(promptRequestId);
	const userReaction = existing.find(
		(r) => r.userId === session.user.id && r.content === content,
	);

	if (userReaction) {
		await removePromptRequestReaction(promptRequestId, session.user.id, content);
	} else {
		await addPromptRequestReaction(
			promptRequestId,
			session.user.id,
			session.githubUser?.login ?? null,
			session.user.name,
			session.user.image ?? "",
			content,
		);
	}

	revalidatePath(`/repos/${pr.owner}/${pr.repo}/prompts/${promptRequestId}`);
}

export async function getPromptReactions(promptRequestId: string) {
	return listPromptRequestReactions(promptRequestId);
}
