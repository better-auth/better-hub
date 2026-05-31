import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/utils";
import { getInternalModel } from "@/lib/billing/ai-models.server";
import { headers } from "next/headers";
import { checkUsageLimit } from "@/lib/billing/usage-limit";
import { getBillingErrorCode } from "@/lib/billing/config";
import { logTokenUsage } from "@/lib/billing/token-usage";
import { waitUntil } from "@vercel/functions";
import { getOctokit, extractRepoPermissions } from "@/lib/github";

async function checkMaintainerAccess(owner: string, repo: string): Promise<boolean> {
	const octokit = await getOctokit();
	if (!octokit) return false;

	try {
		const { data } = await octokit.repos.get({ owner, repo });
		const perms = extractRepoPermissions(data);
		return perms.push || perms.admin || perms.maintain;
	} catch {
		return false;
	}
}

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = await req.json();
	const { issueTitle, issueBody, issueNumber, repoFullName } = body;

	if (!issueTitle || !issueNumber) {
		return Response.json({ error: "Missing required fields" }, { status: 400 });
	}

	if (!repoFullName || typeof repoFullName !== "string") {
		return Response.json({ error: "Missing repository information" }, { status: 400 });
	}

	const [owner, repo] = repoFullName.split("/");
	if (!owner || !repo) {
		return Response.json({ error: "Invalid repository format" }, { status: 400 });
	}

	const isMaintainer = await checkMaintainerAccess(owner, repo);
	if (!isMaintainer) {
		return Response.json(
			{ error: "Not authorized - maintainer access required" },
			{ status: 403 },
		);
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

	const issueContent = [
		`Issue #${issueNumber}: ${issueTitle}`,
		issueBody ? `\n${issueBody}` : "",
	].join("");

	try {
		const { text, usage } = await generateText({
			model,
			system: `You are a helpful assistant that summarizes GitHub issues for a kanban board.
Generate a concise 2-3 sentence summary that captures:
1. What the issue is about (the problem or feature request)
2. The key requirements or acceptance criteria if mentioned
3. Any important context or constraints

Keep it actionable and easy to scan. Focus on what needs to be done, not background information.
Only output the summary, nothing else. No markdown formatting, just plain text.`,
			prompt: `Repository: ${repoFullName || "Unknown"}\n\n${issueContent.slice(0, 4000)}`,
		});

		waitUntil(
			logTokenUsage({
				userId: session.user.id,
				provider: "openrouter",
				modelId,
				taskType: "kanban_summary",
				usage,
				isCustomApiKey,
			}).catch((e) => console.error("[billing] logTokenUsage failed:", e)),
		);

		return Response.json({ summary: text.trim() });
	} catch (e: unknown) {
		return Response.json(
			{ error: getErrorMessage(e) || "Failed to generate summary" },
			{ status: 500 },
		);
	}
}
