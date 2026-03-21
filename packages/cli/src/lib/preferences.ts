import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Preferences {
	showRecentCommits: boolean;
}

const DEFAULTS: Preferences = {
	showRecentCommits: true,
};

const PREFS_DIR = join(homedir(), ".better-hub");
const PREFS_FILE = join(PREFS_DIR, "preferences.json");

function ensurePrefsDir() {
	if (!existsSync(PREFS_DIR)) {
		mkdirSync(PREFS_DIR, { recursive: true });
	}
}

export function getPreferences(): Preferences {
	ensurePrefsDir();
	if (!existsSync(PREFS_FILE)) {
		return { ...DEFAULTS };
	}
	try {
		const raw = readFileSync(PREFS_FILE, "utf-8");
		return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {
		return { ...DEFAULTS };
	}
}

export function getPreference<K extends keyof Preferences>(key: K): Preferences[K] {
	return getPreferences()[key];
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
	const prefs = getPreferences();
	prefs[key] = value;
	ensurePrefsDir();
	writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2) + "\n");
}

export function resetPreferences(): void {
	ensurePrefsDir();
	writeFileSync(PREFS_FILE, JSON.stringify(DEFAULTS, null, 2) + "\n");
}

export function preferenceDefaults(): Readonly<Preferences> {
	return DEFAULTS;
}
