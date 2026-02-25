import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { redis } from "@/lib/redis";
import { inngest } from "@/lib/inngest";
import { getWebhookSecret } from "@/lib/github-app";
import {
	upsertInstallation,
	removeInstallation,
	suspendInstallation,
	unsuspendInstallation,
	syncInstallationRepos,
	addInstallationRepos,
	removeInstallationRepos,
	touchRepoWebhook,
} from "@/lib/github-app-store";

// ── Signature Verification ───────────────────────────────────

function verifySignature(payload: string, signature: string | null, secret: string): boolean {
	if (!signature) return false;
	const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
	try {
		return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
	} catch {
		return false;
	}
}

// ── Delivery Deduplication ───────────────────────────────────

const DEDUPE_TTL_SECONDS = 60 * 60; // 1 hour

async function isDuplicateDelivery(deliveryId: string): Promise<boolean> {
	const result = await redis.set(`webhook:delivery:${deliveryId}`, "1", {
		nx: true,
		ex: DEDUPE_TTL_SECONDS,
	});
	return result === null;
}

// ── PR Actions We Care About ─────────────────────────────────

const PR_ACTIONS_EVALUATE = new Set([
	"opened",
	"reopened",
	"synchronize",
	"edited",
	"ready_for_review",
]);
const PR_ACTIONS_CLOSE = new Set(["closed"]);

// ── Webhook Payload Types ────────────────────────────────────

interface WebhookRepo {
	id: number;
	name: string;
	full_name: string;
}

// ── Route Handler ────────────────────────────────────────────

export async function POST(request: NextRequest) {
	const secret = getWebhookSecret();
	if (!secret) {
		console.error("[webhook] GitHub App webhook secret not configured");
		return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
	}

	// Read raw body for signature verification
	const rawBody = await request.text();
	const signature = request.headers.get("x-hub-signature-256");

	if (!verifySignature(rawBody, signature, secret)) {
		return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
	}

	// Deduplicate
	const deliveryId = request.headers.get("x-github-delivery");
	if (deliveryId && (await isDuplicateDelivery(deliveryId))) {
		return NextResponse.json({ status: "duplicate", deliveryId });
	}

	const eventType = request.headers.get("x-github-event");

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let payload: any;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	// ── Installation lifecycle events ────────────────────────
	if (eventType === "installation") {
		return handleInstallationEvent(payload);
	}

	if (eventType === "installation_repositories") {
		return handleInstallationRepositoriesEvent(payload);
	}

	// ── Pull request events ──────────────────────────────────
	if (eventType === "pull_request") {
		return handlePullRequestEvent(payload);
	}

	return NextResponse.json({ status: "ignored", event: eventType });
}

// ── Installation Event Handler ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInstallationEvent(payload: any) {
	const { action, installation, repositories } = payload;
	const installationId: number = installation.id;
	const accountLogin: string = installation.account.login;
	const accountType: string = installation.account.type;
	const appSlug: string = installation.app_slug;

	if (action === "created") {
		await upsertInstallation({
			installationId,
			accountLogin,
			accountType,
			appSlug,
			permissions: installation.permissions,
			events: installation.events,
		});

		// Sync initial repos
		if (repositories && Array.isArray(repositories)) {
			const repos = (repositories as WebhookRepo[]).map((r) => {
				const [owner, repo] = r.full_name.split("/");
				return { owner, repo };
			});
			await syncInstallationRepos(installationId, repos);
		}

		console.log(`[webhook] Installation created: ${installationId} for ${accountLogin}`);
		return NextResponse.json({ status: "processed", action: "installation.created" });
	}

	if (action === "deleted") {
		await removeInstallation(installationId);
		console.log(`[webhook] Installation removed: ${installationId} for ${accountLogin}`);
		return NextResponse.json({ status: "processed", action: "installation.deleted" });
	}

	if (action === "suspend") {
		await suspendInstallation(installationId);
		console.log(`[webhook] Installation suspended: ${installationId}`);
		return NextResponse.json({ status: "processed", action: "installation.suspend" });
	}

	if (action === "unsuspend") {
		await unsuspendInstallation(installationId);
		console.log(`[webhook] Installation unsuspended: ${installationId}`);
		return NextResponse.json({ status: "processed", action: "installation.unsuspend" });
	}

	return NextResponse.json({ status: "ignored", action: `installation.${action}` });
}

// ── Installation Repositories Event Handler ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInstallationRepositoriesEvent(payload: any) {
	const { action, installation, repositories_added, repositories_removed } = payload;
	const installationId: number = installation.id;

	if (action === "added" && repositories_added) {
		const repos = (repositories_added as WebhookRepo[]).map((r) => {
			const [owner, repo] = r.full_name.split("/");
			return { owner, repo };
		});
		await addInstallationRepos(installationId, repos);
		console.log(`[webhook] Repos added to installation ${installationId}: ${repos.map((r) => `${r.owner}/${r.repo}`).join(", ")}`);
		return NextResponse.json({ status: "processed", action: "repos.added", count: repos.length });
	}

	if (action === "removed" && repositories_removed) {
		const repos = (repositories_removed as WebhookRepo[]).map((r) => {
			const [owner, repo] = r.full_name.split("/");
			return { owner, repo };
		});
		await removeInstallationRepos(installationId, repos);
		console.log(`[webhook] Repos removed from installation ${installationId}: ${repos.map((r) => `${r.owner}/${r.repo}`).join(", ")}`);
		return NextResponse.json({ status: "processed", action: "repos.removed", count: repos.length });
	}

	return NextResponse.json({ status: "ignored", action: `repos.${action}` });
}

// ── Pull Request Event Handler ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePullRequestEvent(payload: any) {
	const { action, number: pullNumber, pull_request: pr, repository: repo, installation } = payload;
	const owner: string = repo.owner.login;
	const repoName: string = repo.name;
	const installationId: number | undefined = installation?.id;

	// Track webhook activity
	if (installationId) {
		touchRepoWebhook(installationId, owner, repoName).catch((err) => {
			console.error("[webhook] Failed to touch repo webhook timestamp:", err);
		});
	}

	if (PR_ACTIONS_CLOSE.has(action)) {
		await inngest.send({
			name: "app/pr.conflict.clear",
			data: {
				owner,
				repo: repoName,
				pullNumber,
				reason: pr.merged ? "merged" : "closed",
			},
		});
		return NextResponse.json({ status: "processed", action: "clear", pullNumber });
	}

	if (PR_ACTIONS_EVALUATE.has(action)) {
		await inngest.send({
			name: "app/pr.conflict.evaluate",
			data: {
				owner,
				repo: repoName,
				pullNumber,
				installationId: installationId ?? null,
				title: pr.title,
				url: pr.html_url,
				headRef: pr.head.ref,
				baseRef: pr.base.ref,
				webhookAction: action,
				source: "github_app_webhook",
			},
		});
		return NextResponse.json({ status: "processed", action: "evaluate", pullNumber });
	}

	return NextResponse.json({ status: "ignored", action });
}
