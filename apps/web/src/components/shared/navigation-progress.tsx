"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function NavigationProgress() {
	const pathname = usePathname();
	const [state, setState] = useState<"idle" | "loading" | "completing">("idle");
	const prevPathname = useRef(pathname);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	// Detect navigation start: listen for link clicks
	useEffect(() => {
		function handleClick(e: MouseEvent) {
			const anchor = (e.target as HTMLElement).closest("a");
			if (
				!anchor ||
				!anchor.href ||
				anchor.target === "_blank" ||
				e.metaKey ||
				e.ctrlKey ||
				e.shiftKey
			)
				return;

			try {
				const url = new URL(anchor.href, window.location.origin);
				// Only internal navigations
				if (url.origin !== window.location.origin) return;
				// Skip same-page links
				if (url.pathname === window.location.pathname) return;

				setState("loading");
			} catch {
				// ignore invalid URLs
			}
		}

		document.addEventListener("click", handleClick, { capture: true });
		return () =>
			document.removeEventListener("click", handleClick, {
				capture: true,
			});
	}, []);

	// Detect navigation end: pathname changed
	useEffect(() => {
		if (pathname !== prevPathname.current) {
			prevPathname.current = pathname;
			setState("completing");
			clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => setState("idle"), 300);
		}
		return () => clearTimeout(timeoutRef.current);
	}, [pathname]);

	if (state === "idle") return null;

	return (
		<div className="fixed top-0 left-0 right-0 z-[9999] h-0.5">
			<div
				className={
					state === "loading"
						? "h-full bg-primary origin-left animate-progress-bar"
						: "h-full bg-primary origin-left animate-progress-complete"
				}
			/>
		</div>
	);
}
