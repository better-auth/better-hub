import { prisma } from "./db";

export interface ChatConversation {
	id: string;
	userId: string;
	chatType: string;
	contextKey: string;
	title: string | null;
	activeStreamId: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ChatMessage {
	id: string;
	conversationId: string;
	role: string;
	content: string;
	partsJson: string | null;
	createdAt: string;
}

function toConversation(row: {
	id: string;
	userId: string;
	chatType: string;
	contextKey: string;
	title: string | null;
	activeStreamId: string | null;
	createdAt: string;
	updatedAt: string;
}): ChatConversation {
	return {
		id: row.id,
		userId: row.userId,
		chatType: row.chatType,
		contextKey: row.contextKey,
		title: row.title,
		activeStreamId: row.activeStreamId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toMessage(row: {
	id: string;
	conversationId: string;
	role: string;
	content: string;
	partsJson: string | null;
	createdAt: string;
}): ChatMessage {
	return {
		id: row.id,
		conversationId: row.conversationId,
		role: row.role,
		content: row.content,
		partsJson: row.partsJson,
		createdAt: row.createdAt,
	};
}

export async function getOrCreateConversation(
	userId: string,
	chatType: string,
	contextKey: string,
): Promise<ChatConversation> {
	const now = new Date().toISOString();

	const existing = await prisma.chatConversation.findUnique({
		where: { userId_contextKey: { userId, contextKey } },
	});

	if (existing) return toConversation(existing);

	const id = crypto.randomUUID();
	const created = await prisma.chatConversation.create({
		data: {
			id,
			userId,
			chatType,
			contextKey,
			title: null,
			createdAt: now,
			updatedAt: now,
		},
	});

	return toConversation(created);
}

export async function saveMessage(
	conversationId: string,
	message: { id: string; role: string; content: string; partsJson?: string },
): Promise<ChatMessage> {
	const now = new Date().toISOString();

	const saved = await prisma.chatMessage.upsert({
		where: { id: message.id },
		create: {
			id: message.id,
			conversationId,
			role: message.role,
			content: message.content,
			partsJson: message.partsJson ?? null,
			createdAt: now,
		},
		update: {
			content: message.content,
			partsJson: message.partsJson ?? undefined,
		},
	});

	await prisma.chatConversation.update({
		where: { id: conversationId },
		data: { updatedAt: now },
	});

	if (message.role === "user") {
		await prisma.chatConversation.updateMany({
			where: { id: conversationId, title: null },
			data: { title: message.content.slice(0, 100) },
		});
	}

	return toMessage(saved);
}

export async function getConversation(
	userId: string,
	contextKey: string,
): Promise<{ conversation: ChatConversation; messages: ChatMessage[] } | null> {
	const row = await prisma.chatConversation.findUnique({
		where: { userId_contextKey: { userId, contextKey } },
	});

	if (!row) return null;

	const messages = await prisma.chatMessage.findMany({
		where: { conversationId: row.id },
		orderBy: { createdAt: "asc" },
	});

	return {
		conversation: toConversation(row),
		messages: messages.map(toMessage),
	};
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
	const conversation = await prisma.chatConversation.findUnique({
		where: { id: conversationId },
	});
	if (!conversation || conversation.userId !== userId) {
		throw new Error("Conversation not found");
	}
	await prisma.chatMessage.deleteMany({ where: { conversationId } });
	await prisma.chatConversation.delete({ where: { id: conversationId } });
}

export async function listConversations(
	userId: string,
	chatType?: string,
): Promise<ChatConversation[]> {
	const rows = await prisma.chatConversation.findMany({
		where: { userId, ...(chatType ? { chatType } : {}) },
		orderBy: { updatedAt: "desc" },
		take: 50,
	});

	return rows.map(toConversation);
}

export async function listGhostConversations(
	userId: string,
	limit = 10,
): Promise<ChatConversation[]> {
	const rows = await prisma.chatConversation.findMany({
		where: {
			userId,
			contextKey: { startsWith: "ghost::" },
			title: { not: null },
		},
		orderBy: { updatedAt: "desc" },
		take: limit,
	});
	return rows.map(toConversation);
}

export async function getConversationById(
	conversationId: string,
): Promise<ChatConversation | null> {
	const row = await prisma.chatConversation.findUnique({
		where: { id: conversationId },
	});
	if (!row) return null;
	return toConversation(row);
}

export async function updateActiveStreamId(
	conversationId: string,
	streamId: string | null,
): Promise<void> {
	await prisma.chatConversation.update({
		where: { id: conversationId },
		data: { activeStreamId: streamId },
	});
}

export async function saveMessages(
	conversationId: string,
	messages: { id: string; role: string; content: string; partsJson?: string }[],
): Promise<void> {
	const now = new Date().toISOString();

	for (const message of messages) {
		await prisma.chatMessage.upsert({
			where: { id: message.id },
			create: {
				id: message.id,
				conversationId,
				role: message.role,
				content: message.content,
				partsJson: message.partsJson ?? null,
				createdAt: now,
			},
			update: {
				content: message.content,
				partsJson: message.partsJson ?? undefined,
			},
		});
	}

	if (messages.length > 0) {
		await prisma.chatConversation.update({
			where: { id: conversationId },
			data: { updatedAt: now },
		});

		const firstUserMsg = messages.find((m) => m.role === "user");
		if (firstUserMsg) {
			await prisma.chatConversation.updateMany({
				where: { id: conversationId, title: null },
				data: { title: firstUserMsg.content.slice(0, 100) },
			});
		}
	}
}

// ─── Ghost Tabs ────────────────────────────────────────────────────────────

export interface GhostTab {
	id: string;
	label: string;
}

export interface GhostTabState {
	tabs: GhostTab[];
	activeTabId: string;
	counter: number;
}

function generateTabId() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultGhostTabState(): {
	tabs: GhostTab[];
	activeTabId: string;
	counter: number;
} {
	const id = generateTabId();
	return { tabs: [{ id, label: "Thread 1" }], activeTabId: id, counter: 1 };
}

export async function getGhostTabState(userId: string): Promise<GhostTabState> {
	const tabs = await prisma.ghostTab.findMany({
		where: { userId },
		orderBy: { position: "asc" },
	});

	const stateRow = await prisma.ghostTabState.findUnique({
		where: { userId },
	});

	if (tabs.length === 0 || !stateRow) {
		const defaults = createDefaultGhostTabState();
		await prisma.$transaction([
			prisma.ghostTab.deleteMany({ where: { userId } }),
			prisma.ghostTab.create({
				data: {
					userId,
					tabId: defaults.tabs[0].id,
					label: defaults.tabs[0].label,
					position: 0,
				},
			}),
			prisma.ghostTabState.upsert({
				where: { userId },
				create: {
					userId,
					activeTabId: defaults.activeTabId,
					counter: defaults.counter,
				},
				update: {
					activeTabId: defaults.activeTabId,
					counter: defaults.counter,
				},
			}),
		]);
		return defaults;
	}

	return {
		tabs: tabs.map((t: { tabId: string; label: string }) => ({
			id: t.tabId,
			label: t.label,
		})),
		activeTabId: stateRow.activeTabId,
		counter: stateRow.counter,
	};
}

export async function addGhostTab(
	userId: string,
	tabId: string,
	label: string,
	counter: number,
): Promise<void> {
	const maxPos = await prisma.ghostTab.aggregate({
		where: { userId },
		_max: { position: true },
	});
	const position = (maxPos._max.position ?? -1) + 1;

	await prisma.$transaction([
		prisma.ghostTab.create({ data: { userId, tabId, label, position } }),
		prisma.ghostTabState.upsert({
			where: { userId },
			create: { userId, activeTabId: tabId, counter },
			update: { activeTabId: tabId, counter },
		}),
	]);
}

export async function closeGhostTab(
	userId: string,
	tabId: string,
	newDefault?: { id: string; label: string; counter: number },
): Promise<void> {
	const tabs = await prisma.ghostTab.findMany({
		where: { userId },
		orderBy: { position: "asc" },
	});

	const stateRow = await prisma.ghostTabState.findUnique({
		where: { userId },
	});

	const remaining = tabs.filter((t: { tabId: string }) => t.tabId !== tabId);

	if (remaining.length === 0) {
		const def = newDefault ?? {
			id: generateTabId(),
			label: "Thread 1",
			counter: 1,
		};
		await prisma.$transaction([
			prisma.ghostTab.deleteMany({ where: { userId } }),
			prisma.ghostTab.create({
				data: { userId, tabId: def.id, label: def.label, position: 0 },
			}),
			prisma.ghostTabState.upsert({
				where: { userId },
				create: { userId, activeTabId: def.id, counter: def.counter },
				update: { activeTabId: def.id, counter: def.counter },
			}),
		]);
		return;
	}

	let newActiveId = stateRow?.activeTabId ?? remaining[0].tabId;
	if (newActiveId === tabId) {
		const closedIdx = tabs.findIndex((t: { tabId: string }) => t.tabId === tabId);
		const newIdx = Math.min(closedIdx, remaining.length - 1);
		newActiveId = remaining[newIdx].tabId;
	}

	await prisma.$transaction([
		prisma.ghostTab.delete({
			where: { userId_tabId: { userId, tabId } },
		}),
		prisma.ghostTabState.update({
			where: { userId },
			data: { activeTabId: newActiveId },
		}),
	]);
}

export async function renameGhostTab(userId: string, tabId: string, label: string): Promise<void> {
	await prisma.ghostTab.update({
		where: { userId_tabId: { userId, tabId } },
		data: { label },
	});
}

export async function setActiveGhostTab(userId: string, tabId: string): Promise<void> {
	await prisma.ghostTabState.update({
		where: { userId },
		data: { activeTabId: tabId },
	});
}
