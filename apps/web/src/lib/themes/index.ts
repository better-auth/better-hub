import type { ThemeColors, ThemeDefinition } from "./types";
import { midnight, hubLight, hubDark, ember, arctic, nordWave, dawn, vesper } from "./themes";

export type { ThemeColors, ThemeDefinition };

export const STORAGE_KEY = "color-theme";
export const DARK_THEME_KEY = "dark-theme";
export const LIGHT_THEME_KEY = "light-theme";
export const DEFAULT_THEME_ID = "midnight";
export const DARK_THEME_ID = "midnight";
export const LIGHT_THEME_ID = "hub-light";

const themes: ThemeDefinition[] = [midnight, hubDark, hubLight, ember, arctic, nordWave, dawn, vesper];

const themeMap = new Map(themes.map((t) => [t.id, t]));

export function listThemes(): ThemeDefinition[] {
	return themes;
}

export function listDarkThemes(): ThemeDefinition[] {
	return themes.filter((t) => t.mode === "dark");
}

export function listLightThemes(): ThemeDefinition[] {
	return themes.filter((t) => t.mode === "light");
}

export function getTheme(id: string): ThemeDefinition | undefined {
	return themeMap.get(id);
}

/**
 * Apply a theme by setting CSS custom properties on documentElement.
 * Also syncs the dark/light class to match the theme's mode.
 */
export function applyTheme(themeId: string): void {
	const el = document.documentElement;
	const theme = getTheme(themeId);

	// Get all CSS var keys from the midnight theme as reference
	const allKeys = Object.keys(midnight.colors) as (keyof ThemeColors)[];

	if (!theme || themeId === DEFAULT_THEME_ID) {
		// Remove all inline overrides — let globals.css take over
		for (const key of allKeys) {
			el.style.removeProperty(key);
		}
		// Still sync the dark/light class for midnight
		el.classList.add("dark");
		el.classList.remove("light");
		el.style.colorScheme = "dark";
		return;
	}

	for (const key of allKeys) {
		el.style.setProperty(key, theme.colors[key]);
	}

	// Sync the dark/light class immediately alongside CSS vars
	if (theme.mode === "dark") {
		el.classList.add("dark");
		el.classList.remove("light");
		el.style.colorScheme = "dark";
	} else {
		el.classList.remove("dark");
		el.classList.add("light");
		el.style.colorScheme = "light";
	}
}
