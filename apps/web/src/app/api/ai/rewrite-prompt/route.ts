import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/utils";
import { headers } from "next/headers";
import { checkAiLimit, incrementAiUsage } from "@/lib/ai-usage";

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { allowed, current, limit } = await checkAiLimit(session.user.id);
	if (!allowed) {
		return new Response(
			JSON.stringify({ error: "MESSAGE_LIMIT_REACHED", current, limit }),
			{ status: 429, headers: { "Content-Type": "application/json" } },
		);
	}
	await incrementAiUsage(session.user.id);

	const body = await req.json();
	const { prompt, owner, repo } = body;
	if (!prompt || !owner || !repo) {
		return Response.json({ error: "Missing fields" }, { status: 400 });
	}

	try {
		const { text } = await generateText({
			model: anthropic("claude-haiku-4-5-20251001"),
			system: `You are a prompt engineer helping users write clear, actionable prompts for AI coding tools. The prompt is for the repository ${owner}/${repo}.

Rewrite the user's prompt to be:
- Clear and specific about what needs to change
- Well-structured with context, requirements, and expected behavior
- Actionable — an AI coding agent should be able to follow it directly
- Use markdown formatting where helpful (bullet points, code blocks, etc.)

Only output the improved prompt, nothing else. Do not wrap it in quotes or add meta-commentary.`,
			prompt,
		});

		return Response.json({ text: text.trim() });
	} catch (e: unknown) {
		return Response.json(
			{ error: getErrorMessage(e) || "Failed to rewrite prompt" },
			{ status: 500 },
		);
	}
}
