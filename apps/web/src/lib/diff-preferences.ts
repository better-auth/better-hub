const STORAGE_KEY = "better-github-diff-preferences";

export type DiffViewMode = "tree" | "flat";
export type DiffFontSize = "sm" | "md" | "lg";

export interface DiffPreferences {
	splitView: boolean;
	wordWrap: boolean;
	defaultViewMode: DiffViewMode;
	fontSize: DiffFontSize;
	showFolderDiffCount: boolean;
}

const DEFAULT_PREFERENCES: DiffPreferences = {
	splitView: false,
	wordWrap: true,
	defaultViewMode: "tree",
	fontSize: "sm",
	showFolderDiffCount: true,
};

export function getDiffPreferences(): DiffPreferences {
	if (typeof window === "undefined") return DEFAULT_PREFERENCES;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_PREFERENCES;
		const parsed = JSON.parse(raw) as Partial<DiffPreferences>;
		return { ...DEFAULT_PREFERENCES, ...parsed };
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

export function setDiffPreferences(prefs: Partial<DiffPreferences>): DiffPreferences {
	if (typeof window === "undefined") return DEFAULT_PREFERENCES;
	try {
		const current = getDiffPreferences();
		const updated = { ...current, ...prefs };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
		return updated;
	} catch {
		return getDiffPreferences();
	}
}

export function setSplitView(splitView: boolean): void {
	setDiffPreferences({ splitView });
}

export function setWordWrap(wordWrap: boolean): void {
	setDiffPreferences({ wordWrap });
}

export function setDefaultViewMode(defaultViewMode: DiffViewMode): void {
	setDiffPreferences({ defaultViewMode });
}

export function setFontSize(fontSize: DiffFontSize): void {
	setDiffPreferences({ fontSize });
}

export function setShowFolderDiffCount(showFolderDiffCount: boolean): void {
	setDiffPreferences({ showFolderDiffCount });
}
