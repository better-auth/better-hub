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

const MAX_SNIPPET_LINES = 15;

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
					"2-3 sentence explanation of what these changes accomplish and why. Use separate short paragraphs (blank-line-separated) instead of one dense block. Supports markdown: **bold**, *italics*, `code`, and fenced code blocks (```lang\\n...\\n```) when a short code example clarifies the change.",
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
							"Brief explanation focusing on why this file changed. Use separate short paragraphs (blank-line-separated) instead of one dense block. Supports markdown: **bold**, *italics*, `code`, and fenced code blocks (```lang\\n...\\n```) when a short code example clarifies the change.",
						),
					startLine: z
						.number()
						.describe(
							"1-based line number in the NEW file where the most important changed region begins (from the @@ hunk header's +N range). Pick a narrow, focused range — do NOT start at line 1 unless that is truly where the key change is.",
						),
					endLine: z
						.number()
						.describe(
							"1-based line number in the NEW file where the region ends (inclusive). MUST be at most startLine + 14 (i.e. max 15 lines). Aim for 5-12 lines covering only the single most critical change, not the whole diff.",
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
3. For each file, identify a SMALL, focused line range (5-15 lines) highlighting the single most important change and explain why it changed

Guidelines:
- Group titles should be concise (e.g., "API Authentication", "UI Components", "Test Coverage")
- CRITICAL — snippet targeting: For each file, startLine/endLine MUST pinpoint only the most important changed region. Pick the single most meaningful hunk — a new function signature, a key conditional, a config change — NOT the entire diff. The range MUST be at most 15 lines (aim for 5-12). These are 1-based line numbers in the NEW version of the file (from the @@ hunk header's +N range). The code snippet will be extracted automatically — do NOT return code yourself.
- Explanations should focus on "why" not just "what"
- reviewOrder should start at 1 for the most foundational changes
- The "summary" and "explanation" fields support markdown: use **bold** for emphasis, *italics* for nuance, \`backticks\` for inline code references, and fenced code blocks (\`\`\`lang … \`\`\`) when a short snippet (≤6 lines) helps illustrate the change (e.g. a new function signature, config change, or key type definition). Do NOT use headings or lists.
- IMPORTANT: Keep paragraphs short. Prefer splitting distinct points into separate short paragraphs (separated by a blank line) rather than writing one long dense paragraph. Each paragraph should convey a single idea.`;

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

function truncatePatch(patch: string, maxLines: number = 80): string {
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
			files: g.files.map((f) => {
				const clampedEnd = Math.min(
					f.endLine,
					f.startLine + MAX_SNIPPET_LINES - 1,
				);
				return {
					filename: f.filename,
					snippet: extractSnippetFromPatch(
						patchMap.get(f.filename),
						f.startLine,
						clampedEnd,
					),
					explanation: f.explanation,
					startLine: f.startLine,
					endLine: clampedEnd,
				};
			}),
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
