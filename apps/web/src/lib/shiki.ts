import {
	createHighlighter,
	type Highlighter,
	type BundledLanguage,
	type BundledTheme,
} from "shiki";
import { parseDiffPatch, getLanguageFromFilename } from "./github-utils";
import { getBuiltInTheme } from "./code-themes/built-in";
import { DEFAULT_CODE_THEME_LIGHT, DEFAULT_CODE_THEME_DARK } from "./code-themes/types";

const FALLBACK_THEMES = [DEFAULT_CODE_THEME_LIGHT, DEFAULT_CODE_THEME_DARK] as const;
const FALLBACK_PAIR = { light: DEFAULT_CODE_THEME_LIGHT, dark: DEFAULT_CODE_THEME_DARK };
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
 * Read code-theme-prefs cookie from the raw Cookie header.
 * Uses dynamic import of next/headers to avoid issues in non-request contexts.
 * Returns defaults if anything goes wrong.
 */
async function readThemePrefsFromCookie(): Promise<{ light: string; dark: string }> {
	try {
		// Dynamic import + 200ms timeout to guard against hanging cookies()/headers()
		const result = await Promise.race([
			(async () => {
				const { cookies } = await import("next/headers");
				const cookieStore = await cookies();
				const raw = cookieStore.get("code-theme-prefs")?.value;
				if (!raw) return FALLBACK_PAIR;
				const parsed = JSON.parse(raw);
				return {
					light: (parsed.light as string) || FALLBACK_PAIR.light,
					dark: (parsed.dark as string) || FALLBACK_PAIR.dark,
				};
			})(),
			new Promise<{ light: string; dark: string }>((resolve) =>
				setTimeout(() => resolve(FALLBACK_PAIR), 200),
			),
		]);
		return result;
	} catch {
		return FALLBACK_PAIR;
	}
}

/**
 * Ensure a theme is loaded in the highlighter.
 * Handles built-in Shiki themes by name and custom themes from DB JSON.
 */
async function ensureThemeLoaded(highlighter: Highlighter, themeId: string): Promise<string> {
	const loaded = highlighter.getLoadedThemes();
	if (loaded.includes(themeId)) return themeId;

	// Check if it's a built-in Shiki theme
	const builtIn = getBuiltInTheme(themeId);
	if (builtIn) {
		try {
			await highlighter.loadTheme(themeId as BundledTheme);
			return themeId;
		} catch {
			// Fall through to fallback
		}
	}

	// Check if it's a custom theme from DB (lazy import to avoid bundling issues)
	try {
		const { getCustomTheme } = await import("./code-themes/store");
		const custom = await getCustomTheme(themeId);
		if (custom) {
			const themeJson = JSON.parse(custom.themeJson);
			themeJson.name = themeId;
			await highlighter.loadTheme(themeJson);
			return themeId;
		}
	} catch {
		// Fall through to fallback
	}

	return "";
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
		const prefs = await readThemePrefsFromCookie();

		const light =
			(await ensureThemeLoaded(highlighter, prefs.light)) ||
			(await ensureThemeLoaded(highlighter, DEFAULT_CODE_THEME_LIGHT)) ||
			DEFAULT_CODE_THEME_LIGHT;

		const dark =
			(await ensureThemeLoaded(highlighter, prefs.dark)) ||
			(await ensureThemeLoaded(highlighter, DEFAULT_CODE_THEME_DARK)) ||
			DEFAULT_CODE_THEME_DARK;

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
