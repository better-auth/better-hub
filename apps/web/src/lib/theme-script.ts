import type { ThemeDefinition } from "./themes/types";

interface ThemeScriptData {
	dark: { colors: Record<string, string> };
	light: { colors: Record<string, string> };
}

/**
 * Generate an inline script that applies the saved color theme before first paint.
 * Reads theme ID and mode from localStorage, then applies the correct variant's colors.
 */
export function generateThemeScript(themes: ThemeDefinition[]): string {
	const data: Record<string, ThemeScriptData> = {};
	for (const t of themes) {
		data[t.id] = {
			dark: { colors: { ...t.dark.colors } },
			light: { colors: { ...t.light.colors } },
		};
	}

	const legacyMap: Record<string, { themeId: string; mode: string }> = {
		midnight: { themeId: "better-auth", mode: "dark" },
		"hub-light": { themeId: "better-auth", mode: "light" },
		"hub-dark": { themeId: "zinc", mode: "dark" },
		dawn: { themeId: "ember", mode: "light" },
	};

	return `(function(){try{var d=document.documentElement;var themes=${JSON.stringify(data)};var legacy=${JSON.stringify(legacyMap)};var id=localStorage.getItem("color-theme");var mode=localStorage.getItem("color-mode");if(id&&legacy[id]){var m=legacy[id];id=m.themeId;mode=m.mode;localStorage.setItem("color-theme",id);localStorage.setItem("color-mode",mode)}if(!id)id="hub";if(!mode){var prefersDark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;mode=prefersDark?"dark":"light";localStorage.setItem("color-mode",mode)}var t=themes[id];if(!t)t=themes["hub"];if(!t)return;var v=t[mode];if(!v)v=t.dark;if(mode==="dark"){d.classList.add("dark");d.classList.remove("light");d.style.colorScheme="dark"}else{d.classList.remove("dark");d.classList.add("light");d.style.colorScheme="light"}localStorage.setItem("theme",mode);if(!(id==="hub"&&mode==="dark")){for(var k in v.colors){d.style.setProperty(k,v.colors[k])}}}catch(e){}})()`;
}
