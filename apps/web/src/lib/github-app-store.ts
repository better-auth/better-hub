import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────

export interface AppInstallation {
	id: string;
	installationId: number;
	accountLogin: string;
	accountType: string;
	appSlug: string;
	status: string;
	permissions: string | null;
	events: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AppInstallationRepo {
	id: string;
	installationId: number;
	owner: string;
	repo: string;
	status: string;
	lastWebhookAt: string | null;
	lastPolledAt: string | null;
	createdAt: string;
	updatedAt: string;
}

// ── Installation CRUD ────────────────────────────────────────

export async function upsertInstallation(input: {
	installationId: number;
	accountLogin: string;
	accountType: string;
	appSlug: string;
	permissions?: Record<string, string>;
	events?: string[];
}): Promise<AppInstallation> {
	const now = new Date().toISOString();
	const permissionsJson = input.permissions ? JSON.stringify(input.permissions) : null;
	const eventsJson = input.events ? JSON.stringify(input.events) : null;

	const result = await prisma.gitHubAppInstallation.upsert({
		where: { installationId: input.installationId },
		create: {
			installationId: input.installationId,
			accountLogin: input.accountLogin,
			accountType: input.accountType,
			appSlug: input.appSlug,
			status: "active",
			permissions: permissionsJson,
			events: eventsJson,
			createdAt: now,
			updatedAt: now,
		},
		update: {
			accountLogin: input.accountLogin,
			accountType: input.accountType,
			appSlug: input.appSlug,
			status: "active",
			permissions: permissionsJson,
			events: eventsJson,
			updatedAt: now,
		},
	});
	return result as unknown as AppInstallation;
}

export async function suspendInstallation(installationId: number): Promise<void> {
	const now = new Date().toISOString();
	await prisma.gitHubAppInstallation.update({
		where: { installationId },
		data: { status: "suspended", updatedAt: now },
	});
}

export async function unsuspendInstallation(installationId: number): Promise<void> {
	const now = new Date().toISOString();
	await prisma.gitHubAppInstallation.update({
		where: { installationId },
		data: { status: "active", updatedAt: now },
	});
}

export async function removeInstallation(installationId: number): Promise<void> {
	const now = new Date().toISOString();
	// Mark installation and all its repos as removed (cascade will handle repos on delete,
	// but we soft-delete for audit trail)
	await prisma.$transaction([
		prisma.gitHubAppInstallationRepo.updateMany({
			where: { installationId },
			data: { status: "removed", updatedAt: now },
		}),
		prisma.gitHubAppInstallation.update({
			where: { installationId },
			data: { status: "removed", updatedAt: now },
		}),
	]);
}

// ── Repo CRUD ────────────────────────────────────────────────

export async function syncInstallationRepos(
	installationId: number,
	repos: Array<{ owner: string; repo: string }>,
): Promise<void> {
	const now = new Date().toISOString();

	await prisma.$transaction(
		repos.map(({ owner, repo }) =>
			prisma.gitHubAppInstallationRepo.upsert({
				where: {
					installationId_owner_repo: { installationId, owner, repo },
				},
				create: {
					installationId,
					owner,
					repo,
					status: "active",
					createdAt: now,
					updatedAt: now,
				},
				update: {
					status: "active",
					updatedAt: now,
				},
			}),
		),
	);
}

export async function addInstallationRepos(
	installationId: number,
	repos: Array<{ owner: string; repo: string }>,
): Promise<void> {
	const now = new Date().toISOString();

	await prisma.$transaction(
		repos.map(({ owner, repo }) =>
			prisma.gitHubAppInstallationRepo.upsert({
				where: {
					installationId_owner_repo: { installationId, owner, repo },
				},
				create: {
					installationId,
					owner,
					repo,
					status: "active",
					createdAt: now,
					updatedAt: now,
				},
				update: {
					status: "active",
					updatedAt: now,
				},
			}),
		),
	);
}

export async function removeInstallationRepos(
	installationId: number,
	repos: Array<{ owner: string; repo: string }>,
): Promise<void> {
	const now = new Date().toISOString();

	await prisma.$transaction(
		repos.map(({ owner, repo }) =>
			prisma.gitHubAppInstallationRepo.updateMany({
				where: { installationId, owner, repo },
				data: { status: "removed", updatedAt: now },
			}),
		),
	);
}

// ── Queries ──────────────────────────────────────────────────

/**
 * Get the active installation ID for a specific repo.
 * Returns null if no GitHub App is installed for this repo.
 */
export async function getInstallationForRepo(
	owner: string,
	repo: string,
): Promise<number | null> {
	const record = await prisma.gitHubAppInstallationRepo.findFirst({
		where: { owner, repo, status: "active" },
		include: { installation: { select: { status: true } } },
	});

	if (!record || record.installation.status !== "active") return null;
	return record.installationId;
}

/**
 * Check if a repo has an active GitHub App installation.
 */
export async function hasActiveInstallation(
	owner: string,
	repo: string,
): Promise<boolean> {
	return (await getInstallationForRepo(owner, repo)) !== null;
}

/**
 * Get all active repos that do NOT have a GitHub App installation.
 * These are the repos that need polling fallback.
 * We derive this from repos that users have visited (have system pins or pinned items)
 * but lack an app installation.
 */
export async function getReposNeedingPolling(): Promise<
	Array<{ owner: string; repo: string }>
> {
	// Get all distinct repos from system pins that are active
	const pinnedRepos = await prisma.repoSystemPin.findMany({
		where: { status: "active" },
		select: { owner: true, repo: true },
		distinct: ["owner", "repo"],
	});

	// Get repos from user pinned items
	const userPinnedRepos = await prisma.pinnedItem.findMany({
		select: { owner: true, repo: true },
		distinct: ["owner", "repo"],
	});

	// Combine unique repos
	const allRepos = new Map<string, { owner: string; repo: string }>();
	for (const r of [...pinnedRepos, ...userPinnedRepos]) {
		allRepos.set(`${r.owner}/${r.repo}`, { owner: r.owner, repo: r.repo });
	}

	// Filter out repos that have active installations
	const results: Array<{ owner: string; repo: string }> = [];
	for (const repo of allRepos.values()) {
		const installed = await hasActiveInstallation(repo.owner, repo.repo);
		if (!installed) {
			results.push(repo);
		}
	}

	return results;
}

/**
 * Update the lastWebhookAt timestamp for a repo.
 */
export async function touchRepoWebhook(
	installationId: number,
	owner: string,
	repo: string,
): Promise<void> {
	const now = new Date().toISOString();
	await prisma.gitHubAppInstallationRepo.updateMany({
		where: { installationId, owner, repo },
		data: { lastWebhookAt: now, updatedAt: now },
	});
}

/**
 * Update the lastPolledAt timestamp for a repo.
 */
export async function touchRepoPolled(
	owner: string,
	repo: string,
): Promise<void> {
	const now = new Date().toISOString();
	// For polled repos, update the first matching record (if any)
	await prisma.gitHubAppInstallationRepo.updateMany({
		where: { owner, repo },
		data: { lastPolledAt: now, updatedAt: now },
	});
}
