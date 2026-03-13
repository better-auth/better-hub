"use client";

import NextImage, { type ImageProps } from "next/image";
import { IS_GHES, GITHUB_HOSTNAME } from "@/lib/github-config";

/**
 * Set of hostnames that serve GHES avatars/images requiring auth.
 * On github.com this is empty so the proxy is never used.
 */
const GHES_IMAGE_HOSTS = IS_GHES
	? new Set([GITHUB_HOSTNAME, `avatars.${GITHUB_HOSTNAME}`])
	: new Set<string>();

function proxyGhesSrc(src: string | undefined): string | undefined {
	if (!src || !IS_GHES) return src;
	try {
		const u = new URL(src);
		if (GHES_IMAGE_HOSTS.has(u.hostname)) {
			return `/api/github-avatar?url=${encodeURIComponent(src)}`;
		}
	} catch {
		// relative URL or invalid — leave as-is
	}
	return src;
}

/**
 * Drop-in replacement for next/image that proxies GHES avatar URLs
 * through our authenticated backend proxy.
 *
 * On github.com (non-GHES) this is a passthrough to next/image.
 */
export default function GhesImage(props: ImageProps) {
	const src = typeof props.src === "string" ? proxyGhesSrc(props.src) : props.src;
	return <NextImage {...props} src={src ?? props.src} />;
}
