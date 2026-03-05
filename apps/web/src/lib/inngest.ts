import { Inngest } from "inngest";
import { embedText, embedTexts } from "@/lib/mixedbread";
import {
	getExistingContentHash,
	hashContent,
	upsertEmbedding,
	type ContentType,
} from "@/lib/embedding-store";
import { prisma } from "@/lib/db";
import { reportUsageToStripe } from "@/lib/billing/stripe";
import { STRIPE_MAX_EVENT_AGE_DAYS } from "@/lib/billing/config";

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

const RETRY_BATCH_SIZE = 500;
const RETRY_PARALLEL_CHUNK = 25;

export const retryUnreportedUsage = inngest.createFunction(
	{ id: "retry-unreported-usage", retries: 2 },
	{ cron: "*/10 * * * *" },
	async ({ step }) => {
		// 1. Expire entries older than 35 days (Stripe meter API limit)
		const expired = await step.run("clean-expired", async () => {
			const cutoff = new Date(
				Date.now() - STRIPE_MAX_EVENT_AGE_DAYS * 24 * 60 * 60 * 1000,
			);
			const items = await prisma.usageLog.findMany({
				where: {
					stripeReported: false,
					costUsd: { gt: 0 },
					createdAt: { lt: cutoff },
				},
				select: { id: true, userId: true, costUsd: true, createdAt: true },
				take: RETRY_BATCH_SIZE,
			});
			if (items.length > 0) {
				console.error(
					"[billing] PERMANENT LOSS:",
					items.length,
					"usage logs expired (>35 days)",
					items.slice(0, 5).map((i) => ({
						id: i.id,
						userId: i.userId,
						costUsd: Number(i.costUsd),
					})),
				);
				await prisma.usageLog.updateMany({
					where: { id: { in: items.map((i) => i.id) } },
					data: { stripeReported: true },
				});
			}
			return items.length;
		});

		// 2. Retry all unreported entries (at least 1 min old)
		const unreported = await step.run("fetch-unreported", () =>
			prisma.usageLog.findMany({
				where: {
					stripeReported: false,
					costUsd: { gt: 0 },
					createdAt: { lt: new Date(Date.now() - 60_000) },
				},
				orderBy: { id: "asc" },
				take: RETRY_BATCH_SIZE,
			}),
		);

		let succeeded = 0;
		for (let i = 0; i < unreported.length; i += RETRY_PARALLEL_CHUNK) {
			const chunk = unreported.slice(i, i + RETRY_PARALLEL_CHUNK);
			const results = await Promise.all(
				chunk.map((log) =>
					step.run(`report-${log.id}`, async () => {
						try {
							await reportUsageToStripe(
								log.id,
								log.userId,
								Number(log.costUsd),
								new Date(log.createdAt),
							);
							return true;
						} catch (e) {
							console.error(
								"[billing] meter retry failed:",
								log.id,
								e,
							);
							return false;
						}
					}),
				),
			);
			succeeded += results.filter(Boolean).length;
		}

		return { expired, attempted: unreported.length, succeeded };
	},
);
