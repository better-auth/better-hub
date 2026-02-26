"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { parseGitHubUrl, toInternalUrl } from "@/lib/github-utils";

export function GitHubLinkInterceptor({ children }: { children: React.ReactNode }) {
	const router = useRouter();
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		function handleClick(e: MouseEvent) {
			// Don't intercept modified clicks (new tab, etc.)
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
				return;

			const anchor = (e.target as HTMLElement).closest("a");
			if (!anchor) return;
			if (anchor.hasAttribute("data-no-github-intercept")) return;

			const href = anchor.href;
			if (!href) return;

			// Only intercept github.com links
			try {
				const url = new URL(href);
				if (url.hostname !== "github.com") return;
			} catch {
				return;
			}

			const parsed = parseGitHubUrl(href);
			if (!parsed) return;

			const internalPath = toInternalUrl(href);
			if (internalPath === href) return;

			e.preventDefault();
			router.push(internalPath);
		}

		el.addEventListener("click", handleClick);
		return () => el.removeEventListener("click", handleClick);
	}, [router]);

	return <div ref={ref}>{children}</div>;
}
