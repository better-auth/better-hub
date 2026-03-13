import type { ThemeDefinition } from "./themes/types";

interface ThemeScriptData {
	dark: { colors: Record<string, string> };
	light: { colors: Record<string, string> };
}

/**
 * Generate an inline script that applies the saved color theme before first paint.
 * Reads theme ID and mode from localStorage, then applies the correct variant's colors.
 * For marketplace (mp:) themes, reads cached color data from localStorage.
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

	return [
		"(function(){try{",
		`var d=document.documentElement;`,
		`var themes=${JSON.stringify(data)};`,
		`var legacy=${JSON.stringify(legacyMap)};`,
		`var id=localStorage.getItem("color-theme");`,
		`var mode=localStorage.getItem("color-mode");`,
		// Legacy migration
		`if(id&&legacy[id]){var m=legacy[id];id=m.themeId;mode=m.mode;localStorage.setItem("color-theme",id);localStorage.setItem("color-mode",mode)}`,
		`if(!id)id="hub";`,
		`if(!mode){var prefersDark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;mode=prefersDark?"dark":"light";localStorage.setItem("color-mode",mode)}`,
		// Resolve theme data — for mp: themes, read the cached color data from localStorage
		`var t=themes[id];`,
		`if(!t&&id.indexOf("mp:")===0){try{var raw=localStorage.getItem("mp-theme-data");if(raw)t=JSON.parse(raw)}catch(e){}}`,
		`if(!t)t=themes["hub"];`,
		`if(!t)return;`,
		// Apply mode class & color scheme
		`var v=t[mode];if(!v)v=t.dark;`,
		`if(mode==="dark"){d.classList.add("dark");d.classList.remove("light");d.style.colorScheme="dark"}`,
		`else{d.classList.remove("dark");d.classList.add("light");d.style.colorScheme="light"}`,
		`localStorage.setItem("theme",mode);`,
		// Apply CSS variables (skip for default dark to use stylesheet defaults)
		`var hslRe=/^\\d+(\\.\\d+)?\\s+\\d+(\\.\\d+)?%\\s+\\d+(\\.\\d+)?%/;`,
		`if(!(id==="hub"&&mode==="dark")){for(var k in v.colors){var cv=v.colors[k];d.style.setProperty(k,hslRe.test(cv)?"hsl("+cv+")":cv)}}`,
		"}catch(e){}})()",
	].join("");
}
