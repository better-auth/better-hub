import type { ThemeColors, ThemeDefinition, ThemeVariant, ShikiTheme } from "./types";
import {
	arctic,
	bitmap,
	breeze,
	browserbase,
	candy,
	cloudflare,
	crimson,
	elevenlabs,
	ember,
	falcon,
	firecrawl,
	forest,
	gemini,
	hub,
	ice,
	meadow,
	midnight,
	mintlify,
	mono,
	noir,
	nordWave,
	nuxt,
	openai,
	prisma,
	rabbit,
	raindrop,
	resend,
	sand,
	stripe,
	supabase,
	sunset,
	tailwind,
	triggerdev,
	vercel,
	zinc,
	LEGACY_THEME_MAP,
} from "./themes";

const themes: ThemeDefinition[] = [
	hub,
	ember,
	zinc,
	arctic,
	nordWave,
	vercel,
	rabbit,
	supabase,
	tailwind,
	openai,
	mintlify,
	prisma,
	elevenlabs,
	resend,
	triggerdev,
	nuxt,
	browserbase,
	cloudflare,
	gemini,
	stripe,
	bitmap,
	noir,
	ice,
	sand,
	forest,
	mono,
	breeze,
	candy,
	crimson,
	falcon,
	meadow,
	midnight,
	raindrop,
	sunset,
	firecrawl,
];

export type { ThemeColors, ThemeDefinition, ThemeVariant, ShikiTheme };

export const STORAGE_KEY = "color-theme";
export const MODE_KEY = "color-mode";
export const DEFAULT_THEME_ID = "hub";
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

	const hubDark = hub.dark;
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
