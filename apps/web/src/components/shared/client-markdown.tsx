"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseGitHubUrl, toInternalUrl } from "@/lib/github-utils";
import { HighlightedCodeBlock } from "@/components/shared/highlighted-code-block";

const sanitizeSchema: typeof defaultSchema = {
	...defaultSchema,
	tagNames: [
		...(defaultSchema.tagNames ?? []),
		"details",
		"summary",
		"picture",
		"source",
		"video",
		"audio",
		"figure",
		"figcaption",
		"abbr",
		"mark",
	],
	attributes: {
		...defaultSchema.attributes,
		"*": [...(defaultSchema.attributes?.["*"] ?? []), ["data*"], "className"],
		img: [...(defaultSchema.attributes?.img ?? []), "loading", "decoding"],
		video: [
			"src",
			"poster",
			"controls",
			"muted",
			"autoPlay",
			"loop",
			"width",
			"height",
		],
		audio: ["src", "controls"],
		source: ["src", "srcSet", "media", "type"],
		details: ["open"],
		input: [...(defaultSchema.attributes?.input ?? []), "checked", "disabled", "type"],
	},
};

/** Convert @username in markdown source to links (skip inside code fences/backticks) */
function linkifyMentionsMd(md: string): string {
	// Split out code fences and inline code so we don't touch them
	const parts = md.split(/(```[\s\S]*?```|`[^`]+`)/g);
	for (let i = 0; i < parts.length; i += 2) {
		parts[i] = parts[i].replace(
			/(^|[^/\w[\]])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\b/g,
			(_m, prefix, username) => `${prefix}[@${username}](/users/${username})`,
		);
	}
	return parts.join("");
}

export function ClientMarkdown({ content, className }: { content: string; className?: string }) {
	return (
		<div className={cn("ghmd ghmd-sm", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
				components={{
					code({ className: codeClassName, children, ref, ...rest }) {
						const match = /language-(\w+)/.exec(
							codeClassName || "",
						);
						if (match) {
							return (
								<HighlightedCodeBlock
									code={String(
										children,
									).replace(/\n$/, "")}
									lang={match[1]}
								/>
							);
						}
						return (
							<code className={codeClassName} {...rest}>
								{children}
							</code>
						);
					},
					pre({ children, node }) {
						// Only strip pre when child has a language class (HighlightedCodeBlock handles its own wrapper)
						const nodeChildren = (node?.children ??
							[]) as Array<{
							tagName?: string;
							properties?: { className?: string[] };
						}>;
						const codeChild = nodeChildren.find(
							(c) => c.tagName === "code",
						);
						const hasLang =
							codeChild?.properties?.className?.some?.(
								(c: string) =>
									typeof c === "string" &&
									c.startsWith("language-"),
							);
						if (hasLang) return <>{children}</>;
						return <pre>{children}</pre>;
					},
					a({ href, children, ...rest }) {
						if (href?.startsWith("/users/")) {
							return (
								<Link
									href={href}
									className="ghmd-mention"
									{...rest}
								>
									<svg
										className="ghmd-mention-icon"
										viewBox="0 0 16 16"
										fill="currentColor"
									>
										<path d="M10.561 8.073a6 6 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6 6 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
									</svg>
									{children}
								</Link>
							);
						}
						if (href && parseGitHubUrl(href)) {
							return (
								<Link
									href={toInternalUrl(href)}
									{...rest}
								>
									{children}
								</Link>
							);
						}
						return (
							<a
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								{...rest}
							>
								{children}
							</a>
						);
					},
				}}
			>
				{linkifyMentionsMd(content)}
			</ReactMarkdown>
		</div>
	);
}
