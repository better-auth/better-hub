"use client";

import { useEffect, useState, memo } from "react";
import { useColorTheme } from "@/components/theme/theme-provider";
import { highlightCodeClient } from "@/lib/shiki-client";

export const HighlightedCodeBlock = memo(function HighlightedCodeBlock({
	code,
	lang,
	inlineColors = false,
	className,
}: {
	code: string;
	lang: string;
	inlineColors?: boolean;
	className?: string;
}) {
	const { themeId } = useColorTheme();
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const highlighter = await getClientHighlighter();
				const loaded = highlighter.getLoadedLanguages();
				let effectiveLang = lang;
				if (!loaded.includes(lang)) {
					try {
						await highlighter.loadLanguage(
							lang as BundledLanguage,
						);
					} catch {
  						effectiveLang = "text";
						if (!loaded.includes("text")) {
							try {
								await highlighter.loadLanguage(
									"text" as BundledLanguage,
								);
							} catch {}
						}
					}
				}
				if (!cancelled) {
					const result = highlighter.codeToHtml(code, {
						lang: effectiveLang,
						themes: {
							light: "vitesse-light",
							dark: "vitesse-black",
						},
						defaultColor: inlineColors ? "light-dark()" : false,
					});
					setHtml(result);
				}
			} catch {
				// silently fall back to plain text
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [code, lang, inlineColors]);

	if (html) {
		return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
	}
	return (
		<pre className={className}>
			<code>{code}</code>
		</pre>
	);
});
