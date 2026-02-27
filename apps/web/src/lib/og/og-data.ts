// Lightweight data fetching for OG images.
// SECURITY: Only returns data for PUBLIC repositories to prevent leaking private repo data.

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

async function isRepoPublic(owner: string, repo: string): Promise<boolean> {
	const data = await ghFetch<{ private?: boolean }>(`/repos/${owner}/${repo}`);
	return data !== null && data.private !== true;
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
	const data = await ghFetch<Record<string, unknown> & { private?: boolean }>(
		`/repos/${owner}/${repo}`,
	);
	if (!data || data.private === true) return null;
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
	if (!(await isRepoPublic(owner, repo))) {
		return null;
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
	if (!(await isRepoPublic(owner, repo))) {
		return null;
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
