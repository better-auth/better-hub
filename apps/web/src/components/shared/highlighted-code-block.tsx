"use client";

import { useEffect, useState, memo } from "react";
import { useColorTheme } from "@/components/theme/theme-provider";
import { highlightCodeClient } from "@/lib/shiki-client";

export const HighlightedCodeBlock = memo(function HighlightedCodeBlock({
	code,
	lang,
}: {
	code: string;
	lang: string;
}) {
	const { themeId } = useColorTheme();
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		highlightCodeClient(code, lang, themeId).then((result) => {
			if (!cancelled) setHtml(result);
		});
		return () => {
			cancelled = true;
		};
	}, [code, lang, themeId]);

	if (html) {
		return <div dangerouslySetInnerHTML={{ __html: html }} />;
	}
	return (
		<pre>
			<code>{code}</code>
		</pre>
	);
});
