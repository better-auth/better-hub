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

const COOKIE_KEY = "color-theme";

function setThemeCookie(themeId: string) {
	document.cookie = `${COOKIE_KEY}=${encodeURIComponent(themeId)};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
}

/** Pick the initial active theme from localStorage (client-side only) */
function getStoredTheme(): string {
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
	// SSR-safe defaults, will sync from localStorage on mount
	const [colorTheme, setColorThemeState] = useState(DARK_THEME_ID);
	const [darkThemeId, setDarkThemeId] = useState(DARK_THEME_ID);
	const [lightThemeId, setLightThemeId] = useState(LIGHT_THEME_ID);
	const syncedFromDb = useRef(false);

	const themes = listThemes();
	const darkThemes = listDarkThemes();
	const lightThemes = listLightThemes();
	const currentTheme = getTheme(colorTheme);
	const mode = currentTheme?.mode ?? "dark";

	// On mount: sync state from localStorage and apply theme
	useEffect(() => {
		const storedTheme = getStoredTheme();
		const storedDark = localStorage.getItem(DARK_THEME_KEY) ?? DARK_THEME_ID;
		const storedLight = localStorage.getItem(LIGHT_THEME_KEY) ?? LIGHT_THEME_ID;

		setDarkThemeId(storedDark);
		setLightThemeId(storedLight);
		setColorThemeState(storedTheme);

		// Apply theme immediately
		applyTheme(storedTheme);
		setThemeCookie(storedTheme);
		const theme = getTheme(storedTheme);
		if (theme) setTheme(theme.mode);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// On mount: sync current theme TO database (localStorage is source of truth)
	useEffect(() => {
		if (syncedFromDb.current) return;
		syncedFromDb.current = true;

		// Push current localStorage theme to DB to ensure consistency
		const currentThemeId = localStorage.getItem(STORAGE_KEY);
		const currentDark = localStorage.getItem(DARK_THEME_KEY);
		const currentLight = localStorage.getItem(LIGHT_THEME_KEY);

		if (currentThemeId) {
			fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					colorTheme: currentThemeId,
					...(currentDark && { darkTheme: currentDark }),
					...(currentLight && { lightTheme: currentLight }),
				}),
			}).catch(() => {});
		}
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
				setColorThemeState(id);
				applyTheme(id);
				setThemeCookie(id);
				setTheme(theme.mode);
			});

			// Persist to DB in background
			fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					colorTheme: id,
					...(theme.mode === "dark"
						? { darkTheme: id }
						: { lightTheme: id }),
				}),
			}).catch(() => {});
		},
		[applyWithTransition, setTheme],
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
				setColorThemeState(nextId);
				applyTheme(nextId);
				setThemeCookie(nextId);
				setTheme(theme.mode);
			}, coords);

			fetch("/api/user-settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					colorTheme: nextId,
					...(theme.mode === "dark"
						? { darkTheme: nextId }
						: { lightTheme: nextId }),
				}),
			}).catch(() => {});
		},
		[mode, darkThemeId, lightThemeId, applyWithTransition, setTheme],
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
