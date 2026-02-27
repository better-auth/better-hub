"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
	applyTheme,
	getTheme,
	listThemes,
	migrateLegacyThemeId,
	STORAGE_KEY,
	MODE_KEY,
	DEFAULT_THEME_ID,
	DEFAULT_MODE,
	type ThemeDefinition,
} from "@/lib/themes";

interface ColorThemeContext {
	/** Currently active theme id */
	themeId: string;
	/** Current mode (dark/light) */
	mode: "dark" | "light";
	/** Set a specific theme */
	setTheme: (id: string) => void;
	/** Toggle between dark and light mode */
	toggleMode: (e?: { clientX: number; clientY: number }) => void;
	/** All themes */
	themes: ThemeDefinition[];
}

const Ctx = createContext<ColorThemeContext | null>(null);

export function useColorTheme(): ColorThemeContext {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useColorTheme must be used within ColorThemeProvider");
	return ctx;
}

const THEME_COOKIE_KEY = "color-theme";
const MODE_COOKIE_KEY = "color-mode";

function setThemeCookies(themeId: string, mode: "dark" | "light") {
	const maxAge = 365 * 24 * 60 * 60;
	document.cookie = `${THEME_COOKIE_KEY}=${encodeURIComponent(themeId)};path=/;max-age=${maxAge};samesite=lax`;
	document.cookie = `${MODE_COOKIE_KEY}=${mode};path=/;max-age=${maxAge};samesite=lax`;
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
	}

	const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
	const mode = prefersDark ? "dark" : "light";
	localStorage.setItem(STORAGE_KEY, DEFAULT_THEME_ID);
	localStorage.setItem(MODE_KEY, mode);
	return { themeId: DEFAULT_THEME_ID, mode };
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
	const { setTheme: setNextTheme } = useTheme();
	const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);
	const [mode, setModeState] = useState<"dark" | "light">(DEFAULT_MODE);
	const syncedToDb = useRef(false);

	const themes = listThemes();

	useEffect(() => {
		const prefs = getStoredPreferences();
		setThemeIdState(prefs.themeId);
		setModeState(prefs.mode);

		applyTheme(prefs.themeId, prefs.mode);
		setThemeCookies(prefs.themeId, prefs.mode);
		setNextTheme(prefs.mode);
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

	return (
		<Ctx.Provider
			value={{
				themeId,
				mode,
				setTheme,
				toggleMode,
				themes,
			}}
		>
			{children}
		</Ctx.Provider>
	);
}
