import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
	getConversation,
	getOrCreateConversation,
	saveMessage,
	deleteConversation,
	listGhostConversations,
} from "@/lib/chat-store";

async function getSessionUserId(): Promise<string | null> {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	return session?.user?.id ?? null;
}

export async function GET(req: Request) {
	const userId = await getSessionUserId();
	if (!userId) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(req.url);

	// List recent ghost conversations
	if (searchParams.get("list") === "ghost") {
		const conversations = await listGhostConversations(userId);
		return Response.json({ conversations });
	}

	const contextKey = searchParams.get("contextKey");

	if (!contextKey) {
		return Response.json({ error: "contextKey required" }, { status: 400 });
	}

	const result = await getConversation(userId, contextKey);
	if (!result) {
		return Response.json({ conversation: null, messages: [] });
	}

	return Response.json(result);
}

export async function POST(req: Request) {
	const userId = await getSessionUserId();
	if (!userId) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { contextKey, chatType, message } = await req.json();

	if (!contextKey || !chatType || !message) {
		return Response.json(
			{ error: "contextKey, chatType, and message required" },
			{ status: 400 },
		);
	}

	const conversation = await getOrCreateConversation(userId, chatType, contextKey);
	const saved = await saveMessage(conversation.id, message);

	return Response.json({ conversation, message: saved });
}

export async function DELETE(req: Request) {
	const userId = await getSessionUserId();
	if (!userId) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(req.url);
	const conversationId = searchParams.get("conversationId");

	if (!conversationId) {
		return Response.json({ error: "conversationId required" }, { status: 400 });
	}

	try {
		await deleteConversation(conversationId, userId);
	} catch {
		return Response.json({ error: "Conversation not found" }, { status: 404 });
	}
	return Response.json({ success: true });
}
