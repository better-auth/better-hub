import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

/**
 * GitHub-compatible sanitization schema.
 * Extends the default (GitHub-like) schema with elements commonly used in READMEs
 * while stripping dangerous tags like <script>, event handlers (onerror, onclick, etc.).
 */
const sanitizeSchema: typeof defaultSchema = {
	...defaultSchema,
	tagNames: [
		...(defaultSchema.tagNames ?? []),
		// GitHub README commonly uses these
		"details",
		"summary",
		"picture",
		"source",
		"video",
		"audio",
		"figcaption",
		"figure",
		"abbr",
		"mark",
		"ruby",
		"rt",
		"rp",
	],
	attributes: {
		...defaultSchema.attributes,
		"*": [
			...(defaultSchema.attributes?.["*"] ?? []),
			// Allow data-* attributes (used by our code/install block placeholders)
			["data*"],
			// Allow class for styling
			"className",
		],
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
import { highlightCode } from "@/lib/shiki";
import { toInternalUrl } from "@/lib/github-utils";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";

interface RepoContext {
	owner: string;
	repo: string;
	branch: string;
	/** Directory path of the current file (e.g. "docs" or "" for root) */
	dir?: string;
}

function isAbsoluteUrl(url: string): boolean {
	return /^https?:\/\/|^\/\/|^mailto:|^#|^data:/.test(url);
}

/**
 * Resolve relative URLs in the rendered HTML to point to raw.githubusercontent.com
 * for images and to our internal routes for links.
 */
function buildImageProxyUrl(
	owner: string,
	repo: string,
	branch: string,
	imagePath: string,
): string {
	return `/api/github-image?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(imagePath)}&ref=${encodeURIComponent(branch)}`;
}

function resolveUrls(html: string, ctx: RepoContext): string {
	const repoBase = `/${ctx.owner}/${ctx.repo}`;
	const dir = ctx.dir || "";

	// Resolve image src attributes — proxy through API for auth support
	html = html.replace(/(<img\s[^>]*?src=")([^"]+)(")/gi, (_match, before, src, after) => {
		if (isAbsoluteUrl(src)) return _match;
		const imagePath = src.startsWith("/")
			? src.slice(1)
			: `${dir ? dir + "/" : ""}${src.replace(/^\.\//, "")}`;
		const resolved = buildImageProxyUrl(ctx.owner, ctx.repo, ctx.branch, imagePath);
		return `${before}${resolved}${after}`;
	});

	// Resolve link href attributes (not anchors, not absolute)
	html = html.replace(/(<a\s[^>]*?href=")([^"]+)(")/gi, (_match, before, href, after) => {
		if (isAbsoluteUrl(href)) return _match;
		// Markdown files → blob route, others → blob route too
		const cleanPath = href.replace(/^\.\//, "");
		const resolved = href.startsWith("/")
			? `${repoBase}/blob/${ctx.branch}${href}`
			: `${repoBase}/blob/${ctx.branch}/${dir ? dir + "/" : ""}${cleanPath}`;
		return `${before}${resolved}${after}`;
	});

	// Resolve <source> srcset and src for <picture> elements
	html = html.replace(
		/(<source\s[^>]*?(?:src|srcset)=")([^"]+)(")/gi,
		(_match, before, src, after) => {
			if (isAbsoluteUrl(src)) return _match;
			const mediaPath = src.startsWith("/")
				? src.slice(1)
				: `${dir ? dir + "/" : ""}${src.replace(/^\.\//, "")}`;
			const resolved = buildImageProxyUrl(
				ctx.owner,
				ctx.repo,
				ctx.branch,
				mediaPath,
			);
			return `${before}${resolved}${after}`;
		},
	);

	// Resolve <video> src/poster
	html = html.replace(
		/(<video\s[^>]*?(?:src|poster)=")([^"]+)(")/gi,
		(_match, before, src, after) => {
			if (isAbsoluteUrl(src)) return _match;
			const mediaPath = src.startsWith("/")
				? src.slice(1)
				: `${dir ? dir + "/" : ""}${src.replace(/^\.\//, "")}`;
			const resolved = buildImageProxyUrl(
				ctx.owner,
				ctx.repo,
				ctx.branch,
				mediaPath,
			);
			return `${before}${resolved}${after}`;
		},
	);

	return html;
}

// Convert GitHub alert syntax: > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
function processAlerts(html: string): string {
	const alertTypes: Record<string, { icon: string; className: string; label: string }> = {
		NOTE: {
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
			className: "ghmd-alert-note",
			label: "Note",
		},
		TIP: {
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>',
			className: "ghmd-alert-tip",
			label: "Tip",
		},
		IMPORTANT: {
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
			className: "ghmd-alert-important",
			label: "Important",
		},
		WARNING: {
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
			className: "ghmd-alert-warning",
			label: "Warning",
		},
		CAUTION: {
			icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
			className: "ghmd-alert-caution",
			label: "Caution",
		},
	};

	for (const [type, config] of Object.entries(alertTypes)) {
		const regex = new RegExp(
			`<blockquote>\\s*<p>\\[!${type}\\]\\s*(<br>|<br\\s*/>)?\\s*`,
			"gi",
		);
		html = html.replace(regex, () => {
			return `<div class="ghmd-alert ${config.className}"><p class="ghmd-alert-title">${config.icon} ${config.label}</p><p>`;
		});
		if (html.includes(`ghmd-alert-${type.toLowerCase()}`)) {
			html = html.replace(
				new RegExp(
					`(class="ghmd-alert ${config.className}"[\\s\\S]*?)<\\/blockquote>`,
					"g",
				),
				"$1</div>",
			);
		}
	}

	return html;
}

/** Add id anchors to headings */
function addHeadingAnchors(html: string): string {
	return html.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/gi, (_match, tag, content) => {
		const text = content.replace(/<[^>]+>/g, "").trim();
		const id = text
			.toLowerCase()
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-");
		return `<${tag} id="${id}">${content}</${tag}>`;
	});
}

/** Convert #123 issue/PR references (outside of code/links) to issue links */
function linkifyIssueReferences(html: string, owner: string, repo: string): string {
	const parts = html.split(/(<[^>]+>)/);
	let inCode = 0;
	let inLink = 0;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part.startsWith("<")) {
			const lower = part.toLowerCase();
			if (lower.startsWith("<code") || lower.startsWith("<pre")) inCode++;
			else if (lower.startsWith("</code") || lower.startsWith("</pre")) inCode--;
			else if (lower.startsWith("<a ") || lower.startsWith("<a>")) inLink++;
			else if (lower.startsWith("</a")) inLink--;
			continue;
		}
		if (inCode > 0 || inLink > 0) continue;
		// Match #123 not preceded by & (HTML entities) or word chars
		parts[i] = part.replace(
			/(^|[^&\w])#(\d+)\b/g,
			(_m, prefix, num) =>
				`${prefix}<a href="/${owner}/${repo}/issues/${num}" class="ghmd-issue-ref">#${num}</a>`,
		);
	}
	return parts.join("");
}

/** Convert @username mentions (outside of code/links) to profile links */
function linkifyMentions(html: string): string {
	// Split on tags to avoid replacing inside <a>, <code>, <pre> content
	const parts = html.split(/(<[^>]+>)/);
	let inCode = 0;
	let inLink = 0;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part.startsWith("<")) {
			const lower = part.toLowerCase();
			if (lower.startsWith("<code") || lower.startsWith("<pre")) inCode++;
			else if (lower.startsWith("</code") || lower.startsWith("</pre")) inCode--;
			else if (lower.startsWith("<a ") || lower.startsWith("<a>")) inLink++;
			else if (lower.startsWith("</a")) inLink--;
			continue;
		}
		if (inCode > 0 || inLink > 0) continue;
		// Match @username (GitHub usernames: alphanumeric + hyphens, 1-39 chars)
		parts[i] = part.replace(
			/(^|[^/\w])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\b/g,
			(_m, prefix, username) =>
				`${prefix}<a href="/users/${username}" class="ghmd-mention"><svg class="ghmd-mention-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M10.561 8.073a6 6 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6 6 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>@${username}</a>`,
		);
	}
	return parts.join("");
}

/** Mark <p> tags that contain only images/badge links as .ghmd-badges so they render inline */
function markBadgeParagraphs(html: string): string {
	// Match <p> tags (with or without attributes) whose content is only
	// <a><img></a> and/or <img> elements, separated by optional whitespace/br tags
	return html.replace(
		/<p(\s[^>]*)?>(([\s]*(?:<br\s*\/?>[\s]*)*(?:<a\s[^>]*>\s*<img\s[^>]*\/?>\s*<\/a>|<img\s[^>]*\/?>)[\s]*(?:<br\s*\/?>[\s]*)*)+)<\/p>/gi,
		(_match, attrs, content) => {
			const existing = attrs || "";
			if (/class\s*=\s*"/i.test(existing)) {
				// Append to existing class attribute
				const newAttrs = existing.replace(
					/class\s*=\s*"/i,
					'class="ghmd-badges ',
				);
				return `<p${newAttrs}>${content}</p>`;
			}
			return `<p${existing} class="ghmd-badges">${content}</p>`;
		},
	);
}

interface PkgVariant {
	label: string;
	command: string;
}

function getInstallVariants(code: string): PkgVariant[] | null {
	const trimmed = code.trim();
	// Only single-line install commands
	if (trimmed.includes("\n")) return null;

	// Strip optional leading $ or >
	const line = trimmed.replace(/^[$>]\s+/, "");

	// npx command
	if (/^npx\s+/.test(line)) {
		const args = line.replace(/^npx\s+/, "");
		return [
			{ label: "npm", command: `npx ${args}` },
			{ label: "yarn", command: `yarn dlx ${args}` },
			{ label: "pnpm", command: `pnpm dlx ${args}` },
			{ label: "bun", command: `bunx ${args}` },
		];
	}

	// npm install / npm i / npm add
	const match = line.match(/^npm\s+(?:install|i|add)(\s+.*)?$/);
	if (!match) return null;

	const rest = (match[1] || "").trim();

	if (!rest) {
		return [
			{ label: "npm", command: "npm install" },
			{ label: "yarn", command: "yarn" },
			{ label: "pnpm", command: "pnpm install" },
			{ label: "bun", command: "bun install" },
		];
	}

	const isGlobal = /(?:^|\s)(-g|--global)(?:\s|$)/.test(rest);
	const isDev = /(?:^|\s)(-D|--save-dev)(?:\s|$)/.test(rest);
	const packages = rest.replace(/(-g|--global|-D|--save-dev)\s*/g, "").trim();

	if (isGlobal) {
		return [
			{ label: "npm", command: `npm install -g ${packages}` },
			{ label: "yarn", command: `yarn global add ${packages}` },
			{ label: "pnpm", command: `pnpm add -g ${packages}` },
			{ label: "bun", command: `bun add -g ${packages}` },
		];
	}

	if (isDev) {
		return [
			{ label: "npm", command: `npm install -D ${packages}` },
			{ label: "yarn", command: `yarn add -D ${packages}` },
			{ label: "pnpm", command: `pnpm add -D ${packages}` },
			{ label: "bun", command: `bun add -D ${packages}` },
		];
	}

	return [
		{ label: "npm", command: `npm install ${packages}` },
		{ label: "yarn", command: `yarn add ${packages}` },
		{ label: "pnpm", command: `pnpm add ${packages}` },
		{ label: "bun", command: `bun add ${packages}` },
	];
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function buildInstallTabsHtml(variants: PkgVariant[], id: number): string {
	const name = `pkgtab-${id}`;
	let html = '<div class="ghmd-pkg-tabs">';
	// Tab row: inputs + labels + trailing border fill
	for (let i = 0; i < variants.length; i++) {
		const rid = `${name}-${i}`;
		html += `<input type="radio" name="${name}" id="${rid}"${i === 0 ? " checked" : ""}>`;
		html += `<label for="${rid}">${variants[i].label}</label>`;
	}
	html += '<span class="ghmd-pkg-fill"></span>';
	// Panels with copy button
	for (let i = 0; i < variants.length; i++) {
		const cmd = escapeHtml(variants[i].command);
		html += `<div class="ghmd-pkg-panel"><code>${cmd}</code><button class="ghmd-pkg-copy" data-copy="${cmd}" title="Copy to clipboard"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>`;
	}
	html += "</div>";
	return html;
}

export async function renderMarkdownToHtml(
	content: string,
	repoContext?: RepoContext,
	issueRefContext?: { owner: string; repo: string },
): Promise<string> {
	const codeBlocks: { code: string; lang: string; id: number }[] = [];
	const installBlocks: { id: number; html: string }[] = [];
	let blockId = 0;

	const processed = content.replace(
		/```([\w+#.-]*)\n([\s\S]*?)```/g,
		(_match, lang, code) => {
			const id = blockId++;
			const variants = getInstallVariants(code.trimEnd());
			if (variants) {
				installBlocks.push({
					id,
					html: buildInstallTabsHtml(variants, id),
				});
				return `<div data-install-block="${id}"></div>`;
			}
			codeBlocks.push({ code: code.trimEnd(), lang: lang || "text", id });
			return `<div data-code-block="${id}"></div>`;
		},
	);

	const result = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(rehypeSanitize, sanitizeSchema)
		.use(rehypeStringify)
		.process(processed);

	let html = String(result);

	const renderedBlocks = await Promise.all(
		codeBlocks.map(async (block) => ({
			id: block.id,
			html: await highlightCode(block.code, block.lang),
		})),
	);

	for (const block of renderedBlocks) {
		html = html.replace(`<div data-code-block="${block.id}"></div>`, block.html);
	}

	for (const block of installBlocks) {
		html = html.replace(`<div data-install-block="${block.id}"></div>`, block.html);
	}

	html = processAlerts(html);
	html = addHeadingAnchors(html);
	html = markBadgeParagraphs(html);

	if (repoContext) {
		html = resolveUrls(html, repoContext);
	}

	// Convert github.com links to internal app paths
	html = html.replace(/<a\s+href="(https:\/\/github\.com\/[^"]+)"/gi, (_match, href) => {
		const internal = toInternalUrl(href);
		if (internal !== href) return `<a href="${internal}"`;
		return _match;
	});

	// Add target="_blank" only to external (absolute http) links
	html = html.replace(
		/<a\s+href="(https?:\/\/[^"]+)"/gi,
		'<a href="$1" target="_blank" rel="noopener noreferrer"',
	);

	html = linkifyMentions(html);

	// Linkify #123 references when repo context is available
	const refCtx =
		issueRefContext ||
		(repoContext ? { owner: repoContext.owner, repo: repoContext.repo } : undefined);
	if (refCtx) {
		html = linkifyIssueReferences(html, refCtx.owner, refCtx.repo);
	}

	return html;
}

export async function MarkdownRenderer({
	content,
	className,
	repoContext,
	issueRefContext,
}: {
	content: string;
	className?: string;
	repoContext?: RepoContext;
	issueRefContext?: { owner: string; repo: string };
}) {
	const html = await renderMarkdownToHtml(content, repoContext, issueRefContext);

	return (
		<MarkdownCopyHandler>
			<div
				className={`ghmd ${className || ""}`}
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</MarkdownCopyHandler>
	);
}
