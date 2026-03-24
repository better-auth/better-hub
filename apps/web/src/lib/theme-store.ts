import { prisma } from "./db";
import { ScanError } from "./extension-scanner";
import type {
	CustomThemeScanResult,
	CustomThemeType,
	CustomThemeData,
	IconMapping,
	ThemeStoreListItem,
	ThemeStoreDetail,
} from "./theme-store-types";

function toSlug(owner: string, repo: string): string {
	return `${owner.toLowerCase()}--${repo.toLowerCase()}`;
}

const PREVIEW_COLOR_KEYS = [
	"--background",
	"--primary",
	"--accent",
	"--secondary",
	"--destructive",
	"--success",
] as const;

const PREVIEW_ICON_EXTS = ["ts", "js", "py", "json", "css", "html"];

function extractPreview(
	type: string,
	dataJson: string | null,
): { previewColors?: string[]; previewIconUrls?: string[] } {
	if (!dataJson) return {};
	try {
		if (type === "theme") {
			const data = JSON.parse(dataJson) as CustomThemeData;
			const colors = data.dark?.colors;
			if (!colors) return {};
			return {
				previewColors: PREVIEW_COLOR_KEYS.map((k) => colors[k]).filter(
					Boolean,
				),
			};
		}
		if (type === "icon-theme") {
			const mapping = JSON.parse(dataJson) as IconMapping;
			if (!mapping.baseURL || !mapping.fileIcons) return {};
			const base = mapping.baseURL.endsWith("/")
				? mapping.baseURL
				: `${mapping.baseURL}/`;
			const urls: string[] = [];
			for (const ext of PREVIEW_ICON_EXTS) {
				if (urls.length >= 6) break;
				const def = mapping.fileIcons.find((d) =>
					d.fileExtensions?.some((fe) => fe.toLowerCase() === ext),
				);
				if (def) urls.push(`${base}${def.name}.svg`);
			}
			return urls.length > 0 ? { previewIconUrls: urls } : {};
		}
	} catch {}
	return {};
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
	dataJson?: string | null;
}): ThemeStoreListItem {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		type: row.type as CustomThemeType,
		version: row.version,
		iconUrl: row.iconUrl,
		authorName: row.authorName,
		authorAvatarUrl: row.authorAvatarUrl,
		downloads: row.downloads,
		verified: row.verified,
		featured: row.featured,
		publishedAt: row.publishedAt,
		...extractPreview(row.type, row.dataJson ?? null),
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
): ThemeStoreDetail {
	return {
		...toListItem(row),
		owner: row.owner,
		repo: row.repo,
		license: row.license,
		readmeHtml: row.readmeHtml,
		dataJson: row.dataJson,
		authorGithubId: row.authorGithubId,
		createdAt: row.publishedAt,
		updatedAt: row.updatedAt,
		installed,
	};
}

export async function publishCustomTheme(
	scan: CustomThemeScanResult,
	authorGithubId: string,
	authorName: string,
	authorAvatarUrl: string | null,
	opts?: { verified?: boolean },
): Promise<ThemeStoreDetail> {
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

	const row = await prisma.customTheme.upsert({
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

export async function listCustomThemes(opts: {
	type?: CustomThemeType;
	search?: string;
	page?: number;
	perPage?: number;
}): Promise<{ items: ThemeStoreListItem[]; total: number }> {
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
		prisma.customTheme.findMany({
			where,
			orderBy: [
				{ featured: "desc" },
				{ downloads: "desc" },
				{ publishedAt: "desc" },
			],
			skip,
			take: perPage,
		}),
		prisma.customTheme.count({ where }),
	]);

	return { items: items.map(toListItem), total };
}

export async function getCustomThemeBySlug(
	slug: string,
	userId?: string,
): Promise<ThemeStoreDetail | null> {
	const row = await prisma.customTheme.findUnique({ where: { slug } });
	if (!row) return null;

	let installed = false;
	if (userId) {
		const install = await prisma.userThemeInstall.findUnique({
			where: { userId_customThemeId: { userId, customThemeId: row.id } },
		});
		installed = !!install;
	}

	return toDetail(row, installed);
}

export async function installCustomTheme(
	userId: string,
	customThemeId: string,
): Promise<{ alreadyInstalled: boolean }> {
	const existing = await prisma.userThemeInstall.findUnique({
		where: { userId_customThemeId: { userId, customThemeId } },
	});

	if (existing) {
		return { alreadyInstalled: true };
	}

	const now = new Date().toISOString();
	await prisma.$transaction([
		prisma.userThemeInstall.create({
			data: { userId, customThemeId, installedAt: now },
		}),
		prisma.customTheme.update({
			where: { id: customThemeId },
			data: { downloads: { increment: 1 } },
		}),
	]);

	return { alreadyInstalled: false };
}

export async function uninstallCustomTheme(userId: string, customThemeId: string): Promise<void> {
	const deleted = await prisma.userThemeInstall
		.delete({
			where: { userId_customThemeId: { userId, customThemeId } },
		})
		.catch(() => null);

	if (deleted) {
		await prisma.customTheme
			.update({
				where: { id: customThemeId },
				data: { downloads: { decrement: 1 } },
			})
			.catch(() => {});
	}
}

export async function getInstalledCustomThemes(
	userId: string,
	type?: CustomThemeType,
): Promise<ThemeStoreDetail[]> {
	const where: Record<string, unknown> = { userId };
	if (type) {
		where.customTheme = { type };
	}

	const installs = await prisma.userThemeInstall.findMany({
		where,
		include: { customTheme: true },
		orderBy: { installedAt: "desc" },
	});

	return installs.map((i) => toDetail(i.customTheme, true));
}

export async function syncCustomThemeData(
	slug: string,
	dataJson: string,
	readmeHtml: string | null,
): Promise<void> {
	const now = new Date().toISOString();
	await prisma.customTheme.update({
		where: { slug },
		data: { dataJson, readmeHtml, dataCachedAt: now, updatedAt: now },
	});
}

export async function unpublishCustomTheme(slug: string, authorGithubId: string): Promise<boolean> {
	const row = await prisma.customTheme.findUnique({ where: { slug } });
	if (!row || row.authorGithubId !== authorGithubId) return false;

	await prisma.$transaction([
		prisma.userThemeInstall.deleteMany({ where: { customThemeId: row.id } }),
		prisma.customTheme.delete({ where: { id: row.id } }),
	]);
	return true;
}

export async function getCustomThemeById(id: string) {
	return prisma.customTheme.findUnique({ where: { id } });
}

export async function countCustomThemesByAuthor(authorGithubId: string): Promise<number> {
	return prisma.customTheme.count({ where: { authorGithubId } });
}

export async function customThemeExistsBySlug(slug: string): Promise<boolean> {
	const row = await prisma.customTheme.findUnique({
		where: { slug },
		select: { id: true },
	});
	return !!row;
}

export { toSlug };
