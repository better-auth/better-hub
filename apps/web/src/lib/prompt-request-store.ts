import { prisma } from "./db";

export type PromptRequestStatus = "open" | "accepted" | "closed";

export interface PromptRequest {
	id: string;
	userId: string;
	owner: string;
	repo: string;
	title: string;
	body: string;
	status: PromptRequestStatus;
	acceptedById: string | null;
	acceptedByName: string | null;
	createdAt: string;
	updatedAt: string;
}

function toPromptRequest(row: {
	id: string;
	userId: string;
	owner: string;
	repo: string;
	title: string;
	body: string;
	status: string;
	acceptedById: string | null;
	acceptedByName: string | null;
	createdAt: string;
	updatedAt: string;
}): PromptRequest {
	return {
		id: row.id,
		userId: row.userId,
		owner: row.owner,
		repo: row.repo,
		title: row.title,
		body: row.body,
		status: row.status as PromptRequestStatus,
		acceptedById: row.acceptedById,
		acceptedByName: row.acceptedByName,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function createPromptRequest(
	userId: string,
	owner: string,
	repo: string,
	title: string,
	body: string,
): Promise<PromptRequest> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	const created = await prisma.promptRequest.create({
		data: {
			id,
			userId,
			owner,
			repo,
			title,
			body,
			status: "open",
			createdAt: now,
			updatedAt: now,
		},
	});

	return toPromptRequest(created);
}

export async function getPromptRequest(id: string): Promise<PromptRequest | null> {
	const row = await prisma.promptRequest.findUnique({ where: { id } });
	return row ? toPromptRequest(row) : null;
}

export async function listPromptRequests(
	owner: string,
	repo: string,
	opts?: { status?: PromptRequestStatus },
): Promise<PromptRequest[]> {
	const rows = await prisma.promptRequest.findMany({
		where: { owner, repo, ...(opts?.status ? { status: opts.status } : {}) },
		orderBy: { createdAt: "desc" },
	});
	return rows.map(toPromptRequest);
}

export async function countPromptRequests(
	owner: string,
	repo: string,
	status?: PromptRequestStatus,
): Promise<number> {
	return prisma.promptRequest.count({
		where: { owner, repo, ...(status ? { status } : {}) },
	});
}

export async function updatePromptRequestStatus(
	id: string,
	status: PromptRequestStatus,
): Promise<PromptRequest | null> {
	const now = new Date().toISOString();

	await prisma.promptRequest.update({
		where: { id },
		data: { status, updatedAt: now },
	});

	return getPromptRequest(id);
}

export async function acceptPromptRequest(
	id: string,
	acceptedById: string,
	acceptedByName: string,
): Promise<PromptRequest | null> {
	const now = new Date().toISOString();

	await prisma.promptRequest.update({
		where: { id },
		data: { status: "accepted", acceptedById, acceptedByName, updatedAt: now },
	});

	return getPromptRequest(id);
}

export async function updatePromptRequestContent(
	id: string,
	updates: { title?: string; body?: string },
): Promise<PromptRequest | null> {
	const now = new Date().toISOString();
	const data: Record<string, unknown> = { updatedAt: now };

	if (updates.title !== undefined) data.title = updates.title;
	if (updates.body !== undefined) data.body = updates.body;

	await prisma.promptRequest.update({ where: { id }, data });

	return getPromptRequest(id);
}

export async function deletePromptRequest(id: string): Promise<void> {
	await prisma.promptRequestComment.deleteMany({ where: { promptRequestId: id } });
	await prisma.promptRequest.delete({ where: { id } });
}

// --- Prompt Request Comments ---

export interface PromptRequestComment {
	id: string;
	promptRequestId: string;
	userId: string;
	userLogin: string | null;
	userName: string;
	userAvatarUrl: string;
	body: string;
	createdAt: string;
	updatedAt: string;
}

function toPromptRequestComment(row: {
	id: string;
	promptRequestId: string;
	userId: string;
	userLogin: string | null;
	userName: string;
	userAvatarUrl: string;
	body: string;
	createdAt: string;
	updatedAt: string;
}): PromptRequestComment {
	return {
		id: row.id,
		promptRequestId: row.promptRequestId,
		userId: row.userId,
		userLogin: row.userLogin,
		userName: row.userName,
		userAvatarUrl: row.userAvatarUrl,
		body: row.body,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function createPromptRequestComment(
	promptRequestId: string,
	userId: string,
	userLogin: string | null,
	userName: string,
	userAvatarUrl: string,
	body: string,
): Promise<PromptRequestComment> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	const created = await prisma.promptRequestComment.create({
		data: {
			id,
			promptRequestId,
			userId,
			userLogin,
			userName,
			userAvatarUrl,
			body,
			createdAt: now,
			updatedAt: now,
		},
	});

	return toPromptRequestComment(created);
}

export async function listPromptRequestComments(
	promptRequestId: string,
): Promise<PromptRequestComment[]> {
	const rows = await prisma.promptRequestComment.findMany({
		where: { promptRequestId },
		orderBy: { createdAt: "asc" },
	});
	return rows.map(toPromptRequestComment);
}

export async function deletePromptRequestComment(id: string): Promise<void> {
	await prisma.promptRequestComment.delete({ where: { id } });
}

export async function getPromptRequestComment(id: string): Promise<PromptRequestComment | null> {
	const row = await prisma.promptRequestComment.findUnique({ where: { id } });
	return row ? toPromptRequestComment(row) : null;
}
