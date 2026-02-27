import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/utils";
import { getInternalModel } from "@/lib/billing/ai-models";
import { headers } from "next/headers";
import { checkUsageLimit } from "@/lib/billing/usage-limit";
import { getBillingErrorCode } from "@/lib/billing/config";
import { logTokenUsage } from "@/lib/billing/token-usage";

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { model, modelId, isCustomApiKey } = await getInternalModel(session.user.id);

	const limitResult = await checkUsageLimit(session.user.id, isCustomApiKey);
	if (!limitResult.allowed) {
		const errorCode = getBillingErrorCode(limitResult);
		return new Response(JSON.stringify({ error: errorCode, ...limitResult }), {
			status: 429,
			headers: { "Content-Type": "application/json" },
		});
	}

	const body = await req.json();
	const { prompt, owner, repo } = body;
	if (!prompt || !owner || !repo) {
		return Response.json({ error: "Missing fields" }, { status: 400 });
	}

	try {
		const { text, usage } = await generateText({
			model,
			system: `You are a prompt engineer helping users write clear, actionable prompts for AI coding tools. The prompt is for the repository ${owner}/${repo}.

Rewrite the user's prompt to be:
- Clear and specific about what needs to change
- Well-structured with context, requirements, and expected behavior
- Actionable — an AI coding agent should be able to follow it directly
- Use markdown formatting where helpful (bullet points, code blocks, etc.)

Only output the improved prompt, nothing else. Do not wrap it in quotes or add meta-commentary.`,
			prompt,
		});

		logTokenUsage({
			userId: session.user.id,
			provider: "openrouter",
			modelId,
			taskType: "rewrite-prompt",
			usage,
			isCustomApiKey,
		}).catch((e) => console.error("[billing] logTokenUsage failed:", e));

		return Response.json({ text: text.trim() });
	} catch (e: unknown) {
		return Response.json(
			{ error: getErrorMessage(e) || "Failed to rewrite prompt" },
			{ status: 500 },
		);
	}
}
