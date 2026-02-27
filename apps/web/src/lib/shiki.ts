import {
	createHighlighter,
	type Highlighter,
	type BundledLanguage,
	type BundledTheme,
} from "shiki";
import { parseDiffPatch, getLanguageFromFilename } from "./github-utils";
import { getTheme, getThemeVariant } from "./themes";
import type { ShikiTheme, ThemeVariant } from "./themes/types";

const DEFAULT_LIGHT_THEME = "vitesse-light";
const DEFAULT_DARK_THEME = "vitesse-black";
const FALLBACK_THEMES = [DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME] as const;
const FALLBACK_PAIR = { light: DEFAULT_LIGHT_THEME, dark: DEFAULT_DARK_THEME };
const MAX_TOKENIZE_LENGTH = 200_000; // Skip tokenization for very large inputs to avoid WASM OOM

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: [...FALLBACK_THEMES],
			langs: [],
		});
	}
	return highlighterPromise;
}

/**
 * Read theme preferences from cookies.
 * Uses dynamic import of next/headers to avoid issues in non-request contexts.
 */
async function readThemePrefsFromCookie(): Promise<{
	themeId: string | null;
	mode: "dark" | "light";
}> {
	try {
		const result = await Promise.race([
			(async () => {
				const { cookies } = await import("next/headers");
				const cookieStore = await cookies();
				const themeId = cookieStore.get("color-theme")?.value ?? null;
				const mode =
					(cookieStore.get("color-mode")?.value as
						| "dark"
						| "light") ?? "dark";
				return { themeId, mode };
			})(),
			new Promise<{ themeId: string | null; mode: "dark" | "light" }>((resolve) =>
				setTimeout(() => resolve({ themeId: null, mode: "dark" }), 200),
			),
		]);
		return result;
	} catch {
		return { themeId: null, mode: "dark" };
	}
}

/**
 * Ensure a built-in Shiki theme is loaded.
 */
async function ensureBuiltInThemeLoaded(
	highlighter: Highlighter,
	themeId: string,
): Promise<string> {
	const loaded = highlighter.getLoadedThemes();
	if (loaded.includes(themeId)) return themeId;

	try {
		await highlighter.loadTheme(themeId as BundledTheme);
		return themeId;
	} catch {
		return "";
	}
}

/**
 * Load a built-in theme with a custom background color.
 * Returns a unique theme name that can be used for highlighting.
 */
async function loadThemeWithCustomBg(
	highlighter: Highlighter,
	baseThemeId: string,
	bgColor: string,
	uniqueName: string,
): Promise<string> {
	const loaded = highlighter.getLoadedThemes();
	if (loaded.includes(uniqueName)) return uniqueName;

	try {
		// Ensure base theme is loaded first
		await ensureBuiltInThemeLoaded(highlighter, baseThemeId);

		// Get the theme object and modify its background
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
		// Fall back to the original theme
		return baseThemeId;
	}
}

/**
 * Load a custom ShikiTheme object into the highlighter.
 */
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

// Cache theme pair per-request to avoid redundant cookie reads + theme loads
let _themePairPromise: Promise<{ light: string; dark: string }> | null = null;
let _themePairExpiry = 0;

/**
 * Get the user's theme pair, ensuring both are loaded.
 * Cached for 1s to deduplicate concurrent calls within the same render.
 */
async function getThemePair(highlighter: Highlighter): Promise<{ light: string; dark: string }> {
	const now = Date.now();
	if (_themePairPromise && now < _themePairExpiry) return _themePairPromise;

	_themePairPromise = resolveThemePair(highlighter);
	_themePairExpiry = now + 1000;
	return _themePairPromise;
}

async function resolveThemePair(
	highlighter: Highlighter,
): Promise<{ light: string; dark: string }> {
	try {
		const { themeId } = await readThemePrefsFromCookie();
		const appTheme = themeId ? getTheme(themeId) : null;

		let light = DEFAULT_LIGHT_THEME;
		let dark = DEFAULT_DARK_THEME;

		if (appTheme) {
			// Load light variant's syntax theme
			if (appTheme.light.syntax) {
				const customLightName = `${appTheme.id}-syntax-light`;
				const loadedName = await loadCustomSyntaxTheme(
					highlighter,
					appTheme.light.syntax,
					customLightName,
				);
				if (loadedName) light = loadedName;
			} else {
				// No custom syntax - use vitesse but with the theme's code-bg
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

			// Load dark variant's syntax theme
			if (appTheme.dark.syntax) {
				const customDarkName = `${appTheme.id}-syntax-dark`;
				const loadedName = await loadCustomSyntaxTheme(
					highlighter,
					appTheme.dark.syntax,
					customDarkName,
				);
				if (loadedName) dark = loadedName;
			} else {
				// No custom syntax - use vitesse but with the theme's code-bg
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

		// Ensure fallback themes are loaded
		if (light === DEFAULT_LIGHT_THEME) {
			await ensureBuiltInThemeLoaded(highlighter, DEFAULT_LIGHT_THEME);
		}
		if (dark === DEFAULT_DARK_THEME) {
			await ensureBuiltInThemeLoaded(highlighter, DEFAULT_DARK_THEME);
		}

		return { light, dark };
	} catch {
		return FALLBACK_PAIR;
	}
}

export async function highlightCode(code: string, lang: string): Promise<string> {
	if (code.length > MAX_TOKENIZE_LENGTH) return `<pre><code>${escapeHtml(code)}</code></pre>`;
	const highlighter = await getHighlighter();
	const themes = await getThemePair(highlighter);

	// Lazy-load the language if not already loaded
	const loaded = highlighter.getLoadedLanguages();
	const target = lang || "text";
	if (!loaded.includes(target)) {
		try {
			await highlighter.loadLanguage(target as BundledLanguage);
		} catch {
			// Fall back to text if language isn't supported
			if (!loaded.includes("text")) {
				await highlighter.loadLanguage("text" as BundledLanguage);
			}
			return highlighter.codeToHtml(code, {
				lang: "text",
				themes: { light: themes.light, dark: themes.dark },
				defaultColor: false,
			});
		}
	}

	try {
		return highlighter.codeToHtml(code, {
			lang: target,
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

export interface SyntaxToken {
	text: string;
	lightColor: string;
	darkColor: string;
}

async function loadLang(lang: string): Promise<string> {
	const highlighter = await getHighlighter();
	const loaded = highlighter.getLoadedLanguages();
	if (loaded.includes(lang)) return lang;
	try {
		await highlighter.loadLanguage(lang as BundledLanguage);
		return lang;
	} catch {
		if (!loaded.includes("text")) {
			try {
				await highlighter.loadLanguage("text" as BundledLanguage);
			} catch {}
		}
		return "text";
	}
}

/**
 * Tokenize an entire file for full-file view syntax highlighting.
 * Returns an array of SyntaxToken[] per line (0-indexed: result[0] = line 1).
 */
export async function highlightFullFile(code: string, filename: string): Promise<SyntaxToken[][]> {
	if (!code || code.length > MAX_TOKENIZE_LENGTH) return [];

	const lang = getLanguageFromFilename(filename);
	const effectiveLang = await loadLang(lang);
	const highlighter = await getHighlighter();
	const themes = await getThemePair(highlighter);

	try {
		const tokenResult = highlighter.codeToTokens(code, {
			lang: effectiveLang as BundledLanguage,
			themes: { light: themes.light, dark: themes.dark },
		});

		return tokenResult.tokens.map((lineTokens) =>
			lineTokens.map((t) => ({
				text: t.content,
				lightColor: t.htmlStyle?.color || "",
				darkColor: t.htmlStyle?.["--shiki-dark"] || "",
			})),
		);
	} catch {
		return [];
	}
}

export async function highlightDiffLines(
	patch: string,
	filename: string,
): Promise<Record<string, SyntaxToken[]>> {
	if (!patch) return {};

	const lang = getLanguageFromFilename(filename);
	const diffLines = parseDiffPatch(patch);
	const effectiveLang = await loadLang(lang);
	const highlighter = await getHighlighter();
	const themes = await getThemePair(highlighter);

	// Build old (remove+context) and new (add+context) code streams
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
		if (code.length > MAX_TOKENIZE_LENGTH) return;
		try {
			const tokenResult = highlighter.codeToTokens(code, {
				lang: effectiveLang as BundledLanguage,
				themes: { light: themes.light, dark: themes.dark },
			});
			tokenResult.tokens.forEach((lineTokens, i) => {
				if (i < stream.length) {
					result[stream[i].key] = lineTokens.map((t) => ({
						text: t.content,
						lightColor: t.htmlStyle?.color || "",
						darkColor: t.htmlStyle?.["--shiki-dark"] || "",
					}));
				}
			});
		} catch {
			// WASM memory error — skip highlighting for this stream
		}
	};

	tokenizeStream(oldStream);
	tokenizeStream(newStream);

	return result;
}
