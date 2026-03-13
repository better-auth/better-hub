"use client";

import { createContext, useCallback, useContext, useEffect, useState, useRef } from "react";
import type { IconMapping, ThemeStoreDetail } from "@/lib/theme-store-types";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

const STORAGE_KEY = "icon-theme-id";
const DEFAULT_SENTINEL = "__default__";

interface IconThemeContext {
	iconMapping: IconMapping | null;
	activeIconThemeId: string | null;
	installedIconThemes: ThemeStoreDetail[];
	setActiveIconTheme: (id: string | null) => void;
	loading: boolean;
}

const Ctx = createContext<IconThemeContext>({
	iconMapping: null,
	activeIconThemeId: null,
	installedIconThemes: [],
	setActiveIconTheme: () => {},
	loading: true,
});

export function useIconTheme() {
	return useContext(Ctx);
}

function parseMapping(dataJson: string | null): IconMapping | null {
	if (!dataJson) return null;
	try {
		const mapping = JSON.parse(dataJson) as IconMapping;
		return mapping.baseURL ? mapping : null;
	} catch {
		return null;
	}
}

export function IconThemeProvider({ children }: { children: React.ReactNode }) {
	const [installedIconThemes, setInstalledIconThemes] = useState<ThemeStoreDetail[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [iconMapping, setIconMapping] = useState<IconMapping | null>(null);
	const [loading, setLoading] = useState(true);
	const loaded = useRef(false);
	const { subscribe } = useMutationEvents();

	const fetchInstalledIconThemes = useCallback(() => {
		const storedId =
			typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

		fetch("/api/theme-store/installed?type=icon-theme")
			.then((r) => (r.ok ? r.json() : []))
			.then((exts: ThemeStoreDetail[]) => {
				setInstalledIconThemes(exts);

				if (storedId === DEFAULT_SENTINEL) {
					setActiveId(null);
					setIconMapping(null);
					return;
				}

				if (storedId) {
					const match = exts.find((e) => e.id === storedId);
					if (match) {
						setActiveId(storedId);
						setIconMapping(parseMapping(match.dataJson));
						return;
					}
				}

				if (exts.length > 0) {
					setActiveId(exts[0].id);
					setIconMapping(parseMapping(exts[0].dataJson));
					localStorage.setItem(STORAGE_KEY, exts[0].id);
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		if (loaded.current) return;
		loaded.current = true;
		fetchInstalledIconThemes();
	}, [fetchInstalledIconThemes]);

	useEffect(() => {
		return subscribe((event) => {
			if (
				(event.type === "customTheme:installed" ||
					event.type === "customTheme:uninstalled") &&
				event.themeType === "icon-theme"
			) {
				fetchInstalledIconThemes();
			}
		});
	}, [subscribe, fetchInstalledIconThemes]);

	const setActiveIconTheme = useCallback(
		(id: string | null) => {
			setActiveId(id);

			if (id === null) {
				setIconMapping(null);
				localStorage.setItem(STORAGE_KEY, DEFAULT_SENTINEL);
				return;
			}

			const match = installedIconThemes.find((e) => e.id === id);
			if (match) {
				setIconMapping(parseMapping(match.dataJson));
				localStorage.setItem(STORAGE_KEY, id);
			}
		},
		[installedIconThemes],
	);

	return (
		<Ctx.Provider
			value={{
				iconMapping,
				activeIconThemeId: activeId,
				installedIconThemes,
				setActiveIconTheme,
				loading,
			}}
		>
			{children}
		</Ctx.Provider>
	);
}
