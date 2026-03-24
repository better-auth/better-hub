import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Config {
	baseUrl: string;
	auth?: {
		token: string;
		expiresAt?: string;
	};
}

const CONFIG_DIR = join(homedir(), ".better-hub");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: Config = {
	baseUrl: "https://www.better-hub.com",
};

function ensureConfigDir() {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true });
	}
}

export function readConfig(): Config {
	ensureConfigDir();
	if (!existsSync(CONFIG_FILE)) {
		return { ...DEFAULT_CONFIG };
	}
	try {
		const raw = readFileSync(CONFIG_FILE, "utf-8");
		return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function writeConfig(config: Config) {
	ensureConfigDir();
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

export function clearAuth() {
	const config = readConfig();
	delete config.auth;
	writeConfig(config);
}

export function setAuth(token: string, expiresAt?: string) {
	const config = readConfig();
	config.auth = expiresAt ? { token, expiresAt } : { token };
	writeConfig(config);
}

export function getToken(): string | null {
	return readConfig().auth?.token ?? null;
}

export function getBaseUrl(): string {
	return process.env["BETTER_HUB_URL"] ?? readConfig().baseUrl;
}
