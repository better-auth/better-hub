import type { ThemeColors, ThemeDefinition, ThemeVariant, ShikiTheme } from "./types";
import {
	arctic,
	cloudflare,
	ember,
	forest,
	betterAuthTheme,
	mintlify,
	noir,
	nordWave,
	rabbit,
	stripe,
	supabase,
	tailwind,
	vercel,
	vesper,
	zinc,
	LEGACY_THEME_MAP,
} from "./themes";

const themes: ThemeDefinition[] = [
	betterAuthTheme,
	vercel,
	cloudflare,
	supabase,
	tailwind,
	mintlify,
	stripe,
	vesper,
	ember,
	zinc,
	arctic,
	nordWave,
	rabbit,
	noir,
	forest,
];

export type { ThemeColors, ThemeDefinition, ThemeVariant, ShikiTheme };

export const STORAGE_KEY = "color-theme";
export const MODE_KEY = "color-mode";
export const DEFAULT_THEME_ID = "better-auth";
export const DEFAULT_MODE: "dark" | "light" = "dark";

const themeMap = new Map(themes.map((t) => [t.id, t]));

export function listThemes(): ThemeDefinition[] {
	return themes;
}

export function getTheme(id: string): ThemeDefinition | undefined {
	return themeMap.get(id);
}

export function getThemeVariant(id: string, mode: "dark" | "light"): ThemeVariant | undefined {
	const theme = themeMap.get(id);
	return theme?.[mode];
}

export function migrateLegacyThemeId(
	legacyId: string,
): { themeId: string; mode: "dark" | "light" } | undefined {
	return LEGACY_THEME_MAP[legacyId];
}

export function applyTheme(themeId: string, mode: "dark" | "light"): void {
	const el = document.documentElement;
	const theme = getTheme(themeId);
	const variant = theme?.[mode];

	const hubDark = betterAuthTheme.dark;
	const allKeys = Object.keys(hubDark.colors) as (keyof ThemeColors)[];

	if (!variant || (themeId === DEFAULT_THEME_ID && mode === DEFAULT_MODE)) {
		for (const key of allKeys) {
			el.style.removeProperty(key);
		}
		el.classList.add("dark");
		el.classList.remove("light");
		el.style.colorScheme = "dark";
		return;
	}

	for (const key of allKeys) {
		el.style.setProperty(key, variant.colors[key]);
	}

	if (mode === "dark") {
		el.classList.add("dark");
		el.classList.remove("light");
		el.style.colorScheme = "dark";
	} else {
		el.classList.remove("dark");
		el.classList.add("light");
		el.style.colorScheme = "light";
	}
}
