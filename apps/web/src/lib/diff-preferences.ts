const STORAGE_KEY = "better-github-diff-preferences";

export interface DiffPreferences {
	splitView: boolean;
	wordWrap: boolean;
}

const DEFAULT_PREFERENCES: DiffPreferences = {
	splitView: false,
	wordWrap: true,
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
