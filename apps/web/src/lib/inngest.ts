import { Inngest } from "inngest";
import { Octokit } from "@octokit/rest";
import { embedText, embedTexts } from "@/lib/mixedbread";
import {
	getExistingContentHash,
	hashContent,
	upsertEmbedding,
	type ContentType,
} from "@/lib/embedding-store";
import { prisma } from "@/lib/db";
import { symmetricDecrypt } from "better-auth/crypto";
import {
	activateSystemPin,
	clearSystemPin,
} from "@/lib/system-pins-store";
import { getInstallationOctokit } from "@/lib/github-app";
import {
	getInstallationForRepo,
	getReposNeedingPolling,
	touchRepoPolled,
} from "@/lib/github-app-store";

export const inngest = new Inngest({ id: "better-github" });

interface ContentViewedData {
	userId: string;
	contentType: "pr" | "issue";
	owner: string;
	repo: string;
	number: number;
	title: string;
	body: string;
	comments?: {
		id: number | string;
		body: string;
		author: string;
		createdAt: string;
	}[];
	reviews?: {
		id: number | string;
		body: string;
		author: string;
		state: string;
		createdAt: string;
	}[];
}

export const embedContent = inngest.createFunction(
	{
		id: "embed-content",
		concurrency: [{ limit: 5 }],
		retries: 3,
	},
	{ event: "app/content.viewed" },
	async ({ event, step }) => {
		const data = event.data as ContentViewedData;
		const {
			userId,
			contentType,
			owner,
			repo,
			number: itemNumber,
			title,
			body,
			comments,
			reviews,
		} = data;

		const contentKey = `${owner}/${repo}#${itemNumber}`;

		// Step 1: Embed the main item (title + body)
		await step.run("embed-main-item", async () => {
			const text = `${title}\n\n${body}`;
			const hash = hashContent(text);

			const existingHash = await getExistingContentHash(
				userId,
				contentType,
				contentKey,
			);
			if (existingHash === hash) return { skipped: true };

			const embedding = await embedText(text);
			await upsertEmbedding({
				userId,
				contentType,
				contentKey,
				owner,
				repo,
				itemNumber,
				contentHash: hash,
				embedding,
				title,
				snippet: text.slice(0, 300),
				metadata: {
					author: null,
					createdAt: null,
				},
			});

			return { embedded: true };
		});

		// Step 2: Embed comments in batches of 20
		const allCommentItems: {
			id: string;
			type: ContentType;
			key: string;
			text: string;
			author: string;
			createdAt: string;
			state?: string;
		}[] = [];

		if (comments) {
			for (const c of comments) {
				if (!c.body?.trim()) continue;
				const commentType: ContentType =
					contentType === "pr" ? "pr_comment" : "issue_comment";
				allCommentItems.push({
					id: String(c.id),
					type: commentType,
					key: `${contentKey}/comment/${c.id}`,
					text: c.body,
					author: c.author,
					createdAt: c.createdAt,
				});
			}
		}

		if (reviews) {
			for (const r of reviews) {
				if (!r.body?.trim()) continue;
				allCommentItems.push({
					id: String(r.id),
					type: "review",
					key: `${contentKey}/review/${r.id}`,
					text: r.body,
					author: r.author,
					createdAt: r.createdAt,
					state: r.state,
				});
			}
		}

		// Process in batches of 20
		const batchSize = 20;
		for (let i = 0; i < allCommentItems.length; i += batchSize) {
			const batch = allCommentItems.slice(i, i + batchSize);
			const batchIndex = Math.floor(i / batchSize);

			await step.run(`embed-comments-batch-${batchIndex}`, async () => {
				// Check which items need embedding
				const toEmbed: typeof batch = [];
				for (const item of batch) {
					const hash = hashContent(item.text);
					const existingHash = await getExistingContentHash(
						userId,
						item.type,
						item.key,
					);
					if (existingHash !== hash) {
						toEmbed.push(item);
					}
				}

				if (toEmbed.length === 0) return { skipped: batch.length };

				const embeddings = await embedTexts(
					toEmbed.map((item) => item.text),
				);

				for (let j = 0; j < toEmbed.length; j++) {
					const item = toEmbed[j];
					await upsertEmbedding({
						userId,
						contentType: item.type,
						contentKey: item.key,
						owner,
						repo,
						itemNumber,
						contentHash: hashContent(item.text),
						embedding: embeddings[j],
						title,
						snippet: item.text.slice(0, 300),
						metadata: {
							author: item.author,
							createdAt: item.createdAt,
							...(item.state
								? { state: item.state }
								: {}),
						},
					});
				}

				return {
					embedded: toEmbed.length,
					skipped: batch.length - toEmbed.length,
				};
			});
		}

	return {
		contentKey,
		commentCount: allCommentItems.length,
	};
	},
);

// ── Auth Helpers ──────────────────────────────────────────────

/**
 * Get an Octokit instance for a repo.
 * Priority:
 *   1. Installation token (if installationId provided or discoverable)
 *   2. Any user's OAuth token (fallback for repos without app installation)
 */
async function getOctokitForRepo(
	owner: string,
	repo: string,
	installationId?: number | null,
): Promise<Octokit | null> {
	// Try installation token first
	const instId = installationId ?? (await getInstallationForRepo(owner, repo));
	if (instId) {
		const octokit = await getInstallationOctokit(instId);
		if (octokit) return octokit;
	}

	// Fallback: decrypt any user's OAuth token
	return getFallbackOctokit();
}

async function getFallbackOctokit(): Promise<Octokit | null> {
	const account = await prisma.account.findFirst({
		where: { providerId: "github" },
		select: { accessToken: true },
		orderBy: { updatedAt: "desc" },
	});

	if (!account?.accessToken) return null;

	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) return null;

	try {
		const decrypted = await symmetricDecrypt({
			key: secret,
			data: account.accessToken,
		});
		return new Octokit({ auth: decrypted });
	} catch {
		return null;
	}
}

// ── Conflict Evaluate ────────────────────────────────────────

interface ConflictEvaluateData {
	owner: string;
	repo: string;
	pullNumber: number;
	installationId?: number | null;
	title: string;
	url: string;
	headRef: string;
	baseRef: string;
	webhookAction?: string;
	source: "github_app_webhook" | "polling";
}

export const evaluatePRConflict = inngest.createFunction(
	{
		id: "evaluate-pr-conflict",
		concurrency: [{ limit: 10 }],
		retries: 2,
	},
	{ event: "app/pr.conflict.evaluate" },
	async ({ event, step }) => {
		const data = event.data as ConflictEvaluateData;
		const { owner, repo, pullNumber, installationId, title, url, source } = data;
		const resourceKey = `pr:${pullNumber}`;

		// Step 1: Wait briefly for GitHub to compute mergeability
		await step.sleep("wait-for-mergeability", "5s");

		// Step 2: Fetch PR detail and check mergeability
		const mergeResult = await step.run("check-mergeability", async () => {
			const octokit = await getOctokitForRepo(owner, repo, installationId);
			if (!octokit) {
				return { error: "no_auth" as const };
			}

			const { data: pr } = await octokit.rest.pulls.get({
				owner,
				repo,
				pull_number: pullNumber,
			});

			return {
				mergeable: pr.mergeable,
				mergeable_state: pr.mergeable_state,
				state: pr.state,
				merged: pr.merged,
			};
		});

		if ("error" in mergeResult) {
			return { status: "skipped", reason: mergeResult.error };
		}

		// If PR is closed/merged, clear any existing pin
		if (mergeResult.state === "closed" || mergeResult.merged) {
			const { transitioned } = await step.run("clear-closed-pr", async () => {
				return clearSystemPin(owner, repo, "pr_conflict", resourceKey);
			});
			return { status: "cleared", reason: "closed_or_merged", transitioned };
		}

		// If mergeability is still null, retry once after a longer delay
		if (mergeResult.mergeable === null) {
			await step.sleep("retry-mergeability-delay", "15s");

			const retryResult = await step.run("retry-mergeability", async () => {
				const octokit = await getOctokitForRepo(owner, repo, installationId);
				if (!octokit) return { error: "no_auth" as const };

				const { data: pr } = await octokit.rest.pulls.get({
					owner,
					repo,
					pull_number: pullNumber,
				});

				return {
					mergeable: pr.mergeable,
					mergeable_state: pr.mergeable_state,
				};
			});

			if ("error" in retryResult) {
				return { status: "skipped", reason: "no_auth_retry" };
			}

			// Still null — give up, next webhook/poll will retry
			if (retryResult.mergeable === null) {
				return { status: "skipped", reason: "mergeability_unknown" };
			}

			const hasConflict =
				retryResult.mergeable_state === "dirty" || retryResult.mergeable === false;

			return applyTransition(step, {
				owner,
				repo,
				pullNumber,
				resourceKey,
				title,
				url,
				hasConflict,
				source,
			});
		}

		// We have a definitive mergeability answer
		const hasConflict =
			mergeResult.mergeable_state === "dirty" || mergeResult.mergeable === false;

		return applyTransition(step, {
			owner,
			repo,
			pullNumber,
			resourceKey,
			title,
			url,
			hasConflict,
			source,
		});
	},
);

// ── State Transition Helper ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyTransition(
	step: any,
	params: {
		owner: string;
		repo: string;
		pullNumber: number;
		resourceKey: string;
		title: string;
		url: string;
		hasConflict: boolean;
		source: string;
	},
) {
	const { owner, repo, pullNumber, resourceKey, title, url, hasConflict, source } = params;

	if (hasConflict) {
		const { transitioned } = await step.run("activate-conflict-pin", async () => {
			return activateSystemPin({
				owner,
				repo,
				kind: "pr_conflict",
				resourceKey,
				url,
				title,
				payload: {
					pullNumber,
					detectedAt: new Date().toISOString(),
					source,
				},
			});
		});
		return { status: "conflict_detected", transitioned, pullNumber };
	}

	// No conflict — clear pin if one existed
	const { transitioned } = await step.run("clear-conflict-pin", async () => {
		return clearSystemPin(owner, repo, "pr_conflict", resourceKey);
	});
	return { status: "no_conflict", transitioned, pullNumber };
}

// ── Conflict Clear (for closed/merged PRs) ───────────────────

interface ConflictClearData {
	owner: string;
	repo: string;
	pullNumber: number;
	reason: string;
}

export const clearPRConflict = inngest.createFunction(
	{
		id: "clear-pr-conflict",
		retries: 3,
	},
	{ event: "app/pr.conflict.clear" },
	async ({ event, step }) => {
		const data = event.data as ConflictClearData;
		const { owner, repo, pullNumber, reason } = data;
		const resourceKey = `pr:${pullNumber}`;

		const { transitioned } = await step.run("clear-pin", async () => {
			return clearSystemPin(owner, repo, "pr_conflict", resourceKey);
		});

		return { status: "cleared", reason, transitioned, pullNumber };
	},
);

// ── Polling Fallback (for repos without GitHub App) ──────────

export const pollConflicts = inngest.createFunction(
	{
		id: "poll-pr-conflicts",
		concurrency: [{ limit: 3 }],
		retries: 1,
	},
	{ cron: "*/15 * * * *" }, // Every 15 minutes
	async ({ step }) => {
		// Step 1: Get repos that need polling (no active app installation)
		const repos = await step.run("get-repos-needing-polling", async () => {
			return getReposNeedingPolling();
		});

		if (repos.length === 0) {
			return { status: "no_repos_to_poll" };
		}

		let totalEvaluated = 0;

		// Step 2: For each repo, fetch open PRs and evaluate conflicts
		for (const { owner, repo } of repos) {
			const prs = await step.run(`fetch-open-prs-${owner}-${repo}`, async () => {
				const octokit = await getOctokitForRepo(owner, repo);
				if (!octokit) return [];

				try {
					const { data } = await octokit.rest.pulls.list({
						owner,
						repo,
						state: "open",
						per_page: 100,
					});

					await touchRepoPolled(owner, repo);

					return data.map((pr) => ({
						number: pr.number,
						title: pr.title,
						url: pr.html_url,
						headRef: pr.head.ref,
						baseRef: pr.base.ref,
					}));
				} catch (error) {
					console.error(`[poll-conflicts] Failed to fetch PRs for ${owner}/${repo}:`, error);
					return [];
				}
			});

			// Enqueue evaluate events for each open PR
			if (prs.length > 0) {
				await step.run(`enqueue-evaluations-${owner}-${repo}`, async () => {
					await inngest.send(
						prs.map((pr) => ({
							name: "app/pr.conflict.evaluate" as const,
							data: {
								owner,
								repo,
								pullNumber: pr.number,
								installationId: null,
								title: pr.title,
								url: pr.url,
								headRef: pr.headRef,
								baseRef: pr.baseRef,
								source: "polling" as const,
							},
						})),
					);
				});
				totalEvaluated += prs.length;
			}
		}

		return { status: "polled", reposChecked: repos.length, prsEvaluated: totalEvaluated };
	},
);
