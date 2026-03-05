"use client";

import { useEffect, useRef } from "react";
import { useColorTheme } from "./theme-provider";

/**
 * Syncs the selected color theme to the server (fire-and-forget).
 * Renders nothing — just a side-effect component.
 */
export function ThemeSync() {
	const { themeId, mode } = useColorTheme();
	const prevThemeRef = useRef(themeId);
	const prevModeRef = useRef(mode);

	useEffect(() => {
		if (themeId === prevThemeRef.current && mode === prevModeRef.current) return;
		prevThemeRef.current = themeId;
		prevModeRef.current = mode;

		fetch("/api/user-settings", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ colorTheme: themeId, colorMode: mode }),
		}).catch(() => {});
	}, [themeId, mode]);

	return null;
}
