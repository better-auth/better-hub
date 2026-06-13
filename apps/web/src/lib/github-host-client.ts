/**
 * Client-safe, **runtime** resolution of the configured GitHub host.
 *
 * `NEXT_PUBLIC_*` env vars are inlined into the client bundle at build time, so
 * a prebuilt image (e.g. the published OCI image) would otherwise freeze the
 * host at build. To keep a single image runtime-configurable, the host is read
 * dynamically instead:
 *
 *  - In the browser it reads `window.__GITHUB_HOST__`, which the root layout
 *    injects from the server's `GITHUB_HOST` env var at request time.
 *  - During SSR (and as a fallback) it reads the runtime env directly.
 *  - Defaults to `github.com` when nothing is configured.
 *
 * Setting `GITHUB_HOST` in the container is therefore enough;
 * `NEXT_PUBLIC_GITHUB_HOST` remains supported for local dev convenience.
 */

declare global {
	interface Window {
		__GITHUB_HOST__?: string;
	}
}

function normalizeHost(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/\/+$/, "");
}

/** Resolve the active GitHub hostname (e.g. `github.com`, `acme.ghe.com`). */
export function getGithubHost(): string {
	if (typeof window !== "undefined" && window.__GITHUB_HOST__) {
		return normalizeHost(window.__GITHUB_HOST__);
	}
	return normalizeHost(
		process.env.NEXT_PUBLIC_GITHUB_HOST || process.env.GITHUB_HOST || "github.com",
	);
}

/** Whether the active host is a GitHub Enterprise instance (not github.com). */
export function isGithubEnterprise(): boolean {
	return getGithubHost() !== "github.com";
}

/** Web URL for the active host, e.g. `https://github.com`. */
export function githubWebOrigin(): string {
	return `https://${getGithubHost()}`;
}
