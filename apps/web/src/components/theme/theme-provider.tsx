"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
	applyTheme,
	getTheme,
	listThemes,
	listDarkThemes,
	listLightThemes,
	STORAGE_KEY,
	DARK_THEME_KEY,
	LIGHT_THEME_KEY,
	DARK_THEME_ID,
	LIGHT_THEME_ID,
	type ThemeDefinition,
} from "@/lib/themes";

interface ColorThemeContext {
	/** Currently active theme id */
	colorTheme: string;
	/** Set a specific theme (also updates the dark/light preference for that mode) */
	setColorTheme: (id: string) => void;
	/** Toggle between dark and light mode (switches to the preferred theme for that mode). Pass a MouseEvent for a circular reveal from the click point. */
	toggleMode: (e?: { clientX: number; clientY: number }) => void;
	/** All themes */
	themes: ThemeDefinition[];
	darkThemes: ThemeDefinition[];
	lightThemes: ThemeDefinition[];
	/** The preferred dark theme id */
	darkThemeId: string;
	/** The preferred light theme id */
	lightThemeId: string;
	mode: "dark" | "light";
}

const Ctx = createContext<ColorThemeContext | null>(null);

export function useColorTheme(): ColorThemeContext {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useColorTheme must be used within ColorThemeProvider");
	return ctx;
}

function getStored(key: string, fallback: string): string {
	if (typeof window === "undefined") return fallback;
	return localStorage.getItem(key) ?? fallback;
}

/** Pick the initial active theme: localStorage → system preference → dark fallback */
function getInitialTheme(): string {
	if (typeof window === "undefined") return DARK_THEME_ID;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && getTheme(stored)) return stored;
	const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
	const darkPref = localStorage.getItem(DARK_THEME_KEY) ?? DARK_THEME_ID;
	const lightPref = localStorage.getItem(LIGHT_THEME_KEY) ?? LIGHT_THEME_ID;
	const id = prefersDark ? darkPref : lightPref;
	localStorage.setItem(STORAGE_KEY, id);
	return id;
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
	const { setTheme } = useTheme();
	const [colorTheme, setColorThemeState] = useState(getInitialTheme);
	const [darkThemeId, setDarkThemeId] = useState(() =>
		getStored(DARK_THEME_KEY, DARK_THEME_ID),
	);
	const [lightThemeId, setLightThemeId] = useState(() =>
		getStored(LIGHT_THEME_KEY, LIGHT_THEME_ID),
	);
	const syncedFromDb = useRef(false);
	const appliedRef = useRef<string | null>(null);

	const themes = listThemes();
	const darkThemes = listDarkThemes();
	const lightThemes = listLightThemes();
	const currentTheme = getTheme(colorTheme);
	const mode = currentTheme?.mode ?? "dark";

	// Apply CSS vars + dark/light class whenever colorTheme changes
	useEffect(() => {
		if (appliedRef.current === colorTheme) return;
		appliedRef.current = colorTheme;
		applyTheme(colorTheme);
		const theme = getTheme(colorTheme);
		if (theme) setTheme(theme.mode);
	}, [colorTheme, setTheme]);

	// Mark the initial theme as already applied (FOUC script handled it)
	useEffect(() => {
		appliedRef.current = colorTheme;
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// On mount: fetch theme from DB — if it differs from localStorage, adopt it
	useEffect(() => {
		if (syncedFromDb.current) return;
		syncedFromDb.current = true;

		fetch("/api/user-settings")
			.then((r) => (r.ok ? r.json() : null))
			.then((settings) => {
				if (!settings) return;
				// Sync dark/light preferences from DB
				if (settings.darkTheme && getTheme(settings.darkTheme)) {
					localStorage.setItem(DARK_THEME_KEY, settings.darkTheme);
					setDarkThemeId(settings.darkTheme);
				}
				if (settings.lightTheme && getTheme(settings.lightTheme)) {
					localStorage.setItem(LIGHT_THEME_KEY, settings.lightTheme);
					setLightThemeId(settings.lightTheme);
				}
				// Sync active theme from DB
				if (settings.colorTheme && getTheme(settings.colorTheme)) {
					const dbTheme = settings.colorTheme;
					const local =
						localStorage.getItem(STORAGE_KEY) ?? DARK_THEME_ID;
					if (dbTheme !== local) {
						localStorage.setItem(STORAGE_KEY, dbTheme);
						setColorThemeState(dbTheme);
						appliedRef.current = null;
					}
				}
			})
			.catch(() => {});
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
						startViewTransition: (cb: () => void) => void;
					}
				).startViewTransition(fn);
			} else {
				fn();
			}
		},
		[],
	);

	const setColorTheme = useCallback(
		(id: string) => {
			const theme = getTheme(id);
			if (!theme) return;

			applyWithTransition(() => {
				// Update the mode-specific preference
				if (theme.mode === "dark") {
					localStorage.setItem(DARK_THEME_KEY, id);
					setDarkThemeId(id);
				} else {
					localStorage.setItem(LIGHT_THEME_KEY, id);
					setLightThemeId(id);
				}
				localStorage.setItem(STORAGE_KEY, id);
				appliedRef.current = null;
				setColorThemeState(id);
			});

			// Persist to DB in background
			fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ colorTheme: id }),
			}).catch(() => {});
		},
		[applyWithTransition],
	);

	const toggleMode = useCallback(
		(e?: { clientX: number; clientY: number }) => {
			const nextId = mode === "dark" ? lightThemeId : darkThemeId;
			const theme = getTheme(nextId);
			if (!theme) return;

			const coords = e ? { x: e.clientX, y: e.clientY } : undefined;

			applyWithTransition(() => {
				if (theme.mode === "dark") {
					localStorage.setItem(DARK_THEME_KEY, nextId);
					setDarkThemeId(nextId);
				} else {
					localStorage.setItem(LIGHT_THEME_KEY, nextId);
					setLightThemeId(nextId);
				}
				localStorage.setItem(STORAGE_KEY, nextId);
				appliedRef.current = null;
				setColorThemeState(nextId);
			}, coords);

			fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ colorTheme: nextId }),
			}).catch(() => {});
		},
		[mode, darkThemeId, lightThemeId, applyWithTransition],
	);

	return (
		<Ctx.Provider
			value={{
				colorTheme,
				setColorTheme,
				toggleMode,
				themes,
				darkThemes,
				lightThemes,
				darkThemeId,
				lightThemeId,
				mode,
			}}
		>
			{children}
		</Ctx.Provider>
	);
}
