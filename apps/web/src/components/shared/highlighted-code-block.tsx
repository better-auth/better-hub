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
		const parser = typeof window !== "undefined" ? new window.DOMParser() : null;
		let codeLines: string[] = [];
		if (parser) {
			const doc = parser.parseFromString(html, "text/html");
			const shiki = doc.querySelector(".shiki");
			if (shiki) {
				// Try to get .line spans
				const lineSpans = shiki.querySelectorAll(".line");
				if (lineSpans.length > 0) {
					codeLines = Array.from(lineSpans).map(
						(line) => line.innerHTML,
					);
				} else {
					// Fallback: split by <br> or by lines
					codeLines = shiki.innerHTML.split(
						/<br\s*\/?>(?![^<]*<\/span>)/i,
					);
				}
			} else {
				// Fallback: split by \n
				codeLines = html.split(/\n/);
			}
		} else {
			codeLines = html.split(/\n/);
		}

		return (
			<div
				className="codeblock-preview flex text-[13px] font-mono"
				style={{ width: "100%", overflowX: "auto" }}
			>
				<div
					className="gutter select-none text-right pr-3 pl-1 py-2"
					style={{
						color: "var(--line-gutter)",
						minWidth: "2.5ch",
						userSelect: "none",
					}}
				>
					{codeLines.map((_, i) => (
						<div
							key={i}
							style={{
								height: "20px",
								lineHeight: "20px",
							}}
						>
							{i + 1}
						</div>
					))}
				</div>
				<div className="code flex-1 py-2" style={{ minWidth: 0 }}>
					{codeLines.map((line, i) => (
						<div
							key={i}
							style={{
								minHeight: "20px",
								lineHeight: "20px",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
							}}
							dangerouslySetInnerHTML={{
								__html: line || "\u200b",
							}}
						/>
					))}
				</div>
			</div>
		);
	}
	return (
		<pre>
			<code>{code}</code>
		</pre>
	);
});
