import { prisma } from "./db";

export interface UserSettings {
	userId: string;
	displayName: string | null;
	theme: string;
	colorTheme: string;
	colorMode: string;
	ghostModel: string;
	useOwnApiKey: boolean;
	openrouterApiKey: string | null;
	githubPat: string | null;
	codeThemeLight: string;
	codeThemeDark: string;
	codeFont: string;
	codeFontSize: number;
	onboardingDone: boolean;
	updatedAt: string;
}

function toSettings(row: {
	userId: string;
	displayName: string | null;
	theme: string;
	colorTheme: string;
	colorMode?: string;
	ghostModel: string;
	useOwnApiKey: boolean;
	openrouterApiKey: string | null;
	githubPat: string | null;
	codeThemeLight: string;
	codeThemeDark: string;
	codeFont: string;
	codeFontSize: number;
	onboardingDone: boolean;
	updatedAt: string;
}): UserSettings {
	return {
		userId: row.userId,
		displayName: row.displayName,
		theme: row.theme,
		colorTheme: row.colorTheme,
		colorMode: row.colorMode ?? "dark",
		ghostModel: row.ghostModel,
		useOwnApiKey: row.useOwnApiKey,
		openrouterApiKey: row.openrouterApiKey,
		githubPat: row.githubPat,
		codeThemeLight: row.codeThemeLight ?? "vitesse-light",
		codeThemeDark: row.codeThemeDark ?? "vitesse-black",
		codeFont: row.codeFont ?? "default",
		codeFontSize: row.codeFontSize ?? 13,
		onboardingDone: row.onboardingDone ?? false,
		updatedAt: row.updatedAt,
	};
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
	const cached = await prisma.userSettings.findUnique({
		where: { userId },
	});

	if (cached) return toSettings(cached);

	const now = new Date().toISOString();
	const row = await prisma.userSettings.upsert({
		where: { userId },
		create: { userId, updatedAt: now },
		update: {},
	});

	return toSettings(row);
}

export async function updateUserSettings(
	userId: string,
	updates: Partial<
		Pick<
			UserSettings,
			| "displayName"
			| "theme"
			| "colorTheme"
			| "colorMode"
			| "ghostModel"
			| "useOwnApiKey"
			| "openrouterApiKey"
			| "githubPat"
			| "codeThemeLight"
			| "codeThemeDark"
			| "codeFont"
			| "codeFontSize"
			| "onboardingDone"
		>
	>,
): Promise<UserSettings> {
	const now = new Date().toISOString();

	await prisma.userSettings.upsert({
		where: { userId },
		create: { userId, updatedAt: now },
		update: {},
	});

	const data: Record<string, unknown> = { updatedAt: now };

	if (updates.displayName !== undefined) data.displayName = updates.displayName;
	if (updates.theme !== undefined) data.theme = updates.theme;
	if (updates.colorTheme !== undefined) data.colorTheme = updates.colorTheme;
	if (updates.colorMode !== undefined) data.colorMode = updates.colorMode;
	if (updates.ghostModel !== undefined) data.ghostModel = updates.ghostModel;
	if (updates.useOwnApiKey !== undefined) data.useOwnApiKey = updates.useOwnApiKey;
	if (updates.openrouterApiKey !== undefined)
		data.openrouterApiKey = updates.openrouterApiKey;
	if (updates.githubPat !== undefined) data.githubPat = updates.githubPat;
	if (updates.codeThemeLight !== undefined) data.codeThemeLight = updates.codeThemeLight;
	if (updates.codeThemeDark !== undefined) data.codeThemeDark = updates.codeThemeDark;
	if (updates.codeFont !== undefined) data.codeFont = updates.codeFont;
	if (updates.codeFontSize !== undefined) data.codeFontSize = updates.codeFontSize;
	if (updates.onboardingDone !== undefined) data.onboardingDone = updates.onboardingDone;

	const updated = await prisma.userSettings.update({
		where: { userId },
		data,
	});

	return toSettings(updated);
}

export async function deleteUserSettings(userId: string): Promise<void> {
	await prisma.userSettings.delete({ where: { userId } }).catch(() => {});
}
