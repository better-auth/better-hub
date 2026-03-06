import { prisma } from "./db";

export type KanbanStatus = "backlog" | "todo" | "in-progress" | "in-review" | "done";

export interface KanbanLabel {
	name: string;
	color: string;
}

export interface LinkedPR {
	number: number;
	title: string;
	state: "open" | "closed";
	merged: boolean;
	draft: boolean;
	user: { login: string; avatarUrl: string } | null;
	htmlUrl: string;
	repoOwner: string;
	repoName: string;
	createdAt: string;
}

export interface KanbanItem {
	id: string;
	owner: string;
	repo: string;
	issueNumber: number;
	issueTitle: string;
	issueUrl: string;
	issueBody: string | null;
	status: KanbanStatus;
	aiSummary: string | null;
	assigneeLogin: string | null;
	assigneeAvatar: string | null;
	kanbanAssigneeLogin: string | null;
	kanbanAssigneeAvatar: string | null;
	labels: KanbanLabel[];
	issueCommentCount: number;
	issueState: "open" | "closed";
	linkedPRs: LinkedPR[];
	createdAt: string;
	updatedAt: string;
}

function toKanbanItem(row: {
	id: string;
	owner: string;
	repo: string;
	issueNumber: number;
	issueTitle: string;
	issueUrl: string;
	issueBody: string | null;
	status: string;
	aiSummary: string | null;
	assigneeLogin: string | null;
	assigneeAvatar: string | null;
	kanbanAssigneeLogin: string | null;
	kanbanAssigneeAvatar: string | null;
	labels: string | null;
	issueCommentCount: number;
	issueState: string;
	linkedPRs: string | null;
	createdAt: string;
	updatedAt: string;
}): KanbanItem {
	let parsedLabels: KanbanLabel[] = [];
	if (row.labels) {
		try {
			parsedLabels = JSON.parse(row.labels);
		} catch {
			parsedLabels = [];
		}
	}

	let parsedLinkedPRs: LinkedPR[] = [];
	if (row.linkedPRs) {
		try {
			parsedLinkedPRs = JSON.parse(row.linkedPRs);
		} catch {
			parsedLinkedPRs = [];
		}
	}

	return {
		id: row.id,
		owner: row.owner,
		repo: row.repo,
		issueNumber: row.issueNumber,
		issueTitle: row.issueTitle,
		issueUrl: row.issueUrl,
		issueBody: row.issueBody,
		status: row.status as KanbanStatus,
		aiSummary: row.aiSummary,
		assigneeLogin: row.assigneeLogin,
		assigneeAvatar: row.assigneeAvatar,
		kanbanAssigneeLogin: row.kanbanAssigneeLogin,
		kanbanAssigneeAvatar: row.kanbanAssigneeAvatar,
		labels: parsedLabels,
		issueCommentCount: row.issueCommentCount,
		issueState: row.issueState as "open" | "closed",
		linkedPRs: parsedLinkedPRs,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function createKanbanItem(
	owner: string,
	repo: string,
	issueNumber: number,
	issueTitle: string,
	issueUrl: string,
	issueBody: string | null,
	assigneeLogin: string | null,
	assigneeAvatar: string | null,
	labels: KanbanLabel[] = [],
	issueCommentCount: number = 0,
	issueState: "open" | "closed" = "open",
	linkedPRs: LinkedPR[] = [],
): Promise<KanbanItem> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	const created = await prisma.kanbanItem.create({
		data: {
			id,
			owner,
			repo,
			issueNumber,
			issueTitle,
			issueUrl,
			issueBody,
			status: "backlog",
			assigneeLogin,
			assigneeAvatar,
			labels: JSON.stringify(labels),
			issueCommentCount,
			issueState,
			linkedPRs: JSON.stringify(linkedPRs),
			createdAt: now,
			updatedAt: now,
		},
	});

	return toKanbanItem(created);
}

export async function getKanbanItem(id: string): Promise<KanbanItem | null> {
	const row = await prisma.kanbanItem.findUnique({ where: { id } });
	return row ? toKanbanItem(row) : null;
}

export async function getKanbanItemByIssue(
	owner: string,
	repo: string,
	issueNumber: number,
): Promise<KanbanItem | null> {
	const row = await prisma.kanbanItem.findUnique({
		where: { owner_repo_issueNumber: { owner, repo, issueNumber } },
	});
	return row ? toKanbanItem(row) : null;
}

export async function listKanbanItems(
	owner: string,
	repo: string,
	opts?: { status?: KanbanStatus },
): Promise<KanbanItem[]> {
	const rows = await prisma.kanbanItem.findMany({
		where: { owner, repo, ...(opts?.status ? { status: opts.status } : {}) },
		orderBy: { createdAt: "asc" },
	});
	return rows.map(toKanbanItem);
}

export async function countKanbanItems(
	owner: string,
	repo: string,
	status?: KanbanStatus,
): Promise<number> {
	return prisma.kanbanItem.count({
		where: { owner, repo, ...(status ? { status } : {}) },
	});
}

export async function updateKanbanItemStatus(
	id: string,
	status: KanbanStatus,
): Promise<KanbanItem | null> {
	const now = new Date().toISOString();

	await prisma.kanbanItem.update({
		where: { id },
		data: { status, updatedAt: now },
	});

	return getKanbanItem(id);
}

export async function updateKanbanItemAiSummary(
	id: string,
	aiSummary: string,
): Promise<KanbanItem | null> {
	const now = new Date().toISOString();

	await prisma.kanbanItem.update({
		where: { id },
		data: { aiSummary, updatedAt: now },
	});

	return getKanbanItem(id);
}

export async function updateKanbanItemAssignee(
	id: string,
	kanbanAssigneeLogin: string | null,
	kanbanAssigneeAvatar: string | null,
): Promise<KanbanItem | null> {
	const now = new Date().toISOString();

	await prisma.kanbanItem.update({
		where: { id },
		data: { kanbanAssigneeLogin, kanbanAssigneeAvatar, updatedAt: now },
	});

	return getKanbanItem(id);
}

export async function syncKanbanItemFromIssue(
	id: string,
	issueTitle: string,
	issueBody: string | null,
	assigneeLogin: string | null,
	assigneeAvatar: string | null,
	labels: KanbanLabel[] = [],
	issueCommentCount: number = 0,
	issueState: "open" | "closed" = "open",
	linkedPRs: LinkedPR[] = [],
): Promise<KanbanItem | null> {
	const now = new Date().toISOString();

	await prisma.kanbanItem.update({
		where: { id },
		data: {
			issueTitle,
			issueBody,
			assigneeLogin,
			assigneeAvatar,
			labels: JSON.stringify(labels),
			issueCommentCount,
			issueState,
			linkedPRs: JSON.stringify(linkedPRs),
			updatedAt: now,
		},
	});

	return getKanbanItem(id);
}

export async function deleteKanbanItem(id: string): Promise<void> {
	await prisma.kanbanComment.deleteMany({ where: { kanbanItemId: id } });
	await prisma.kanbanItem.delete({ where: { id } });
}

// --- Kanban Comments ---

export interface KanbanComment {
	id: string;
	kanbanItemId: string;
	userId: string;
	userLogin: string | null;
	userName: string;
	userAvatarUrl: string;
	body: string;
	createdAt: string;
	updatedAt: string;
}

function toKanbanComment(row: {
	id: string;
	kanbanItemId: string;
	userId: string;
	userLogin: string | null;
	userName: string;
	userAvatarUrl: string;
	body: string;
	createdAt: string;
	updatedAt: string;
}): KanbanComment {
	return {
		id: row.id,
		kanbanItemId: row.kanbanItemId,
		userId: row.userId,
		userLogin: row.userLogin,
		userName: row.userName,
		userAvatarUrl: row.userAvatarUrl,
		body: row.body,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function createKanbanComment(
	kanbanItemId: string,
	userId: string,
	userLogin: string | null,
	userName: string,
	userAvatarUrl: string,
	body: string,
): Promise<KanbanComment> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	const created = await prisma.kanbanComment.create({
		data: {
			id,
			kanbanItemId,
			userId,
			userLogin,
			userName,
			userAvatarUrl,
			body,
			createdAt: now,
			updatedAt: now,
		},
	});

	return toKanbanComment(created);
}

export async function listKanbanComments(kanbanItemId: string): Promise<KanbanComment[]> {
	const rows = await prisma.kanbanComment.findMany({
		where: { kanbanItemId },
		orderBy: { createdAt: "asc" },
	});
	return rows.map(toKanbanComment);
}

export async function countMaintainerCommentsByItems(
	kanbanItemIds: string[],
): Promise<Record<string, number>> {
	if (kanbanItemIds.length === 0) return {};

	const counts = await prisma.kanbanComment.groupBy({
		by: ["kanbanItemId"],
		where: { kanbanItemId: { in: kanbanItemIds } },
		_count: { id: true },
	});

	const result: Record<string, number> = {};
	for (const item of counts) {
		result[item.kanbanItemId] = item._count.id;
	}
	return result;
}

export async function getKanbanComment(id: string): Promise<KanbanComment | null> {
	const row = await prisma.kanbanComment.findUnique({ where: { id } });
	return row ? toKanbanComment(row) : null;
}

export async function deleteKanbanComment(id: string): Promise<void> {
	await prisma.kanbanComment.delete({ where: { id } });
}

export async function updateKanbanComment(id: string, body: string): Promise<KanbanComment> {
	const now = new Date().toISOString();
	const updated = await prisma.kanbanComment.update({
		where: { id },
		data: { body, updatedAt: now },
	});
	return toKanbanComment(updated);
}
