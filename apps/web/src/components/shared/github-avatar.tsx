import Image from "next/image";

/**
 * Renders a GitHub avatar that bypasses the Next.js image optimizer.
 *
 * GitHub's avatar CDN already serves properly sized images via `?s=SIZE`,
 * so proxying through `/_next/image` adds latency and can timeout for
 * GitHub-App installation avatars (the `/in/…` URLs).
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

const GH_AVATAR_HOST = "avatars.githubusercontent.com";

function githubAvatarUrl(src: string, size: number): string {
	try {
		const u = new URL(src);
		if (u.hostname === GH_AVATAR_HOST) {
			u.searchParams.set("s", String(size * 2));
			return u.toString();
		}
	} catch {
		// non-URL or relative — fall through
	}
	return src;
}
