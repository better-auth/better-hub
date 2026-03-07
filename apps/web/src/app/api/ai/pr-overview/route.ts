import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/utils";
import { getInternalModel } from "@/lib/billing/ai-models.server";
import { headers } from "next/headers";
import { checkUsageLimit } from "@/lib/billing/usage-limit";
import { getBillingErrorCode } from "@/lib/billing/config";
import { logTokenUsage } from "@/lib/billing/token-usage";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { getPrOverviewAnalysis, savePrOverviewAnalysis } from "@/lib/pr-overview-store";

export const maxDuration = 120;

const FileSchema = z.object({
	filename: z.string(),
	status: z.string(),
	additions: z.number(),
	deletions: z.number(),
	patch: z.string().optional(),
});

const RequestSchema = z.object({
	owner: z.string(),
	repo: z.string(),
	pullNumber: z.number(),
	prTitle: z.string(),
	prBody: z.string(),
	headSha: z.string().optional(),
	refresh: z.boolean().optional(),
	files: z.array(FileSchema),
});

interface FileAnalysis {
	filename: string;
	snippet: string;
	explanation: string;
}

interface ChangeGroup {
	id: string;
	title: string;
	summary: string;
	reviewOrder: number;
	files: FileAnalysis[];
}

const SYSTEM_PROMPT = `You are a code review assistant that analyzes pull request changes and organizes them for optimal review.

Your task is to:
1. Group related file changes by feature area or logical grouping
2. Order groups by suggested review priority (dependencies first, then core changes, then peripheral)
3. For each file, extract the most relevant diff snippet (max 15 lines) and explain why it changed

Output valid JSON matching this structure:
{
  "groups": [
    {
      "id": "unique-id",
      "title": "Short descriptive title",
      "summary": "2-3 sentence explanation of what these changes accomplish and why",
      "reviewOrder": 1,
      "files": [
        {
          "filename": "path/to/file.ts",
          "snippet": "relevant diff lines with +/- prefixes",
          "explanation": "Brief explanation of this specific change"
        }
      ]
    }
  ]
}

Guidelines:
- Create 2-6 logical groups depending on PR size
- Group titles should be concise (e.g., "API Authentication", "UI Components", "Test Coverage")
- Snippets should show the most important changes, not the entire diff
- Explanations should focus on "why" not just "what"
- reviewOrder should start at 1 for the most foundational changes`;

function truncatePatch(patch: string, maxLines: number = 100): string {
	const lines = patch.split("\n");
	if (lines.length <= maxLines) return patch;
	return lines.slice(0, maxLines).join("\n") + "\n... (truncated)";
}

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
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

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const parseResult = RequestSchema.safeParse(body);
	if (!parseResult.success) {
		return new Response(
			JSON.stringify({
				error: "Invalid request",
				details: parseResult.error.flatten(),
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const { owner, repo, pullNumber, prTitle, prBody, headSha, refresh, files } =
		parseResult.data;

	if (files.length === 0) {
		return new Response(JSON.stringify({ groups: [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Check for cached analysis (unless refresh is requested)
	if (!refresh && headSha) {
		const cached = await getPrOverviewAnalysis(owner, repo, pullNumber, headSha);
		if (cached) {
			return new Response(
				JSON.stringify({ groups: cached.groups, cached: true }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	const filesContext = files
		.slice(0, 50)
		.map((f) => {
			const patch = f.patch ? truncatePatch(f.patch) : "(no diff available)";
			return `## ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n\`\`\`diff\n${patch}\n\`\`\``;
		})
		.join("\n\n");

	const prompt = `Analyze this pull request and organize the changes for review.

**PR Title:** ${prTitle}

**PR Description:**
${prBody || "(no description)"}

**Changed Files (${files.length} total):**

${filesContext}

Respond with only valid JSON, no markdown fences.`;

	try {
		const { text, usage } = await generateText({
			model,
			system: SYSTEM_PROMPT,
			prompt,
			temperature: 0.3,
		});

		waitUntil(
			logTokenUsage({
				userId: session.user.id,
				provider: "openrouter",
				modelId,
				taskType: "pr-overview",
				usage,
				isCustomApiKey,
			}).catch((e) => console.error("[billing] logTokenUsage failed:", e)),
		);

		let cleanedText = text.trim();
		if (cleanedText.startsWith("```json")) {
			cleanedText = cleanedText.slice(7);
		} else if (cleanedText.startsWith("```")) {
			cleanedText = cleanedText.slice(3);
		}
		if (cleanedText.endsWith("```")) {
			cleanedText = cleanedText.slice(0, -3);
		}
		cleanedText = cleanedText.trim();

		let parsed: { groups?: ChangeGroup[] };
		try {
			parsed = JSON.parse(cleanedText);
		} catch {
			console.error(
				"[pr-overview] Failed to parse AI response:",
				cleanedText.slice(0, 500),
			);
			return new Response(
				JSON.stringify({
					error: "Failed to parse AI response",
					groups: [],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		const groups: ChangeGroup[] = (parsed.groups || []).map((g, i) => ({
			id: g.id || `group-${i}`,
			title: g.title || `Group ${i + 1}`,
			summary: g.summary || "",
			reviewOrder: typeof g.reviewOrder === "number" ? g.reviewOrder : i + 1,
			files: (g.files || []).map((f) => ({
				filename: f.filename || "",
				snippet: f.snippet || "",
				explanation: f.explanation || "",
			})),
		}));

		// Save to database if we have headSha
		if (headSha) {
			waitUntil(
				savePrOverviewAnalysis(
					owner,
					repo,
					pullNumber,
					headSha,
					groups,
				).catch((e) =>
					console.error("[pr-overview] Failed to save analysis:", e),
				),
			);
		}

		return new Response(JSON.stringify({ groups, cached: false }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (e: unknown) {
		console.error("[pr-overview] Error:", e);
		return new Response(
			JSON.stringify({ error: getErrorMessage(e) || "Failed to analyze PR" }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
}
