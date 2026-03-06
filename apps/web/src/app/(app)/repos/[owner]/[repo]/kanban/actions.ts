"use server";

import { revalidatePath } from "next/cache";
import {
	createKanbanItem,
	getKanbanItem,
	getKanbanItemByIssue,
	listKanbanItems,
	updateKanbanItemStatus,
	updateKanbanItemAssignee,
	updateKanbanItemAiSummary,
	syncKanbanItemFromIssue,
	deleteKanbanItem,
	createKanbanComment,
	deleteKanbanComment as deleteKanbanCommentStore,
	updateKanbanComment as updateKanbanCommentStore,
	getKanbanComment,
	type KanbanStatus,
} from "@/lib/kanban-store";
import { auth, getServerSession } from "@/lib/auth";
import { headers } from "next/headers";
import { getOctokit, extractRepoPermissions, getCrossReferences, getIssue } from "@/lib/github";

async function assertMaintainer(owner: string, repo: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) throw new Error("Unauthorized");

	const octokit = await getOctokit();
	if (!octokit) throw new Error("Unauthorized");

	const { data } = await octokit.repos.get({ owner, repo });
	const perms = extractRepoPermissions(data);
	if (!perms.push && !perms.admin && !perms.maintain) {
		throw new Error("Not authorized - maintainer access required");
	}

	return session;
}

export async function addIssueToKanban(owner: string, repo: string, issueNumber: number) {
	await assertMaintainer(owner, repo);

	const existing = await getKanbanItemByIssue(owner, repo, issueNumber);
	if (existing) {
		throw new Error("Issue is already on the kanban board");
	}

	const octokit = await getOctokit();
	if (!octokit) throw new Error("Failed to connect to GitHub");

	const { data: issue } = await octokit.issues.get({
		owner,
		repo,
		issue_number: issueNumber,
	});

	const assignee = issue.assignees?.[0] ?? issue.assignee;

	const item = await createKanbanItem(
		owner,
		repo,
		issueNumber,
		issue.title,
		issue.html_url,
		issue.body ?? null,
		assignee?.login ?? null,
		assignee?.avatar_url ?? null,
	);

	revalidatePath(`/repos/${owner}/${repo}/kanban`);

	return item;
}

export async function moveKanbanItem(id: string, status: KanbanStatus) {
	const item = await getKanbanItem(id);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	const updated = await updateKanbanItemStatus(id, status);

	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban`);
	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${id}`);

	return updated;
}

export async function setKanbanItemAssignee(
	id: string,
	assigneeLogin: string | null,
	assigneeAvatar: string | null,
) {
	const item = await getKanbanItem(id);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	const updated = await updateKanbanItemAssignee(id, assigneeLogin, assigneeAvatar);

	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban`);
	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${id}`);

	return updated;
}

export async function setKanbanItemAiSummary(id: string, aiSummary: string) {
	const item = await getKanbanItem(id);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	const updated = await updateKanbanItemAiSummary(id, aiSummary);

	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban`);
	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${id}`);

	return updated;
}

export async function removeKanbanItem(id: string) {
	const item = await getKanbanItem(id);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	await deleteKanbanItem(id);

	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban`);
}

export async function syncKanbanItemFromGitHub(id: string) {
	const item = await getKanbanItem(id);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	const octokit = await getOctokit();
	if (!octokit) throw new Error("Failed to connect to GitHub");

	const { data: issue } = await octokit.issues.get({
		owner: item.owner,
		repo: item.repo,
		issue_number: item.issueNumber,
	});

	const assignee = issue.assignees?.[0] ?? issue.assignee;

	const updated = await syncKanbanItemFromIssue(
		id,
		issue.title,
		issue.body ?? null,
		assignee?.login ?? null,
		assignee?.avatar_url ?? null,
	);

	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban`);
	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${id}`);

	return updated;
}

export async function syncAllKanbanStatuses(owner: string, repo: string) {
	await assertMaintainer(owner, repo);

	const items = await listKanbanItems(owner, repo);
	const octokit = await getOctokit();
	if (!octokit) throw new Error("Failed to connect to GitHub");

	const updates: { id: string; newStatus: KanbanStatus }[] = [];

	for (const item of items) {
		if (item.status === "done") continue;

		try {
			const { data: issue } = await octokit.issues.get({
				owner,
				repo,
				issue_number: item.issueNumber,
			});

			const assignee = issue.assignees?.[0] ?? issue.assignee;
			await syncKanbanItemFromIssue(
				item.id,
				issue.title,
				issue.body ?? null,
				assignee?.login ?? null,
				assignee?.avatar_url ?? null,
			);

			if (issue.state === "closed") {
				updates.push({ id: item.id, newStatus: "done" });
				continue;
			}

			const crossRefs = await getCrossReferences(owner, repo, item.issueNumber);
			const linkedPRs = crossRefs.filter(
				(ref) => ref.isPullRequest && ref.state === "open",
			);

			if (linkedPRs.length > 0) {
				let hasDraftPR = false;
				let hasReadyPR = false;

				for (const pr of linkedPRs) {
					try {
						const { data: prData } = await octokit.pulls.get({
							owner: pr.repoOwner,
							repo: pr.repoName,
							pull_number: pr.number,
						});
						if (prData.draft) {
							hasDraftPR = true;
						} else {
							hasReadyPR = true;
						}
					} catch {
						// PR might not be accessible
					}
				}

				if (hasReadyPR) {
					if (item.status !== "in-review") {
						updates.push({
							id: item.id,
							newStatus: "in-review",
						});
					}
				} else if (hasDraftPR) {
					if (
						item.status !== "in-progress" &&
						item.status !== "in-review"
					) {
						updates.push({
							id: item.id,
							newStatus: "in-progress",
						});
					}
				}
			}
		} catch {
			// Issue might have been deleted or inaccessible
		}
	}

	for (const update of updates) {
		await updateKanbanItemStatus(update.id, update.newStatus);
	}

	revalidatePath(`/repos/${owner}/${repo}/kanban`);

	return { synced: items.length, updated: updates.length };
}

export async function addKanbanComment(kanbanItemId: string, body: string) {
	const session = await getServerSession();
	if (!session?.user?.id) throw new Error("Unauthorized");

	const item = await getKanbanItem(kanbanItemId);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	const comment = await createKanbanComment(
		kanbanItemId,
		session.user.id,
		session.githubUser?.login ?? null,
		session.user.name,
		session.user.image ?? "",
		body,
	);

	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${kanbanItemId}`);
	return comment;
}

export async function deleteKanbanComment(commentId: string, kanbanItemId: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) throw new Error("Unauthorized");

	const comment = await getKanbanComment(commentId);
	if (!comment) throw new Error("Comment not found");

	if (comment.userId !== session.user.id) {
		const item = await getKanbanItem(kanbanItemId);
		if (!item) throw new Error("Kanban item not found");
		await assertMaintainer(item.owner, item.repo);
	}

	const item = await getKanbanItem(kanbanItemId);
	if (!item) throw new Error("Kanban item not found");

	await deleteKanbanCommentStore(commentId);
	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${kanbanItemId}`);
}

export async function updateKanbanComment(commentId: string, kanbanItemId: string, body: string) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) throw new Error("Unauthorized");

	const trimmedBody = body.trim();
	if (!trimmedBody) throw new Error("Comment body cannot be empty");
	if (trimmedBody.length > 10000)
		throw new Error("Comment body is too long (max 10000 characters)");

	const comment = await getKanbanComment(commentId);
	if (!comment) throw new Error("Comment not found");

	if (comment.userId !== session.user.id) {
		throw new Error("You can only edit your own comments");
	}

	const item = await getKanbanItem(kanbanItemId);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	const updated = await updateKanbanCommentStore(commentId, trimmedBody);
	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${kanbanItemId}`);
	return updated;
}

export async function fetchRepoIssuesForKanban(owner: string, repo: string) {
	await assertMaintainer(owner, repo);

	const octokit = await getOctokit();
	if (!octokit) throw new Error("Failed to connect to GitHub");

	const existingItems = await listKanbanItems(owner, repo);
	const existingIssueNumbers = new Set(existingItems.map((i) => i.issueNumber));

	const { data: issues } = await octokit.issues.listForRepo({
		owner,
		repo,
		state: "open",
		per_page: 100,
		sort: "updated",
		direction: "desc",
	});

	const filteredIssues = issues
		.filter((issue) => !issue.pull_request)
		.filter((issue) => !existingIssueNumbers.has(issue.number));

	return filteredIssues.map((issue) => ({
		number: issue.number,
		title: issue.title,
		user: issue.user
			? { login: issue.user.login, avatar_url: issue.user.avatar_url }
			: null,
		labels: issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))),
		created_at: issue.created_at,
		updated_at: issue.updated_at,
	}));
}

export async function getKanbanItemsForBoard(owner: string, repo: string) {
	await assertMaintainer(owner, repo);
	return listKanbanItems(owner, repo);
}

export async function assignKanbanItemToSelf(id: string) {
	const session = await getServerSession();
	if (!session?.user?.id) throw new Error("Unauthorized");

	const item = await getKanbanItem(id);
	if (!item) throw new Error("Kanban item not found");

	await assertMaintainer(item.owner, item.repo);

	const updated = await updateKanbanItemAssignee(
		id,
		session.githubUser?.login ?? session.user.name,
		session.user.image ?? null,
	);

	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban`);
	revalidatePath(`/repos/${item.owner}/${item.repo}/kanban/${id}`);

	return updated;
}

export async function fetchRepoCollaborators(owner: string, repo: string) {
	await assertMaintainer(owner, repo);

	const octokit = await getOctokit();
	if (!octokit) throw new Error("GitHub not connected");

	const { data: collaborators } = await octokit.repos.listCollaborators({
		owner,
		repo,
		per_page: 100,
	});

	return collaborators
		.filter(
			(c) =>
				c.permissions?.push ||
				c.permissions?.admin ||
				c.permissions?.maintain,
		)
		.map((c) => ({
			login: c.login,
			avatar: c.avatar_url,
			name: c.name ?? c.login,
		}));
}
