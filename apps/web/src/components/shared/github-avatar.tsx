import Image from "next/image";
import { GITHUB_HOSTNAME, IS_GHES } from "@/lib/github-config";

/**
 * Renders a GitHub avatar that bypasses the Next.js image optimizer.
 *
 * GitHub's avatar CDN already serves properly sized images via `?s=SIZE`,
 * so proxying through `/_next/image` adds latency and can timeout for
 * GitHub-App installation avatars (the `/in/…` URLs).
 *
 * On GHES private mode, avatar URLs require cookie auth the browser doesn't
 * have, so we proxy them through `/api/github-avatar` with the user's token.
 */
export function GithubAvatar({
	src,
	alt,
	size = 16,
	className,
}: {
	src: string;
	alt: string;
	size?: number;
	className?: string;
}) {
	const url = githubAvatarUrl(src, size);
	return (
		<Image
			src={url}
			alt={alt}
			width={size}
			height={size}
			className={className}
			unoptimized
		/>
	);
}

// On github.com avatars come from avatars.githubusercontent.com;
// on GHES they come from avatars.<host> or the GHES host itself.
const AVATAR_HOSTS = new Set([
	"avatars.githubusercontent.com",
	GITHUB_HOSTNAME,
	`avatars.${GITHUB_HOSTNAME}`,
]);

function isGhesAvatarUrl(hostname: string): boolean {
	return IS_GHES && AVATAR_HOSTS.has(hostname);
}

/**
 * Rewrites a GitHub avatar URL to a proxied URL on GHES (private mode).
 * Exported so other components can use it for raw avatar URLs.
 */
export function githubAvatarUrl(src: string, size?: number): string {
	try {
		const u = new URL(src);
		if (AVATAR_HOSTS.has(u.hostname)) {
			if (size) u.searchParams.set("s", String(size * 2));
			// On GHES private mode, proxy through our API to add auth
			if (isGhesAvatarUrl(u.hostname)) {
				return `/api/github-avatar?url=${encodeURIComponent(u.toString())}`;
			}
			return u.toString();
		}
	} catch {
		// non-URL or relative — fall through
	}
	return src;
}
