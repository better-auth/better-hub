import type { Highlighter, BundledLanguage } from "shiki";
import { getTheme } from "./themes";
import type { ShikiTheme } from "./themes/types";
import { parseDiffPatch, getLanguageFromFilename } from "./github-utils";
import type { SyntaxToken } from "./shiki";

const DEFAULT_LIGHT_THEME = "vitesse-light";
const DEFAULT_DARK_THEME = "vitesse-black";
const MAX_TOKENIZE_LENGTH = 200_000;

let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;
const langLoadPromises = new Map<string, Promise<void>>();

function getClientHighlighter(): Promise<Highlighter> {
	if (highlighterInstance) return Promise.resolve(highlighterInstance);
	if (!highlighterPromise) {
		highlighterPromise = import("shiki")
			.then(({ createHighlighter, createJavaScriptRegexEngine }) =>
				createHighlighter({
					themes: [DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME],
					langs: [],
					engine: createJavaScriptRegexEngine(),
				}),
			)
			.then((h) => {
				highlighterInstance = h;
				return h;
			});
	}
	return highlighterPromise;
}

async function ensureLanguageLoaded(highlighter: Highlighter, lang: string): Promise<string> {
	const loaded = highlighter.getLoadedLanguages();
	if (loaded.includes(lang)) return lang;

	let pending = langLoadPromises.get(lang);
	if (!pending) {
		pending = highlighter
			.loadLanguage(lang as BundledLanguage)
			.then(() => {
				langLoadPromises.delete(lang);
			})
			.catch(() => {
				langLoadPromises.delete(lang);
				throw new Error(`Failed to load language: ${lang}`);
			});
		langLoadPromises.set(lang, pending);
	}
	try {
		await pending;
		return lang;
	} catch {
		if (lang === "text") return "text";
		return ensureLanguageLoaded(highlighter, "text");
	}
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

	const effectiveLang = await ensureLanguageLoaded(highlighter, lang || "text");

	try {
		return highlighter.codeToHtml(code, {
			lang: effectiveLang,
			themes: { light: themes.light, dark: themes.dark },
			defaultColor: "light-dark()",
		});
	} catch {
		return highlighter.codeToHtml(code, {
			lang: "text",
			themes: { light: themes.light, dark: themes.dark },
			defaultColor: "light-dark()",
		});
	}
}

export async function highlightDiffLinesClient(
	patch: string,
	filename: string,
	themeId = "default",
): Promise<Record<string, SyntaxToken[]>> {
	if (!patch || patch.length > MAX_TOKENIZE_LENGTH) return {};

	const lang = getLanguageFromFilename(filename);
	const diffLines = parseDiffPatch(patch);
	const highlighter = await getClientHighlighter();
	const effectiveLang = await ensureLanguageLoaded(highlighter, lang || "text");
	const themes = await getThemePairForClient(highlighter, themeId);

	const oldStream: { key: string; content: string }[] = [];
	const newStream: { key: string; content: string }[] = [];

	for (const line of diffLines) {
		if (line.type === "header") continue;
		if (line.type === "context") {
			oldStream.push({
				key: `C-old-${line.oldLineNumber}`,
				content: line.content,
			});
			newStream.push({ key: `C-${line.newLineNumber}`, content: line.content });
		} else if (line.type === "remove" && line.oldLineNumber !== undefined) {
			oldStream.push({ key: `R-${line.oldLineNumber}`, content: line.content });
		} else if (line.type === "add" && line.newLineNumber !== undefined) {
			newStream.push({ key: `A-${line.newLineNumber}`, content: line.content });
		}
	}

	const result: Record<string, SyntaxToken[]> = {};

	const tokenizeStream = (stream: { key: string; content: string }[]) => {
		if (stream.length === 0) return;
		const code = stream.map((l) => l.content).join("\n");
		try {
			const tokenResult = highlighter.codeToTokens(code, {
				lang: effectiveLang as BundledLanguage,
				themes: { light: themes.light, dark: themes.dark },
			});
			tokenResult.tokens.forEach((lineTokens, i) => {
				if (i < stream.length) {
					result[stream[i].key] = lineTokens.map((t) => ({
						text: t.content,
						lightColor:
							(t.htmlStyle as Record<string, string>)
								?.color || "",
						darkColor:
							(t.htmlStyle as Record<string, string>)?.[
								"--shiki-dark"
							] || "",
					}));
				}
			});
		} catch {
			// tokenization failed; skip
		}
	};

	tokenizeStream(oldStream);
	tokenizeStream(newStream);

	return result;
}
