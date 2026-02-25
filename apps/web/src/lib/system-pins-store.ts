import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────

export type SystemPinKind = "pr_conflict";
export type SystemPinStatus = "active" | "cleared";

export interface SystemPin {
	id: string;
	owner: string;
	repo: string;
	kind: SystemPinKind;
	resourceKey: string;
	url: string;
	title: string;
	status: SystemPinStatus;
	payloadJson: string | null;
	createdAt: string;
	updatedAt: string;
	clearedAt: string | null;
}

export interface UpsertSystemPinInput {
	owner: string;
	repo: string;
	kind: SystemPinKind;
	resourceKey: string; // e.g. "pr:123"
	url: string;
	title: string;
	payload?: Record<string, unknown>;
}

// ── Queries ──────────────────────────────────────────────────

export async function getActiveSystemPins(
	owner: string,
	repo: string,
	kind?: SystemPinKind,
): Promise<SystemPin[]> {
	const where: Record<string, unknown> = { owner, repo, status: "active" };
	if (kind) where.kind = kind;

	return prisma.repoSystemPin.findMany({
		where,
		orderBy: { createdAt: "desc" },
	}) as unknown as SystemPin[];
}

export async function getSystemPin(
	owner: string,
	repo: string,
	kind: SystemPinKind,
	resourceKey: string,
): Promise<SystemPin | null> {
	return prisma.repoSystemPin.findUnique({
		where: {
			owner_repo_kind_resourceKey: { owner, repo, kind, resourceKey },
		},
	}) as unknown as SystemPin | null;
}

// ── Mutations ────────────────────────────────────────────────

/**
 * Create or re-activate a system pin. Returns the pin and whether
 * a state transition occurred (i.e. it was newly created or went
 * from cleared -> active).
 */
export async function activateSystemPin(
	input: UpsertSystemPinInput,
): Promise<{ pin: SystemPin; transitioned: boolean }> {
	const now = new Date().toISOString();
	const payloadJson = input.payload ? JSON.stringify(input.payload) : null;

	const existing = await getSystemPin(input.owner, input.repo, input.kind, input.resourceKey);

	if (existing && existing.status === "active") {
		// Already active — update title/payload but no transition
		const pin = await prisma.repoSystemPin.update({
			where: { id: existing.id },
			data: { title: input.title, payloadJson, updatedAt: now },
		});
		return { pin: pin as unknown as SystemPin, transitioned: false };
	}

	if (existing && existing.status === "cleared") {
		// Re-activate
		const pin = await prisma.repoSystemPin.update({
			where: { id: existing.id },
			data: {
				title: input.title,
				url: input.url,
				payloadJson,
				status: "active",
				clearedAt: null,
				updatedAt: now,
			},
		});
		return { pin: pin as unknown as SystemPin, transitioned: true };
	}

	// Brand new
	const pin = await prisma.repoSystemPin.create({
		data: {
			owner: input.owner,
			repo: input.repo,
			kind: input.kind,
			resourceKey: input.resourceKey,
			url: input.url,
			title: input.title,
			status: "active",
			payloadJson,
			createdAt: now,
			updatedAt: now,
		},
	});
	return { pin: pin as unknown as SystemPin, transitioned: true };
}

/**
 * Clear (deactivate) a system pin. Returns whether a transition occurred.
 */
export async function clearSystemPin(
	owner: string,
	repo: string,
	kind: SystemPinKind,
	resourceKey: string,
): Promise<{ transitioned: boolean }> {
	const now = new Date().toISOString();

	const existing = await getSystemPin(owner, repo, kind, resourceKey);

	if (!existing || existing.status === "cleared") {
		return { transitioned: false };
	}

	await prisma.repoSystemPin.update({
		where: { id: existing.id },
		data: { status: "cleared", clearedAt: now, updatedAt: now },
	});
	return { transitioned: true };
}

/**
 * Clear all active pins of a given kind for a repo.
 * Useful when a repo is removed or all PRs should be re-evaluated.
 */
export async function clearAllSystemPins(
	owner: string,
	repo: string,
	kind: SystemPinKind,
): Promise<number> {
	const now = new Date().toISOString();
	const result = await prisma.repoSystemPin.updateMany({
		where: { owner, repo, kind, status: "active" },
		data: { status: "cleared", clearedAt: now, updatedAt: now },
	});
	return result.count;
}
