"use client";

import { useEffect, useRef } from "react";
import { useColorTheme } from "@/components/theme/theme-provider";
import { highlightCodeClient } from "@/lib/shiki-client";

interface ReactiveCodeBlocksProps {
	children: React.ReactNode;
}

export function ReactiveCodeBlocks({ children }: ReactiveCodeBlocksProps) {
	const { themeId } = useColorTheme();
	const containerRef = useRef<HTMLDivElement>(null);
	const initialThemeRef = useRef<string | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		if (initialThemeRef.current === null) {
			initialThemeRef.current = themeId;
			return;
		}

		if (initialThemeRef.current === themeId) return;
		initialThemeRef.current = themeId;

		const codeWrappers = containerRef.current.querySelectorAll(".ghmd-reactive-code");
		if (codeWrappers.length === 0) return;

		let cancelled = false;

		const rehighlight = async () => {
			for (const wrapper of codeWrappers) {
				if (cancelled) break;

				const code = wrapper.getAttribute("data-code");
				const lang = wrapper.getAttribute("data-lang") || "text";

				if (!code) continue;

				const decodedCode = code
					.replace(/&#10;/g, "\n")
					.replace(/&quot;/g, '"')
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.replace(/&amp;/g, "&");

				try {
					const html = await highlightCodeClient(
						decodedCode,
						lang,
						themeId,
					);
					if (!cancelled) {
						wrapper.innerHTML = html;
					}
				} catch {
					// Keep existing content on error
				}
			}
		};

		rehighlight();

		return () => {
			cancelled = true;
		};
	}, [themeId]);

	return <div ref={containerRef}>{children}</div>;
}
