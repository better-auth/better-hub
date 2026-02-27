import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/utils";
import { getInternalModel } from "@/lib/billing/ai-models.server";
import { headers } from "next/headers";
import { checkUsageLimit } from "@/lib/billing/usage-limit";
import { getBillingErrorCode } from "@/lib/billing/config";
import { logTokenUsage } from "@/lib/billing/token-usage";
import { waitUntil } from "@vercel/functions";

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

	if (body.mode === "squash") {
		const { prTitle, prBody, prNumber, commits } = body;
		if (!prTitle) {
			return Response.json({ error: "Missing prTitle" }, { status: 400 });
		}

		const commitList = (commits || [])
			.slice(0, 30)
			.map((c: string) => `- ${c}`)
			.join("\n");

		try {
			const { text, usage } = await generateText({
				model,
				system: "Generate a concise squash merge commit message for a pull request using Conventional Commits format. Output two parts separated by a blank line: 1) A single-line title using a conventional commit prefix (feat:, fix:, refactor:, docs:, chore:, perf:, test:, ci:, style:, build:) followed by a short description, max 72 chars, with the PR number like (#123) at the end. 2) A brief description (2-4 bullet points summarizing the key changes). Only output the commit message, nothing else.",
				prompt: `PR #${prNumber}: ${prTitle}\n\n${prBody ? `Description:\n${prBody}\n\n` : ""}Commits:\n${commitList}`,
			});

			waitUntil(
				logTokenUsage({
					userId: session.user.id,
					provider: "openrouter",
					modelId,
					taskType: "commit",
					usage,
					isCustomApiKey,
				}).catch((e) =>
					console.error("[billing] logTokenUsage failed:", e),
				),
			);

			const lines = text.trim().split("\n");
			const title = lines[0] || `${prTitle} (#${prNumber})`;
			const description = lines.slice(1).join("\n").trim();

			return Response.json({ title, description });
		} catch (e: unknown) {
			return Response.json(
				{
					error:
						getErrorMessage(e) ||
						"Failed to generate commit message",
				},
				{ status: 500 },
			);
		}
	}

	const { filename, originalContent, newContent } = body;
	if (!filename || originalContent == null || newContent == null) {
		return Response.json({ error: "Missing fields" }, { status: 400 });
	}

	const oldLines = originalContent.split("\n");
	const newLines = newContent.split("\n");
	const diffLines: string[] = [];
	const maxLen = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < maxLen; i++) {
		const oldLine = oldLines[i];
		const newLine = newLines[i];
		if (oldLine === newLine) continue;
		if (oldLine !== undefined && newLine !== undefined) {
			diffLines.push(`-${oldLine}`);
			diffLines.push(`+${newLine}`);
		} else if (oldLine !== undefined) {
			diffLines.push(`-${oldLine}`);
		} else {
			diffLines.push(`+${newLine}`);
		}
	}
	const diff = diffLines.slice(0, 100).join("\n");

	try {
		const { text, usage } = await generateText({
			model,
			system: "Generate a concise git commit message for the following file change using Conventional Commits format. Use a prefix like feat:, fix:, refactor:, docs:, chore:, perf:, test:, ci:, style:, or build: followed by a short description. Single line, imperative mood, max 72 characters. Only output the commit message, nothing else.",
			prompt: `File: ${filename}\n\nDiff:\n${diff}`,
		});

		waitUntil(
			logTokenUsage({
				userId: session.user.id,
				provider: "openrouter",
				modelId,
				taskType: "commit",
				usage,
				isCustomApiKey,
			}).catch((e) => console.error("[billing] logTokenUsage failed:", e)),
		);

		return Response.json({ message: text.trim() });
	} catch (e: unknown) {
		return Response.json(
			{ error: getErrorMessage(e) || "Failed to generate commit message" },
			{ status: 500 },
		);
	}
}
