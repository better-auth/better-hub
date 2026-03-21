// Environment-driven GitHub endpoint configuration.
// Defaults to github.com so nothing changes for existing users.

export const GITHUB_WEB_URL =
	process.env.NEXT_PUBLIC_GITHUB_WEB_URL ||
	process.env.GITHUB_WEB_URL ||
	"https://github.com";

export const GITHUB_API_URL = process.env.GITHUB_API_URL || "https://api.github.com";

export const GITHUB_GRAPHQL_URL = process.env.GITHUB_GRAPHQL_URL || `${GITHUB_API_URL}/graphql`;

// Derive hostname for URL parsing (e.g. "github.com" or "gh.zlt.dev")
export const GITHUB_HOSTNAME = new URL(GITHUB_WEB_URL).hostname;

// Raw content URL — on github.com this is raw.githubusercontent.com,
// on GHES it's typically https://<host>/raw
export const GITHUB_RAW_URL =
	process.env.GITHUB_RAW_URL ||
	(GITHUB_HOSTNAME === "github.com"
		? "https://raw.githubusercontent.com"
		: `${GITHUB_WEB_URL}/raw`);

// Whether we're pointing at a GHES instance (not github.com)
export const IS_GHES = GITHUB_HOSTNAME !== "github.com";
