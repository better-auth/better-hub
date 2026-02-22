import { auth } from "@/lib/auth";
import { getConversation } from "@/lib/chat-store";
import { streamContext } from "@/lib/resumable-stream";
import { headers } from "next/headers";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { id: contextKey } = await params;

	const result = await getConversation(session.user.id, contextKey);
	if (!result) {
		return new Response(null, { status: 204 });
	}

	const { conversation } = result;

	if (!conversation.activeStreamId) {
		return new Response(null, { status: 204 });
	}

	const resumeAt = new URL(req.url).searchParams.get("resumeAt");
	const stream = await streamContext.resumeExistingStream(
		conversation.activeStreamId,
		resumeAt ? parseInt(resumeAt, 10) : undefined,
	);

	if (!stream) {
		return new Response(null, { status: 204 });
	}

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
		},
	});
}
