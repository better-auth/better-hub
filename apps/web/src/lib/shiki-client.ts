import type { Highlighter, BundledLanguage } from "shiki";
import { getTheme } from "./themes";
import type { ShikiTheme } from "./themes/types";

const DEFAULT_LIGHT_THEME = "vitesse-light";
const DEFAULT_DARK_THEME = "vitesse-black";
const MAX_TOKENIZE_LENGTH = 200_000;

let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

function getClientHighlighter(): Promise<Highlighter> {
	if (highlighterInstance) return Promise.resolve(highlighterInstance);
	if (!highlighterPromise) {
		highlighterPromise = import("shiki")
			.then(({ createHighlighter }) =>
				createHighlighter({
					themes: [DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME],
					langs: [],
				}),
			)
			.then((h) => {
				highlighterInstance = h;
				return h;
			});
	}
	return highlighterPromise;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

async function loadCustomSyntaxTheme(
	highlighter: Highlighter,
	theme: ShikiTheme,
	uniqueName: string,
): Promise<string> {
	const loaded = highlighter.getLoadedThemes();
	if (loaded.includes(uniqueName)) return uniqueName;

	try {
		const themeWithName = { ...theme, name: uniqueName };
		await highlighter.loadTheme(themeWithName);
		return uniqueName;
	} catch {
		return "";
	}
}

async function loadThemeWithCustomBg(
	highlighter: Highlighter,
	baseThemeId: string,
	bgColor: string,
	uniqueName: string,
): Promise<string> {
	const loaded = highlighter.getLoadedThemes();
	if (loaded.includes(uniqueName)) return uniqueName;

	try {
		if (!loaded.includes(baseThemeId)) {
			await highlighter.loadTheme(
				baseThemeId as Parameters<Highlighter["loadTheme"]>[0],
			);
		}
		const baseTheme = highlighter.getTheme(baseThemeId);
		const modifiedTheme = {
			...baseTheme,
			name: uniqueName,
			colors: {
				...baseTheme.colors,
				"editor.background": bgColor,
			},
		};
		await highlighter.loadTheme(modifiedTheme);
		return uniqueName;
	} catch {
		return baseThemeId;
	}
}

async function getThemePairForClient(
	highlighter: Highlighter,
	themeId: string,
): Promise<{ light: string; dark: string }> {
	const appTheme = getTheme(themeId);
	let light = DEFAULT_LIGHT_THEME;
	let dark = DEFAULT_DARK_THEME;

	if (appTheme) {
		if (appTheme.light.syntax) {
			const customLightName = `${appTheme.id}-syntax-light`;
			const loadedName = await loadCustomSyntaxTheme(
				highlighter,
				appTheme.light.syntax,
				customLightName,
			);
			if (loadedName) light = loadedName;
		} else {
			const codeBg = appTheme.light.colors["--code-bg"];
			if (codeBg) {
				const customName = `${appTheme.id}-light-vitesse`;
				light = await loadThemeWithCustomBg(
					highlighter,
					DEFAULT_LIGHT_THEME,
					codeBg,
					customName,
				);
			}
		}

		if (appTheme.dark.syntax) {
			const customDarkName = `${appTheme.id}-syntax-dark`;
			const loadedName = await loadCustomSyntaxTheme(
				highlighter,
				appTheme.dark.syntax,
				customDarkName,
			);
			if (loadedName) dark = loadedName;
		} else {
			const codeBg = appTheme.dark.colors["--code-bg"];
			if (codeBg) {
				const customName = `${appTheme.id}-dark-vitesse`;
				dark = await loadThemeWithCustomBg(
					highlighter,
					DEFAULT_DARK_THEME,
					codeBg,
					customName,
				);
			}
		}
	}

	return { light, dark };
}

export async function highlightCodeClient(
	code: string,
	lang: string,
	themeId: string,
): Promise<string> {
	if (code.length > MAX_TOKENIZE_LENGTH) {
		return `<pre><code>${escapeHtml(code)}</code></pre>`;
	}

	const highlighter = await getClientHighlighter();
	const themes = await getThemePairForClient(highlighter, themeId);

	const loaded = highlighter.getLoadedLanguages();
	let effectiveLang = lang || "text";

	if (!loaded.includes(effectiveLang)) {
		try {
			await highlighter.loadLanguage(effectiveLang as BundledLanguage);
		} catch {
			effectiveLang = "text";
			if (!loaded.includes("text")) {
				try {
					await highlighter.loadLanguage("text" as BundledLanguage);
				} catch {}
			}
		}
	}

	try {
		return highlighter.codeToHtml(code, {
			lang: effectiveLang,
			themes: { light: themes.light, dark: themes.dark },
			defaultColor: false,
		});
	} catch {
		return highlighter.codeToHtml(code, {
			lang: "text",
			themes: { light: themes.light, dark: themes.dark },
			defaultColor: false,
		});
	}
}
