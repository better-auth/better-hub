import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Fzf } from "fzf";

export interface RepoEntry {
	slug: string;
	path: string;
	createdAt: string;
}

interface RepoRegistry {
	repos: RepoEntry[];
}

const REGISTRY_DIR = join(homedir(), ".better-hub");
const REGISTRY_FILE = join(REGISTRY_DIR, "repos.json");

function ensureRegistryDir() {
	if (!existsSync(REGISTRY_DIR)) {
		mkdirSync(REGISTRY_DIR, { recursive: true });
	}
}

function readRegistry(): RepoRegistry {
	ensureRegistryDir();
	if (!existsSync(REGISTRY_FILE)) {
		return { repos: [] };
	}
	try {
		const raw = readFileSync(REGISTRY_FILE, "utf-8");
		return JSON.parse(raw) as RepoRegistry;
	} catch {
		return { repos: [] };
	}
}

function writeRegistry(registry: RepoRegistry) {
	ensureRegistryDir();
	writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2) + "\n");
}

export function registerRepo(slug: string, path: string): RepoEntry {
	const registry = readRegistry();
	const existing = registry.repos.findIndex((r) => r.slug === slug);

	const entry: RepoEntry = {
		slug,
		path,
		createdAt: new Date().toISOString(),
	};

	if (existing !== -1) {
		registry.repos[existing] = entry;
	} else {
		registry.repos.push(entry);
	}

	writeRegistry(registry);
	return entry;
}

export function unregisterRepo(slug: string): boolean {
	const registry = readRegistry();
	const before = registry.repos.length;
	registry.repos = registry.repos.filter((r) => r.slug !== slug);
	if (registry.repos.length === before) return false;
	writeRegistry(registry);
	return true;
}

export function getRepoPath(slug: string): string | null {
	const registry = readRegistry();
	return registry.repos.find((r) => r.slug === slug)?.path ?? null;
}

export function listRegisteredRepos(): RepoEntry[] {
	return readRegistry().repos;
}

/**
 * Removes local registry entries whose slugs aren't in the given set of
 * server-known slugs. Returns the number of pruned entries.
 */
export function syncRegistry(serverSlugs: Set<string>): number {
	const registry = readRegistry();
	const before = registry.repos.length;
	registry.repos = registry.repos.filter((r) => serverSlugs.has(r.slug));
	const pruned = before - registry.repos.length;
	if (pruned > 0) writeRegistry(registry);
	return pruned;
}

export interface FuzzyMatch {
	entry: RepoEntry;
	score: number;
}

export function fuzzyFindRepos(query: string): FuzzyMatch[] {
	const repos = readRegistry().repos;
	const fzf = new Fzf(repos, { selector: (r) => r.slug });
	return fzf.find(query).map((result) => ({
		entry: result.item,
		score: result.score,
	}));
}
