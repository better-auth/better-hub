import { Octokit } from "@octokit/rest";

/**
 * Hostname of the GitHub instance to talk to. Defaults to `github.com`.
 *
 * Examples:
 *  - `github.com`               → GitHub.com (cloud, default)
 *  - `acme.ghe.com`             → GitHub Enterprise Cloud with Data Residency
 *  - `github.acme-corp.com`     → GitHub Enterprise Server (self-hosted)
 *
 * Set both `GITHUB_HOST` (server) and `NEXT_PUBLIC_GITHUB_HOST` (client) to the
 * same value so OAuth links rendered in the browser match what the server uses.
 */
export const GITHUB_HOST = (
	process.env.NEXT_PUBLIC_GITHUB_HOST ||
	process.env.GITHUB_HOST ||
	"github.com"
)
	.trim()
	.toLowerCase()
	.replace(/^https?:\/\//, "")
	.replace(/\/+$/, "");

export type GithubDeployment = "cloud" | "ghe-cloud" | "ghes";

export const GITHUB_DEPLOYMENT: GithubDeployment =
	GITHUB_HOST === "github.com"
		? "cloud"
		: GITHUB_HOST.endsWith(".ghe.com")
			? "ghe-cloud"
			: "ghes";

export const IS_GITHUB_CLOUD = GITHUB_DEPLOYMENT === "cloud";
export const IS_GITHUB_ENTERPRISE = !IS_GITHUB_CLOUD;

/** `https://github.com` (or the configured enterprise web URL). */
export const GITHUB_WEB_URL = `https://${GITHUB_HOST}`;

/** REST API base. */
export const GITHUB_API_URL =
	GITHUB_DEPLOYMENT === "cloud"
		? "https://api.github.com"
		: GITHUB_DEPLOYMENT === "ghe-cloud"
			? `https://api.${GITHUB_HOST}`
			: `https://${GITHUB_HOST}/api/v3`;

/** GraphQL endpoint. */
export const GITHUB_GRAPHQL_URL =
	GITHUB_DEPLOYMENT === "cloud"
		? "https://api.github.com/graphql"
		: GITHUB_DEPLOYMENT === "ghe-cloud"
			? `https://api.${GITHUB_HOST}/graphql`
			: `https://${GITHUB_HOST}/api/graphql`;

/** SSH clone host used in `git@<host>:owner/repo.git`. */
export const GITHUB_SSH_HOST = GITHUB_HOST;

/** OAuth endpoints — always served from the web host. */
export const GITHUB_OAUTH_AUTHORIZE_URL = `${GITHUB_WEB_URL}/login/oauth/authorize`;
export const GITHUB_OAUTH_TOKEN_URL = `${GITHUB_WEB_URL}/login/oauth/access_token`;
export const GITHUB_USER_INFO_URL = `${GITHUB_API_URL}/user`;
export const GITHUB_USER_EMAILS_URL = `${GITHUB_API_URL}/user/emails`;

/** Build a URL on the GitHub web host. `path` may be empty or start with "/". */
export function githubWebUrl(path = ""): string {
	if (!path) return GITHUB_WEB_URL;
	return `${GITHUB_WEB_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Build a REST URL, e.g. `githubRestUrl("/repos/foo/bar")`. */
export function githubRestUrl(path: string): string {
	return `${GITHUB_API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Build a raw-content URL for a file in a repo at a given ref. */
export function githubRawUrl({
	owner,
	repo,
	ref,
	path,
}: {
	owner: string;
	repo: string;
	ref: string;
	path: string;
}): string {
	const cleanPath = path.startsWith("/") ? path.slice(1) : path;
	if (GITHUB_DEPLOYMENT === "cloud") {
		return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${cleanPath}`;
	}
	// Both GHES and ghe.com Data Residency serve raw content under `<host>/raw/...`.
	return `https://${GITHUB_HOST}/raw/${owner}/${repo}/${ref}/${cleanPath}`;
}

/**
 * Avatar URL base used to absolutize relative paths returned by the API.
 *  - cloud:     `https://avatars.githubusercontent.com`
 *  - ghe-cloud: `https://<tenant>.ghe.com/avatars` (served from the main host)
 *  - ghes:      `https://<host>/avatars`
 */
export const GITHUB_AVATAR_URL =
	GITHUB_DEPLOYMENT === "cloud"
		? "https://avatars.githubusercontent.com"
		: `https://${GITHUB_HOST}/avatars`;

/**
 * Absolutize an avatar URL. Some GitHub Enterprise responses return paths
 * like `/u/12345?v=4` without a host; those break `next/image`. Absolute
 * URLs and empty values pass through unchanged.
 */
export function resolveAvatarUrl(url: string | null | undefined): string {
	if (!url) return "";
	if (/^https?:\/\//i.test(url) || url.startsWith("//")) return url;
	if (url.startsWith("/")) return `${GITHUB_AVATAR_URL}${url}`;
	return url;
}

/**
 * Walk an object and absolutize any `avatar_url` strings found on it or its
 * nested objects/arrays. Used to normalize raw API responses where some
 * endpoints (notably /events) return relative avatar URLs on Enterprise.
 */
export function normalizeAvatarUrls<T>(value: T): T {
	if (value === null || value === undefined) return value;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			value[i] = normalizeAvatarUrls(value[i]);
		}
		return value;
	}
	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		for (const key of Object.keys(obj)) {
			const v = obj[key];
			if (key === "avatar_url" && typeof v === "string") {
				obj[key] = resolveAvatarUrl(v);
			} else if (v !== null && typeof v === "object") {
				normalizeAvatarUrls(v);
			}
		}
		return value;
	}
	return value;
}

/**
 * Hostname used for `<img>` srcs and `next/image` `remotePatterns`. Listed in
 * priority order; the first matching pattern is enough for next/image config.
 */
export function githubImageHostnames(): string[] {
	if (GITHUB_DEPLOYMENT === "cloud") {
		// Already covered explicitly by next.config.ts defaults.
		return [];
	}
	// Both GHES and ghe.com Data Residency serve avatars and raw content from
	// the single tenant host under `/avatars/...` and `/raw/...`.
	return [GITHUB_HOST];
}

/** Create an Octokit pre-configured for the active GitHub host. */
export function createOctokit(options: ConstructorParameters<typeof Octokit>[0] = {}): Octokit {
	const octokit = new Octokit({
		...options,
		baseUrl: options.baseUrl ?? GITHUB_API_URL,
	});
	if (IS_GITHUB_ENTERPRISE) {
		// Enterprise sometimes returns relative `avatar_url` paths (e.g. `/u/<id>?v=4`).
		// Absolutize them on the way out so consumers can pass them to next/image
		// without hitting the localPatterns guard.
		octokit.hook.after("request", (response) => {
			if (response && typeof response === "object" && "data" in response) {
				const r = response as { data: unknown };
				r.data = normalizeAvatarUrls(r.data);
			}
		});
	}
	return octokit;
}
