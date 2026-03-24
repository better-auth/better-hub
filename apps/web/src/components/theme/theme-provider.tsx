"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
	applyTheme,
	getTheme,
	listThemes,
	listStoreThemes,
	registerStoreTheme,
	clearStoreThemes,
	migrateLegacyThemeId,
	STORAGE_KEY,
	MODE_KEY,
	DEFAULT_THEME_ID,
	DEFAULT_MODE,
	type ThemeDefinition,
} from "@/lib/themes";
import type { CustomThemeData } from "@/lib/theme-store-types";
import {
	applyBorderRadius,
	getBorderRadiusPreset,
	setBorderRadiusCookie,
	BORDER_RADIUS_STORAGE_KEY,
	DEFAULT_BORDER_RADIUS,
	type BorderRadiusPreset,
} from "@/lib/themes/border-radius";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface ColorThemeContext {
	/** Currently active theme id */
	themeId: string;
	/** Current mode (dark/light) */
	mode: "dark" | "light";
	/** Current border radius preset */
	borderRadius: BorderRadiusPreset;
	/** Set a specific theme */
	setTheme: (id: string) => void;
	/** Toggle between dark and light mode */
	toggleMode: (e?: { clientX: number; clientY: number }) => void;
	/** Set border radius preset */
	setBorderRadius: (preset: BorderRadiusPreset) => void;
	/** Built-in themes */
	themes: ThemeDefinition[];
	/** Theme Store (installed) themes */
	storeThemes: ThemeDefinition[];
}

const Ctx = createContext<ColorThemeContext | null>(null);

export function useColorTheme(): ColorThemeContext {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useColorTheme must be used within ColorThemeProvider");
	return ctx;
}

const THEME_COOKIE_KEY = "color-theme";
const MODE_COOKIE_KEY = "color-mode";
const MP_THEME_DATA_COOKIE = "mp-theme-data";
const MP_THEME_CACHE_KEY = "mp-theme-data";

function setThemeCookies(themeId: string, mode: "dark" | "light") {
	const maxAge = 365 * 24 * 60 * 60;
	document.cookie = `${THEME_COOKIE_KEY}=${encodeURIComponent(themeId)};path=/;max-age=${maxAge};samesite=lax`;
	document.cookie = `${MODE_COOKIE_KEY}=${mode};path=/;max-age=${maxAge};samesite=lax`;
}

function setMpThemeDataCookie(theme: ThemeDefinition) {
	const maxAge = 365 * 24 * 60 * 60;
	const payload = JSON.stringify({
		dark: { colors: theme.dark.colors },
		light: { colors: theme.light.colors },
	});
	document.cookie = `${MP_THEME_DATA_COOKIE}=${encodeURIComponent(payload)};path=/;max-age=${maxAge};samesite=lax`;
	localStorage.setItem(MP_THEME_CACHE_KEY, payload);
}

function clearMpThemeDataCookie() {
	document.cookie = `${MP_THEME_DATA_COOKIE}=;path=/;max-age=0`;
	localStorage.removeItem(MP_THEME_CACHE_KEY);
}

function getStoredPreferences(): { themeId: string; mode: "dark" | "light" } {
	if (typeof window === "undefined") {
		return { themeId: DEFAULT_THEME_ID, mode: DEFAULT_MODE };
	}

	const storedTheme = localStorage.getItem(STORAGE_KEY);
	const storedMode = localStorage.getItem(MODE_KEY) as "dark" | "light" | null;

	if (storedTheme && storedMode && getTheme(storedTheme)) {
		return { themeId: storedTheme, mode: storedMode };
	}

	if (storedTheme) {
		const migration = migrateLegacyThemeId(storedTheme);
		if (migration) {
			localStorage.setItem(STORAGE_KEY, migration.themeId);
			localStorage.setItem(MODE_KEY, migration.mode);
			return migration;
		}
		if (getTheme(storedTheme)) {
			const mode =
				storedMode ??
				(window.matchMedia?.("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light");
			localStorage.setItem(MODE_KEY, mode);
			return { themeId: storedTheme, mode };
		}
		// Marketplace themes aren't registered yet at initial load — preserve
		// the stored preference so the async fetch can apply it later.
		if (storedTheme.startsWith("mp:")) {
			const mode =
				storedMode ??
				(window.matchMedia?.("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light");
			return { themeId: storedTheme, mode };
		}
	}

	const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
	const mode = prefersDark ? "dark" : "light";
	localStorage.setItem(STORAGE_KEY, DEFAULT_THEME_ID);
	localStorage.setItem(MODE_KEY, mode);
	return { themeId: DEFAULT_THEME_ID, mode };
}

function parseStoreTheme(ext: {
	id: string;
	slug: string;
	name: string;
	description: string;
	dataJson: string | null;
}): ThemeDefinition | null {
	if (!ext.dataJson) return null;
	try {
		const data = JSON.parse(ext.dataJson) as CustomThemeData;
		if (!data.dark?.colors || !data.light?.colors) return null;
		return {
			id: `mp:${ext.slug}`,
			name: ext.name,
			description: ext.description,
			dark: data.dark,
			light: data.light,
		};
	} catch {
		return null;
	}
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
	const { setTheme: setNextTheme } = useTheme();
	const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);
	const [mode, setModeState] = useState<"dark" | "light">(DEFAULT_MODE);
	const [borderRadius, setBorderRadiusState] =
		useState<BorderRadiusPreset>(DEFAULT_BORDER_RADIUS);
	const [mpThemes, setMpThemes] = useState<ThemeDefinition[]>([]);
	const syncedToDb = useRef(false);
	const mpLoaded = useRef(false);
	const { subscribe } = useMutationEvents();

	const themes = listThemes();

	const fetchInstalledThemes = useCallback(() => {
		fetch("/api/theme-store/installed?type=theme")
			.then((r) => (r.ok ? r.json() : []))
			.then(
				(
					exts: Array<{
						id: string;
						slug: string;
						name: string;
						description: string;
						dataJson: string | null;
					}>,
				) => {
					clearStoreThemes();
					const parsed: ThemeDefinition[] = [];
					for (const ext of exts) {
						const td = parseStoreTheme(ext);
						if (td) {
							registerStoreTheme(td);
							parsed.push(td);
						}
					}
					setMpThemes(parsed);

					const stored = localStorage.getItem(STORAGE_KEY);
					if (
						stored &&
						stored.startsWith("mp:") &&
						getTheme(stored)
					) {
						const theme = getTheme(stored)!;
						const storedMode =
							(localStorage.getItem(MODE_KEY) as
								| "dark"
								| "light") || DEFAULT_MODE;
						setThemeIdState(stored);
						setModeState(storedMode);
						applyTheme(stored, storedMode);
						setThemeCookies(stored, storedMode);
						setMpThemeDataCookie(theme);
						setNextTheme(storedMode);
					}
				},
			)
			.catch(() => {});
	}, [setNextTheme]);

	useEffect(() => {
		if (mpLoaded.current) return;
		mpLoaded.current = true;
		fetchInstalledThemes();
	}, [fetchInstalledThemes]);

	useEffect(() => {
		return subscribe((event) => {
			if (
				(event.type === "customTheme:installed" ||
					event.type === "customTheme:uninstalled") &&
				event.themeType === "theme"
			) {
				fetchInstalledThemes();
			}
		});
	}, [subscribe, fetchInstalledThemes]);

	useEffect(() => {
		const prefs = getStoredPreferences();
		setThemeIdState(prefs.themeId);
		setModeState(prefs.mode);

		applyTheme(prefs.themeId, prefs.mode);
		setThemeCookies(prefs.themeId, prefs.mode);
		setNextTheme(prefs.mode);

		const radiusPreset = getBorderRadiusPreset();
		setBorderRadiusState(radiusPreset);
		applyBorderRadius(radiusPreset);
		setBorderRadiusCookie(radiusPreset);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		if (syncedToDb.current) return;
		syncedToDb.current = true;

		const prefs = getStoredPreferences();
		fetch("/api/user-settings", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				colorTheme: prefs.themeId,
				colorMode: prefs.mode,
			}),
		}).catch(() => {});
	}, []);

	const applyWithTransition = useCallback(
		(fn: () => void, coords?: { x: number; y: number }) => {
			if (typeof document !== "undefined" && "startViewTransition" in document) {
				if (coords) {
					document.documentElement.style.setProperty(
						"--theme-tx",
						`${coords.x}px`,
					);
					document.documentElement.style.setProperty(
						"--theme-ty",
						`${coords.y}px`,
					);
				}
				(
					document as unknown as {
						startViewTransition: (
							cb: () => void | Promise<void>,
						) => void;
					}
				).startViewTransition(fn);
			} else {
				fn();
			}
		},
		[],
	);

	const setTheme = useCallback(
		(id: string) => {
			const theme = getTheme(id);
			if (!theme) return;

			applyWithTransition(() => {
				localStorage.setItem(STORAGE_KEY, id);
				setThemeIdState(id);
				applyTheme(id, mode);
				setThemeCookies(id, mode);
				if (id.startsWith("mp:")) {
					setMpThemeDataCookie(theme);
				} else {
					clearMpThemeDataCookie();
				}
			});

			fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ colorTheme: id, colorMode: mode }),
			}).catch(() => {});
		},
		[mode, applyWithTransition],
	);

	const toggleMode = useCallback(
		(e?: { clientX: number; clientY: number }) => {
			const nextMode = mode === "dark" ? "light" : "dark";
			const coords = e ? { x: e.clientX, y: e.clientY } : undefined;

			applyWithTransition(() => {
				localStorage.setItem(MODE_KEY, nextMode);
				setModeState(nextMode);
				applyTheme(themeId, nextMode);
				setThemeCookies(themeId, nextMode);
				setNextTheme(nextMode);
			}, coords);

			fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ colorTheme: themeId, colorMode: nextMode }),
			}).catch(() => {});
		},
		[mode, themeId, applyWithTransition, setNextTheme],
	);

	const setBorderRadiusCallback = useCallback((preset: BorderRadiusPreset) => {
		localStorage.setItem(BORDER_RADIUS_STORAGE_KEY, preset);
		setBorderRadiusState(preset);
		applyBorderRadius(preset);
		setBorderRadiusCookie(preset);

		fetch("/api/user-settings", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ borderRadius: preset }),
		}).catch(() => {});
	}, []);

	return (
		<Ctx.Provider
			value={{
				themeId,
				mode,
				borderRadius,
				setTheme,
				toggleMode,
				setBorderRadius: setBorderRadiusCallback,
				themes,
				storeThemes: mpThemes,
			}}
		>
			{children}
		</Ctx.Provider>
	);
}
