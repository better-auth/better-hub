import { prisma } from "./db";
import { ScanError } from "./extension-scanner";
import type {
	ExtensionScanResult,
	ExtensionType,
	ThemeStoreExtensionListItem,
	ThemeStoreExtensionDetail,
} from "./theme-store-types";

function toSlug(owner: string, repo: string): string {
	return `${owner.toLowerCase()}--${repo.toLowerCase()}`;
}

function toListItem(row: {
	id: string;
	slug: string;
	name: string;
	description: string;
	type: string;
	version: string;
	iconUrl: string | null;
	authorName: string;
	authorAvatarUrl: string | null;
	downloads: number;
	verified: boolean;
	featured: boolean;
	publishedAt: string;
}): ThemeStoreExtensionListItem {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		type: row.type as ExtensionType,
		version: row.version,
		iconUrl: row.iconUrl,
		authorName: row.authorName,
		authorAvatarUrl: row.authorAvatarUrl,
		downloads: row.downloads,
		verified: row.verified,
		featured: row.featured,
		publishedAt: row.publishedAt,
	};
}

function toDetail(
	row: {
		id: string;
		slug: string;
		name: string;
		description: string;
		type: string;
		version: string;
		iconUrl: string | null;
		authorName: string;
		authorAvatarUrl: string | null;
		authorGithubId: string;
		downloads: number;
		verified: boolean;
		featured: boolean;
		publishedAt: string;
		updatedAt: string;
		owner: string;
		repo: string;
		license: string | null;
		readmeHtml: string | null;
		dataJson: string | null;
	},
	installed?: boolean,
): ThemeStoreExtensionDetail {
	return {
		...toListItem(row),
		owner: row.owner,
		repo: row.repo,
		license: row.license,
		readmeHtml: row.readmeHtml,
		dataJson: row.dataJson,
		authorGithubId: row.authorGithubId,
		updatedAt: row.updatedAt,
		installed,
	};
}

export async function publishExtension(
	scan: ExtensionScanResult,
	authorGithubId: string,
	authorName: string,
	authorAvatarUrl: string | null,
	opts?: { verified?: boolean },
): Promise<ThemeStoreExtensionDetail> {
	const now = new Date().toISOString();
	const slug = toSlug(scan.owner, scan.repo);
	const verified = opts?.verified ?? false;
	const name = scan.manifest.name;

	const nameRegex = /^[a-zA-Z0-9_-\s]+$/;
	if (!nameRegex.test(name)) {
		throw new ScanError(
			"Name must be alphanumeric and can contain underscores and hyphens",
			400,
		);
	}

	const row = await prisma.marketplaceExtension.upsert({
		where: { slug },
		create: {
			slug,
			owner: scan.owner,
			repo: scan.repo,
			name,
			description: scan.manifest.description,
			type: scan.manifest.type,
			version: scan.manifest.version,
			manifestJson: JSON.stringify(scan.manifest),
			dataJson: JSON.stringify(scan.data),
			readmeHtml: scan.readmeHtml,
			iconUrl: scan.iconUrl,
			license: scan.manifest.license ?? null,
			authorGithubId,
			authorName,
			authorAvatarUrl,
			verified,
			publishedAt: now,
			updatedAt: now,
			dataCachedAt: now,
		},
		update: {
			name: scan.manifest.name,
			description: scan.manifest.description,
			type: scan.manifest.type,
			version: scan.manifest.version,
			manifestJson: JSON.stringify(scan.manifest),
			dataJson: JSON.stringify(scan.data),
			readmeHtml: scan.readmeHtml,
			iconUrl: scan.iconUrl,
			license: scan.manifest.license ?? null,
			verified,
			updatedAt: now,
			dataCachedAt: now,
		},
	});

	return toDetail(row);
}

export async function listExtensions(opts: {
	type?: ExtensionType;
	search?: string;
	page?: number;
	perPage?: number;
}): Promise<{ items: ThemeStoreExtensionListItem[]; total: number }> {
	const { type, search, page = 1, perPage = 24 } = opts;
	const skip = (page - 1) * perPage;

	const where: Record<string, unknown> = {};
	if (type) where.type = type;
	if (search) {
		where.OR = [
			{ name: { contains: search, mode: "insensitive" } },
			{ description: { contains: search, mode: "insensitive" } },
			{ authorName: { contains: search, mode: "insensitive" } },
		];
	}

	const [items, total] = await Promise.all([
		prisma.marketplaceExtension.findMany({
			where,
			orderBy: [
				{ featured: "desc" },
				{ downloads: "desc" },
				{ publishedAt: "desc" },
			],
			skip,
			take: perPage,
		}),
		prisma.marketplaceExtension.count({ where }),
	]);

	return { items: items.map(toListItem), total };
}

export async function getExtensionBySlug(
	slug: string,
	userId?: string,
): Promise<ThemeStoreExtensionDetail | null> {
	const row = await prisma.marketplaceExtension.findUnique({ where: { slug } });
	if (!row) return null;

	let installed = false;
	if (userId) {
		const install = await prisma.userExtensionInstall.findUnique({
			where: { userId_extensionId: { userId, extensionId: row.id } },
		});
		installed = !!install;
	}

	return toDetail(row, installed);
}

export async function installExtension(
	userId: string,
	extensionId: string,
): Promise<{ alreadyInstalled: boolean }> {
	const existing = await prisma.userExtensionInstall.findUnique({
		where: { userId_extensionId: { userId, extensionId } },
	});

	if (existing) {
		return { alreadyInstalled: true };
	}

	const now = new Date().toISOString();
	await prisma.$transaction([
		prisma.userExtensionInstall.create({
			data: { userId, extensionId, installedAt: now },
		}),
		prisma.marketplaceExtension.update({
			where: { id: extensionId },
			data: { downloads: { increment: 1 } },
		}),
	]);

	return { alreadyInstalled: false };
}

export async function uninstallExtension(userId: string, extensionId: string): Promise<void> {
	const deleted = await prisma.userExtensionInstall
		.delete({
			where: { userId_extensionId: { userId, extensionId } },
		})
		.catch(() => null);

	if (deleted) {
		await prisma.marketplaceExtension
			.update({
				where: { id: extensionId },
				data: { downloads: { decrement: 1 } },
			})
			.catch(() => {});
	}
}

export async function getInstalledExtensions(
	userId: string,
	type?: ExtensionType,
): Promise<ThemeStoreExtensionDetail[]> {
	const where: Record<string, unknown> = { userId };
	if (type) {
		where.extension = { type };
	}

	const installs = await prisma.userExtensionInstall.findMany({
		where,
		include: { extension: true },
		orderBy: { installedAt: "desc" },
	});

	return installs.map((i) => toDetail(i.extension, true));
}

export async function syncExtensionData(
	slug: string,
	dataJson: string,
	readmeHtml: string | null,
): Promise<void> {
	const now = new Date().toISOString();
	await prisma.marketplaceExtension.update({
		where: { slug },
		data: { dataJson, readmeHtml, dataCachedAt: now, updatedAt: now },
	});
}

export async function unpublishExtension(slug: string, authorGithubId: string): Promise<boolean> {
	const row = await prisma.marketplaceExtension.findUnique({ where: { slug } });
	if (!row || row.authorGithubId !== authorGithubId) return false;

	await prisma.$transaction([
		prisma.userExtensionInstall.deleteMany({ where: { extensionId: row.id } }),
		prisma.marketplaceExtension.delete({ where: { id: row.id } }),
	]);
	return true;
}

export async function getExtensionById(id: string) {
	return prisma.marketplaceExtension.findUnique({ where: { id } });
}

export async function countExtensionsByAuthor(authorGithubId: string): Promise<number> {
	return prisma.marketplaceExtension.count({ where: { authorGithubId } });
}

export async function extensionExistsBySlug(slug: string): Promise<boolean> {
	const row = await prisma.marketplaceExtension.findUnique({
		where: { slug },
		select: { id: true },
	});
	return !!row;
}

export { toSlug };
