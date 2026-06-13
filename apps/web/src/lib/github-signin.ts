"use client";

import { authClient, signIn } from "./auth-client";

/**
 * Hostname of the configured GitHub instance, exposed to the client.
 * Defaults to `github.com` when `NEXT_PUBLIC_GITHUB_HOST` is unset.
 */
export const GITHUB_HOST = (process.env.NEXT_PUBLIC_GITHUB_HOST || "github.com")
	.trim()
	.toLowerCase()
	.replace(/^https?:\/\//, "")
	.replace(/\/+$/, "");

export const IS_GITHUB_ENTERPRISE = GITHUB_HOST !== "github.com";

/** Convenience: web URL for the active host (e.g. for "Open in GitHub" links). */
export const GITHUB_WEB_URL = `https://${GITHUB_HOST}`;

export function githubWebUrl(path = ""): string {
	if (!path) return GITHUB_WEB_URL;
	return `${GITHUB_WEB_URL}${path.startsWith("/") ? path : `/${path}`}`;
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
	if (IS_GITHUB_ENTERPRISE) {
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
