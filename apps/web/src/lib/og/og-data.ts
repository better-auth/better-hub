import { getSharedCacheEntry } from "../github-sync-store";

// Lightweight data fetching for OG images.
// Tries shared Redis cache first, falls back to unauthenticated GitHub REST API.

const GITHUB_API = "https://api.github.com";

function ghHeaders(): HeadersInit {
	const h: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "BetterHub-OG",
	};
	if (process.env.GITHUB_SERVER_TOKEN) {
		h.Authorization = `Bearer ${process.env.GITHUB_SERVER_TOKEN}`;
	}
	return h;
}

async function ghFetch<T>(path: string): Promise<T | null> {
	try {
		const res = await fetch(`${GITHUB_API}${path}`, {
			headers: ghHeaders(),
			next: { revalidate: 300 },
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

function normalizeRepoKey(owner: string, repo: string): string {
	return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

// ── Types (minimal, OG-relevant only) ──

export interface OGRepoData {
	full_name: string;
	description: string | null;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	owner_avatar: string;
	owner_login: string;
}

export interface OGIssueData {
	title: string;
	number: number;
	state: string;
	author: string;
	author_avatar: string;
	repo: string;
}

export interface OGPullRequestData {
	title: string;
	number: number;
	state: string;
	merged: boolean;
	additions: number;
	deletions: number;
	author: string;
	author_avatar: string;
	repo: string;
}

export interface OGUserData {
	login: string;
	name: string | null;
	avatar_url: string;
	bio: string | null;
	public_repos: number;
	followers: number;
}

export interface OGOrgData {
	login: string;
	name: string | null;
	avatar_url: string;
	description: string | null;
	public_repos: number;
	followers: number;
}

// ── Fetchers ──

export async function getOGRepo(owner: string, repo: string): Promise<OGRepoData | null> {
	// Try shared cache
	const cacheKey = `repo:${normalizeRepoKey(owner, repo)}`;
	const cached = await getSharedCacheEntry<Record<string, unknown>>(cacheKey).catch(
		() => null,
	);
	if (cached?.data) {
		const d = cached.data;
		return {
			full_name: (d.full_name as string) || `${owner}/${repo}`,
			description: (d.description as string) ?? null,
			language: (d.language as string) ?? null,
			stargazers_count: (d.stargazers_count as number) ?? 0,
			forks_count: (d.forks_count as number) ?? 0,
			owner_avatar:
				((d.owner as Record<string, unknown>)?.avatar_url as string) || "",
			owner_login:
				((d.owner as Record<string, unknown>)?.login as string) || owner,
		};
	}

	// Fall back to GitHub API
	const data = await ghFetch<Record<string, unknown>>(`/repos/${owner}/${repo}`);
	if (!data) return null;
	return {
		full_name: (data.full_name as string) || `${owner}/${repo}`,
		description: (data.description as string) ?? null,
		language: (data.language as string) ?? null,
		stargazers_count: (data.stargazers_count as number) ?? 0,
		forks_count: (data.forks_count as number) ?? 0,
		owner_avatar: ((data.owner as Record<string, unknown>)?.avatar_url as string) || "",
		owner_login: ((data.owner as Record<string, unknown>)?.login as string) || owner,
	};
}

export async function getOGIssue(
	owner: string,
	repo: string,
	number: number,
): Promise<OGIssueData | null> {
	const cacheKey = `issue:${normalizeRepoKey(owner, repo)}:${number}`;
	const cached = await getSharedCacheEntry<Record<string, unknown>>(cacheKey).catch(
		() => null,
	);
	if (cached?.data) {
		const d = cached.data;
		return {
			title: (d.title as string) || "",
			number: (d.number as number) || number,
			state: (d.state as string) || "open",
			author: ((d.user as Record<string, unknown>)?.login as string) || "",
			author_avatar:
				((d.user as Record<string, unknown>)?.avatar_url as string) || "",
			repo: `${owner}/${repo}`,
		};
	}

	const data = await ghFetch<Record<string, unknown>>(
		`/repos/${owner}/${repo}/issues/${number}`,
	);
	if (!data) return null;
	return {
		title: (data.title as string) || "",
		number: (data.number as number) || number,
		state: (data.state as string) || "open",
		author: ((data.user as Record<string, unknown>)?.login as string) || "",
		author_avatar: ((data.user as Record<string, unknown>)?.avatar_url as string) || "",
		repo: `${owner}/${repo}`,
	};
}

export async function getOGPullRequest(
	owner: string,
	repo: string,
	number: number,
): Promise<OGPullRequestData | null> {
	const cacheKey = `pull_request:${normalizeRepoKey(owner, repo)}:${number}`;
	const cached = await getSharedCacheEntry<Record<string, unknown>>(cacheKey).catch(
		() => null,
	);
	if (cached?.data) {
		const d = cached.data;
		return {
			title: (d.title as string) || "",
			number: (d.number as number) || number,
			state: (d.state as string) || "open",
			merged: !!(d.merged_at ?? d.merged),
			additions: (d.additions as number) ?? 0,
			deletions: (d.deletions as number) ?? 0,
			author: ((d.user as Record<string, unknown>)?.login as string) || "",
			author_avatar:
				((d.user as Record<string, unknown>)?.avatar_url as string) || "",
			repo: `${owner}/${repo}`,
		};
	}

	const data = await ghFetch<Record<string, unknown>>(
		`/repos/${owner}/${repo}/pulls/${number}`,
	);
	if (!data) return null;
	return {
		title: (data.title as string) || "",
		number: (data.number as number) || number,
		state: (data.state as string) || "open",
		merged: !!(data.merged_at ?? data.merged),
		additions: (data.additions as number) ?? 0,
		deletions: (data.deletions as number) ?? 0,
		author: ((data.user as Record<string, unknown>)?.login as string) || "",
		author_avatar: ((data.user as Record<string, unknown>)?.avatar_url as string) || "",
		repo: `${owner}/${repo}`,
	};
}

export async function getOGUser(username: string): Promise<OGUserData | null> {
	const cacheKey = `user_profile:${username.toLowerCase()}`;
	const cached = await getSharedCacheEntry<Record<string, unknown>>(cacheKey).catch(
		() => null,
	);
	if (cached?.data) {
		const d = cached.data;
		return {
			login: (d.login as string) || username,
			name: (d.name as string) ?? null,
			avatar_url: (d.avatar_url as string) || "",
			bio: (d.bio as string) ?? null,
			public_repos: (d.public_repos as number) ?? 0,
			followers: (d.followers as number) ?? 0,
		};
	}

	const data = await ghFetch<Record<string, unknown>>(`/users/${username}`);
	if (!data) return null;
	return {
		login: (data.login as string) || username,
		name: (data.name as string) ?? null,
		avatar_url: (data.avatar_url as string) || "",
		bio: (data.bio as string) ?? null,
		public_repos: (data.public_repos as number) ?? 0,
		followers: (data.followers as number) ?? 0,
	};
}

export async function getOGOrg(org: string): Promise<OGOrgData | null> {
	const cacheKey = `org:${org.toLowerCase()}`;
	const cached = await getSharedCacheEntry<Record<string, unknown>>(cacheKey).catch(
		() => null,
	);
	if (cached?.data) {
		const d = cached.data;
		return {
			login: (d.login as string) || org,
			name: (d.name as string) ?? null,
			avatar_url: (d.avatar_url as string) || "",
			description: (d.description as string) ?? null,
			public_repos: (d.public_repos as number) ?? 0,
			followers: (d.followers as number) ?? 0,
		};
	}

	const data = await ghFetch<Record<string, unknown>>(`/orgs/${org}`);
	if (!data) return null;
	return {
		login: (data.login as string) || org,
		name: (data.name as string) ?? null,
		avatar_url: (data.avatar_url as string) || "",
		description: (data.description as string) ?? null,
		public_repos: (data.public_repos as number) ?? 0,
		followers: (data.followers as number) ?? 0,
	};
}
