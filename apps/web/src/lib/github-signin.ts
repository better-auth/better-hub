"use client";

import { authClient, signIn } from "./auth-client";
import { getGithubHost, githubWebOrigin, isGithubEnterprise } from "./github-host-client";

/**
 * Hostname of the configured GitHub instance, exposed to the client.
 *
 * Resolved at **runtime** (see `github-host-client`), so a single prebuilt
 * image can target any GitHub instance via the `GITHUB_HOST` env var.
 */
export const GITHUB_HOST = getGithubHost();

export const IS_GITHUB_ENTERPRISE = isGithubEnterprise();

/** Convenience: web URL for the active host (e.g. for "Open in GitHub" links). */
export const GITHUB_WEB_URL = githubWebOrigin();

export function githubWebUrl(path = ""): string {
	const origin = githubWebOrigin();
	if (!path) return origin;
	return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Trigger the GitHub OAuth sign-in flow. On GitHub.com this hits the
 * `socialProviders.github` path; on GitHub Enterprise it uses the generic
 * OAuth plugin (registered under the same `providerId: "github"`).
 */
export function signInWithGitHub(opts: {
	scopes: string[];
	callbackURL?: string;
}): Promise<unknown> {
	if (isGithubEnterprise()) {
		return authClient.signIn.oauth2({
			providerId: "github",
			callbackURL: opts.callbackURL,
			scopes: opts.scopes,
		});
	}
	return signIn.social({
		provider: "github",
		callbackURL: opts.callbackURL,
		scopes: opts.scopes,
	});
}
