"use client";

import NextImage, { type ImageProps } from "next/image";
import { IS_GHES, GITHUB_HOSTNAME } from "@/lib/github-config";

/**
 * Hostnames whose images need to be proxied through the server.
 * On github.com this is empty, so the component is a plain passthrough.
 */
const PROXY_HOSTS = IS_GHES
	? new Set([GITHUB_HOSTNAME, `avatars.${GITHUB_HOSTNAME}`])
	: new Set<string>();

function proxySrc(src: string | undefined): string | undefined {
	if (!src || !IS_GHES) return src;
	try {
		const u = new URL(src);
		if (PROXY_HOSTS.has(u.hostname)) {
			return `/api/github-avatar?url=${encodeURIComponent(src)}`;
		}
	} catch {
		// relative URL or invalid — leave as-is
	}
	return src;
}

/**
 * Drop-in replacement for next/image that handles GitHub avatar auth.
 * On GHES, proxies avatar URLs through the server-side session proxy.
 * On github.com, this is a passthrough to next/image.
 */
export default function GitHubImage(props: ImageProps) {
	const src = typeof props.src === "string" ? proxySrc(props.src) : props.src;
	return <NextImage {...props} src={src ?? props.src} />;
}
