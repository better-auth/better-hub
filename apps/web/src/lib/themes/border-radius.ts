export type BorderRadiusPreset = "none" | "small" | "medium" | "large";

export interface BorderRadiusValues {
	"--radius-sm": string;
	"--radius-md": string;
	"--radius-lg": string;
}

export const BORDER_RADIUS_PRESETS: Record<BorderRadiusPreset, BorderRadiusValues> = {
	none: {
		"--radius-sm": "0rem",
		"--radius-md": "0rem",
		"--radius-lg": "0.12rem",
	},
	small: {
		"--radius-sm": "0.125rem",
		"--radius-md": "0.25rem",
		"--radius-lg": "0.375rem",
	},
	medium: {
		"--radius-sm": "0.25rem",
		"--radius-md": "0.5rem",
		"--radius-lg": "0.75rem",
	},
	large: {
		"--radius-sm": "0.375rem",
		"--radius-md": "0.75rem",
		"--radius-lg": "1.25rem",
	},
};

export const BORDER_RADIUS_STORAGE_KEY = "border-radius";
export const DEFAULT_BORDER_RADIUS: BorderRadiusPreset = "none";

export function getBorderRadiusPreset(): BorderRadiusPreset {
	if (typeof window === "undefined") {
		return DEFAULT_BORDER_RADIUS;
	}
	const stored = localStorage.getItem(BORDER_RADIUS_STORAGE_KEY);
	if (
		stored &&
		(stored === "none" ||
			stored === "small" ||
			stored === "medium" ||
			stored === "large")
	) {
		return stored;
	}
	return DEFAULT_BORDER_RADIUS;
}

export function applyBorderRadius(preset: BorderRadiusPreset): void {
	const el = document.documentElement;
	const values = BORDER_RADIUS_PRESETS[preset];
	for (const [key, value] of Object.entries(values)) {
		el.style.setProperty(key, value);
	}
}

export function setBorderRadiusCookie(preset: BorderRadiusPreset): void {
	const maxAge = 365 * 24 * 60 * 60;
	document.cookie = `${BORDER_RADIUS_STORAGE_KEY}=${preset};path=/;max-age=${maxAge};samesite=lax`;
}
