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
	type KanbanLabel,
	type LinkedPR,
} from "@/lib/kanban-store";
import { auth, getServerSession } from "@/lib/auth";
import { headers } from "next/headers";
import {
	getOctokit,
	extractRepoPermissions,
	getCrossReferences,
	getIssue,
	getRepoIssuesPage,
} from "@/lib/github";

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

function extractLabels(
	labels: Array<string | { name?: string | null; color?: string | null }>,
): KanbanLabel[] {
	return labels
		.map((l) => {
			if (typeof l === "string") return { name: l, color: "6b7280" };
			return { name: l.name ?? "", color: l.color ?? "6b7280" };
		})
		.filter((l) => l.name);
}

async function fetchLinkedPRs(
	octokit: Awaited<ReturnType<typeof getOctokit>>,
	owner: string,
	repo: string,
	issueNumber: number,
): Promise<LinkedPR[]> {
	if (!octokit) return [];

	const crossRefs = await getCrossReferences(owner, repo, issueNumber);
	const prRefs = crossRefs.filter((ref) => ref.isPullRequest);

	const linkedPRs: LinkedPR[] = [];
	for (const ref of prRefs) {
		try {
			const { data: prData } = await octokit.pulls.get({
				owner: ref.repoOwner,
				repo: ref.repoName,
				pull_number: ref.number,
			});
			linkedPRs.push({
				number: ref.number,
				title: ref.title,
				state: ref.state,
				merged: ref.merged,
				draft: prData.draft ?? false,
				user: ref.user
					? { login: ref.user.login, avatarUrl: ref.user.avatar_url }
					: null,
				htmlUrl: ref.html_url,
				repoOwner: ref.repoOwner,
				repoName: ref.repoName,
				createdAt: ref.created_at,
			});
		} catch {
			linkedPRs.push({
				number: ref.number,
				title: ref.title,
				state: ref.state,
				merged: ref.merged,
				draft: false,
				user: ref.user
					? { login: ref.user.login, avatarUrl: ref.user.avatar_url }
					: null,
				htmlUrl: ref.html_url,
				repoOwner: ref.repoOwner,
				repoName: ref.repoName,
				createdAt: ref.created_at,
			});
		}
	}
	return linkedPRs;
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
	const labels = extractLabels(issue.labels);
	const linkedPRs = await fetchLinkedPRs(octokit, owner, repo, issueNumber);

	const item = await createKanbanItem(
		owner,
		repo,
		issueNumber,
		issue.title,
		issue.html_url,
		issue.body ?? null,
		assignee?.login ?? null,
		assignee?.avatar_url ?? null,
		labels,
		issue.comments,
		issue.state as "open" | "closed",
		linkedPRs,
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
	const labels = extractLabels(issue.labels);
	const linkedPRs = await fetchLinkedPRs(octokit, item.owner, item.repo, item.issueNumber);

	const updated = await syncKanbanItemFromIssue(
		id,
		issue.title,
		issue.body ?? null,
		assignee?.login ?? null,
		assignee?.avatar_url ?? null,
		labels,
		issue.comments,
		issue.state as "open" | "closed",
		linkedPRs,
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
			const labels = extractLabels(issue.labels);
			const linkedPRs = await fetchLinkedPRs(
				octokit,
				owner,
				repo,
				item.issueNumber,
			);

			await syncKanbanItemFromIssue(
				item.id,
				issue.title,
				issue.body ?? null,
				assignee?.login ?? null,
				assignee?.avatar_url ?? null,
				labels,
				issue.comments,
				issue.state as "open" | "closed",
				linkedPRs,
			);

			if (issue.state === "closed") {
				updates.push({ id: item.id, newStatus: "done" });
				continue;
			}

			const openPRs = linkedPRs.filter((pr) => pr.state === "open");
			if (openPRs.length > 0) {
				const hasDraftPR = openPRs.some((pr) => pr.draft);
				const hasReadyPR = openPRs.some((pr) => !pr.draft);

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

export interface ActiveIssue {
	number: number;
	title: string;
	body: string | null;
	state: "open" | "closed";
	user: { login: string; avatar_url: string } | null;
	assignees: { login: string; avatar_url: string }[];
	labels: { name: string; color: string }[];
	created_at: string;
	updated_at: string;
	comments: number;
	html_url: string;
	isOnKanban: boolean;
}

export async function fetchActiveIssuesPaginated(
	owner: string,
	repo: string,
	page: number = 1,
	perPage: number = 20,
): Promise<{ issues: ActiveIssue[]; hasMore: boolean; totalCount: number }> {
	await assertMaintainer(owner, repo);

	const [cachedData, existingItems] = await Promise.all([
		getRepoIssuesPage(owner, repo),
		listKanbanItems(owner, repo),
	]);

	const existingIssueNumbers = new Set(existingItems.map((i) => i.issueNumber));

	// Filter out PRs (they have pull_request field) and map to ActiveIssue
	const allIssues: ActiveIssue[] = cachedData.openIssues
		.filter((issue) => !issue.pull_request)
		.map((issue) => ({
			number: issue.number,
			title: issue.title,
			body: null,
			state: issue.state as "open" | "closed",
			user: issue.user,
			assignees: issue.assignees,
			labels: issue.labels
				.filter((l) => l.name)
				.map((l) => ({ name: l.name!, color: l.color ?? "6b7280" })),
			created_at: issue.created_at,
			updated_at: issue.updated_at,
			comments: issue.comments,
			html_url: `https://github.com/${owner}/${repo}/issues/${issue.number}`,
			isOnKanban: existingIssueNumbers.has(issue.number),
		}));

	// Paginate the results
	const startIndex = (page - 1) * perPage;
	const endIndex = startIndex + perPage;
	const paginatedIssues = allIssues.slice(startIndex, endIndex);
	const hasMore = endIndex < allIssues.length;

	return {
		issues: paginatedIssues,
		hasMore,
		totalCount: allIssues.length,
	};
}

export async function getIssueDetails(owner: string, repo: string, issueNumber: number) {
	await assertMaintainer(owner, repo);

	const octokit = await getOctokit();
	if (!octokit) throw new Error("Failed to connect to GitHub");

	const [issueResponse, commentsResponse] = await Promise.all([
		octokit.issues.get({ owner, repo, issue_number: issueNumber }),
		octokit.issues.listComments({
			owner,
			repo,
			issue_number: issueNumber,
			per_page: 100,
		}),
	]);

	const issue = issueResponse.data;
	const comments = commentsResponse.data;

	return {
		issue: {
			number: issue.number,
			title: issue.title,
			body: issue.body ?? null,
			state: issue.state as "open" | "closed",
			user: issue.user
				? { login: issue.user.login, avatar_url: issue.user.avatar_url }
				: null,
			assignees: (issue.assignees || []).map((a) => ({
				login: a.login,
				avatar_url: a.avatar_url,
			})),
			labels: extractLabels(issue.labels),
			created_at: issue.created_at,
			updated_at: issue.updated_at,
			closed_at: (issue as { closed_at?: string | null }).closed_at ?? null,
			comments: issue.comments,
			html_url: issue.html_url,
			milestone: issue.milestone
				? {
						title: issue.milestone.title,
						description: issue.milestone.description ?? null,
					}
				: null,
		},
		comments: comments.map((c) => ({
			id: c.id,
			body: c.body ?? "",
			user: c.user
				? { login: c.user.login, avatar_url: c.user.avatar_url }
				: null,
			created_at: c.created_at,
			updated_at: c.updated_at,
			author_association: c.author_association,
		})),
	};
}
