import type { ThemeDefinition } from "./themes/types";

/**
 * Generate an inline script that applies the saved color theme before first paint.
 * If no theme is saved, detects system preference (dark/light) and picks the
 * user's preferred theme for that mode. Sets both CSS variables and the dark/light class.
 */
export function generateThemeScript(themes: ThemeDefinition[]): string {
	// Serialize: id → { mode, colors }
	const data: Record<string, { mode: string; colors: Record<string, string> }> = {};
	for (const t of themes) {
		data[t.id] = { mode: t.mode, colors: { ...t.colors } };
	}

	return `(function(){try{var d=document.documentElement;var id=localStorage.getItem("color-theme");if(!id){var prefersDark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var dk=localStorage.getItem("dark-theme")||"midnight";var lt=localStorage.getItem("light-theme")||"hub-light";id=prefersDark?dk:lt;localStorage.setItem("color-theme",id)}var themes=${JSON.stringify(data)};var t=themes[id];if(!t)t=themes["midnight"];if(!t)return;if(t.mode==="dark"){d.classList.add("dark");d.classList.remove("light");d.style.colorScheme="dark"}else{d.classList.remove("dark");d.classList.add("light");d.style.colorScheme="light"}localStorage.setItem("theme",t.mode);if(id!=="midnight"){for(var k in t.colors){d.style.setProperty(k,t.colors[k])}}}catch(e){}})()`;
}
