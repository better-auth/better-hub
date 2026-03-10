import { generateText, Output } from "ai";
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
import { extractSnippetFromPatch } from "@/lib/extract-snippet";

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
	startLine?: number;
	endLine?: number;
}

interface ChangeGroup {
	id: string;
	title: string;
	summary: string;
	reviewOrder: number;
	files: FileAnalysis[];
}

const OverviewOutputSchema = z.object({
	groups: z.array(
		z.object({
			id: z.string().describe("A unique kebab-case id for this group"),
			title: z
				.string()
				.describe("Short descriptive title, e.g. 'API Authentication'"),
			summary: z
				.string()
				.describe(
					"2-3 sentence explanation of what these changes accomplish and why. Supports inline markdown: **bold**, *italics*, `code`.",
				),
			reviewOrder: z
				.number()
				.describe(
					"Review priority, starting at 1 for the most foundational changes",
				),
			files: z.array(
				z.object({
					filename: z.string().describe("Path to the changed file"),
					explanation: z
						.string()
						.describe(
							"Brief explanation focusing on why this file changed. Supports inline markdown: **bold**, *italics*, `code`.",
						),
					startLine: z
						.number()
						.describe(
							"1-based line number in the NEW file where the most relevant section begins (from the @@ hunk header's +N range)",
						),
					endLine: z
						.number()
						.describe(
							"1-based line number in the NEW file where the most relevant section ends (inclusive, max 15 lines from startLine)",
						),
				}),
			),
		}),
	),
});

const SYSTEM_PROMPT = `You are a code review assistant that analyzes pull request changes and organizes them for optimal review.

Your task is to:
1. Group related file changes by feature area or logical grouping (2-6 groups depending on PR size)
2. Order groups by suggested review priority (dependencies first, then core changes, then peripheral)
3. For each file, identify the most relevant line range (max 15 lines) and explain why it changed

Guidelines:
- Group titles should be concise (e.g., "API Authentication", "UI Components", "Test Coverage")
- For each file, provide startLine and endLine pointing to the most important section of the diff. These are 1-based line numbers in the NEW version of the file (from the @@ hunk header's +N range). The code snippet will be extracted automatically — do NOT return code yourself.
- Explanations should focus on "why" not just "what"
- reviewOrder should start at 1 for the most foundational changes
- The "summary" and "explanation" fields support inline markdown: use **bold** for emphasis, *italics* for nuance, and \`backticks\` for inline code references (e.g. function names, variable names, file paths). Do NOT use headings, lists, or block-level markdown—only inline formatting.`;

const IGNORED_FILENAMES = new Set([
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",
	"bun.lockb",
	"bun.lock",
	"composer.lock",
	"Gemfile.lock",
	"Cargo.lock",
	"poetry.lock",
	"Pipfile.lock",
	"go.sum",
	"flake.lock",
	"packages-lock.json",
	".DS_Store",
	"Thumbs.db",
]);

const IGNORED_EXTENSIONS = new Set([
	".min.js",
	".min.css",
	".map",
	".snap",
	".svg",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".ico",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".mp4",
	".webm",
	".pdf",
]);

function shouldIncludeFile(filename: string): boolean {
	const basename = filename.split("/").pop() ?? filename;
	if (IGNORED_FILENAMES.has(basename)) return false;
	for (const ext of IGNORED_EXTENSIONS) {
		if (filename.endsWith(ext)) return false;
	}
	return true;
}

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
		const hasEmptySnippets = cached?.groups.some((g) =>
			g.files.some((f) => !f.snippet),
		);
		if (cached && !hasEmptySnippets) {
			return new Response(
				JSON.stringify({ groups: cached.groups, cached: true }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	const relevantFiles = files.filter((f) => shouldIncludeFile(f.filename));

	const filesContext = relevantFiles
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

**Changed Files (${relevantFiles.length} total${relevantFiles.length < files.length ? `, ${files.length - relevantFiles.length} auto-generated/lock files excluded` : ""}):**

${filesContext}`;

	try {
		const { output, usage } = await generateText({
			model,
			system: SYSTEM_PROMPT,
			prompt,
			output: Output.object({ schema: OverviewOutputSchema }),
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

		if (!output) {
			return new Response(
				JSON.stringify({
					error: "Failed to parse AI response",
					groups: [],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		const patchMap = new Map<string, string>();
		for (const f of files) {
			if (f.patch) patchMap.set(f.filename, f.patch);
		}

		const groups: ChangeGroup[] = output.groups.map((g, i) => ({
			id: g.id || `group-${i}`,
			title: g.title || `Group ${i + 1}`,
			summary: g.summary || "",
			reviewOrder: g.reviewOrder ?? i + 1,
			files: g.files.map((f) => ({
				filename: f.filename,
				snippet: extractSnippetFromPatch(
					patchMap.get(f.filename),
					f.startLine,
					f.endLine,
				),
				explanation: f.explanation,
				startLine: f.startLine,
				endLine: f.endLine,
			})),
		}));

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
