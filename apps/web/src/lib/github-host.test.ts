import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `github-host` resolves its constants from env at module-eval time, so each
 * case stubs the env and imports a fresh copy of the module.
 */
async function loadWithHost(host?: string) {
	vi.resetModules();
	vi.stubEnv("NEXT_PUBLIC_GITHUB_HOST", "");
	vi.stubEnv("GITHUB_HOST", host ?? "");
	return import("./github-host");
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("github-host deployment detection", () => {
	it("defaults to GitHub.com when unset", async () => {
		const m = await loadWithHost(undefined);
		expect(m.GITHUB_HOST).toBe("github.com");
		expect(m.GITHUB_DEPLOYMENT).toBe("cloud");
		expect(m.IS_GITHUB_CLOUD).toBe(true);
		expect(m.IS_GITHUB_ENTERPRISE).toBe(false);
	});

	it("detects a ghe.com Data Residency tenant", async () => {
		const m = await loadWithHost("acme.ghe.com");
		expect(m.GITHUB_DEPLOYMENT).toBe("ghe-cloud");
		expect(m.IS_GITHUB_ENTERPRISE).toBe(true);
	});

	it("detects a self-hosted GHES host", async () => {
		const m = await loadWithHost("github.acme-corp.com");
		expect(m.GITHUB_DEPLOYMENT).toBe("ghes");
		expect(m.IS_GITHUB_ENTERPRISE).toBe(true);
	});

	it("normalizes scheme, casing, and trailing slash", async () => {
		const m = await loadWithHost("HTTPS://Acme.GHE.com/");
		expect(m.GITHUB_HOST).toBe("acme.ghe.com");
	});
});

describe("github-host API / GraphQL URLs", () => {
	it("uses api.github.com for cloud", async () => {
		const m = await loadWithHost("github.com");
		expect(m.GITHUB_API_URL).toBe("https://api.github.com");
		expect(m.GITHUB_GRAPHQL_URL).toBe("https://api.github.com/graphql");
	});

	it("uses api.<host> for ghe.com Data Residency", async () => {
		const m = await loadWithHost("acme.ghe.com");
		expect(m.GITHUB_API_URL).toBe("https://api.acme.ghe.com");
		expect(m.GITHUB_GRAPHQL_URL).toBe("https://api.acme.ghe.com/graphql");
	});

	it("uses <host>/api/v3 and /api/graphql for GHES", async () => {
		const m = await loadWithHost("github.acme-corp.com");
		expect(m.GITHUB_API_URL).toBe("https://github.acme-corp.com/api/v3");
		expect(m.GITHUB_GRAPHQL_URL).toBe("https://github.acme-corp.com/api/graphql");
	});
});

describe("github-host URL builders", () => {
	it("builds web URLs on the active host", async () => {
		const m = await loadWithHost("acme.ghe.com");
		expect(m.githubWebUrl("/owner/repo")).toBe("https://acme.ghe.com/owner/repo");
		expect(m.githubWebUrl("owner/repo")).toBe("https://acme.ghe.com/owner/repo");
		expect(m.githubWebUrl()).toBe("https://acme.ghe.com");
	});

	it("builds raw-content URLs per deployment", async () => {
		const cloud = await loadWithHost("github.com");
		expect(
			cloud.githubRawUrl({ owner: "o", repo: "r", ref: "main", path: "a/b.png" }),
		).toBe("https://raw.githubusercontent.com/o/r/main/a/b.png");

		const ghes = await loadWithHost("github.acme-corp.com");
		expect(
			ghes.githubRawUrl({ owner: "o", repo: "r", ref: "main", path: "/a/b.png" }),
		).toBe("https://github.acme-corp.com/raw/o/r/main/a/b.png");
	});
});

describe("github-host avatar normalization", () => {
	it("absolutizes relative enterprise avatar paths", async () => {
		const m = await loadWithHost("github.acme-corp.com");
		expect(m.resolveAvatarUrl("/u/123?v=4")).toBe(
			"https://github.acme-corp.com/avatars/u/123?v=4",
		);
	});

	it("leaves absolute URLs untouched", async () => {
		const m = await loadWithHost("github.acme-corp.com");
		const abs = "https://github.acme-corp.com/avatars/u/1";
		expect(m.resolveAvatarUrl(abs)).toBe(abs);
	});

	it("walks nested objects/arrays", async () => {
		const m = await loadWithHost("github.acme-corp.com");
		const input = {
			actor: { avatar_url: "/u/1?v=4" },
			items: [{ avatar_url: "/u/2?v=4" }],
		};
		const out = m.normalizeAvatarUrls(input);
		expect(out.actor.avatar_url).toBe("https://github.acme-corp.com/avatars/u/1?v=4");
		expect(out.items[0].avatar_url).toBe(
			"https://github.acme-corp.com/avatars/u/2?v=4",
		);
	});
});
