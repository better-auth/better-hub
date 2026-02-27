export const LANGUAGE_COLORS: Record<string, string> = {
	TypeScript: "#3178c6",
	JavaScript: "#f1e05a",
	Python: "#3572A5",
	Rust: "#dea584",
	Go: "#00ADD8",
	Java: "#b07219",
	Ruby: "#701516",
	Swift: "#F05138",
	Kotlin: "#A97BFF",
	"C++": "#f34b7d",
	C: "#555555",
	"C#": "#178600",
	PHP: "#4F5D95",
	Vue: "#41b883",
	Svelte: "#ff3e00",
	HTML: "#e34c26",
	CSS: "#563d7c",
	SCSS: "#c6538c",
	Shell: "#89e051",
	Dart: "#00b4ab",
	Scala: "#c22d40",
	Elixir: "#6e4a7e",
	Erlang: "#b83998",
	Haskell: "#5e5086",
	Lua: "#000080",
	R: "#198ce7",
	Perl: "#0298c3",
	Julia: "#a270ba",
	Clojure: "#db5855",
	"Objective-C": "#438eff",
	Zig: "#ec915c",
	Nim: "#ffc200",
	OCaml: "#3be133",
	Nix: "#7e7eff",
	Dockerfile: "#384d54",
	Makefile: "#427819",
	HCL: "#844fba",
	Terraform: "#5c4ee5",
	YAML: "#cb171e",
	Markdown: "#083fa1",
	Jupyter: "#DA5B0B",
	Astro: "#ff5a03",
};

const DEFAULT_LANG_COLOR = "#8b949e";

export function getLanguageColor(language: string | null | undefined): string {
	if (!language) return DEFAULT_LANG_COLOR;
	return LANGUAGE_COLORS[language] ?? DEFAULT_LANG_COLOR;
}

/**
 * Deduplicates an array of user-like objects into unique participants by login.
 */
export function extractParticipants(
	users: ({ login: string; avatar_url: string } | null | undefined)[],
): { login: string; avatar_url: string }[] {
	const seen = new Set<string>();
	const result: { login: string; avatar_url: string }[] = [];
	for (const u of users) {
		if (u && !seen.has(u.login)) {
			seen.add(u.login);
			result.push({ login: u.login, avatar_url: u.avatar_url });
		}
	}
	return result;
}

export function parseRefAndPath(
	pathSegments: string[],
	branchNames: string[],
): { ref: string; path: string } {
	// Sort branches by length (longest first) for greedy matching
	const sorted = [...branchNames].sort((a, b) => b.length - a.length);
	const joined = pathSegments.join("/");

	for (const branch of sorted) {
		const branchParts = branch.split("/");
		if (pathSegments.length >= branchParts.length) {
			const candidate = pathSegments.slice(0, branchParts.length).join("/");
			if (candidate === branch) {
				const remaining = pathSegments.slice(branchParts.length).join("/");
				return { ref: branch, path: remaining };
			}
		}
	}

	// Default: first segment is the ref
	return { ref: pathSegments[0] || "main", path: pathSegments.slice(1).join("/") };
}

export function toInternalUrl(htmlUrl: string): string {
	const parsed = parseGitHubUrl(htmlUrl);
	if (!parsed) return htmlUrl;

	if (parsed.type === "user") return `/users/${parsed.owner}`;

	const base = `/${parsed.owner}/${parsed.repo}`;

	if (parsed.type === "download")
		return `${base}/releases/download/${encodeURIComponent(parsed.tag)}/${parsed.filename}`;

	const { type, number, path } = parsed;
	if (type === "pull") return `${base}/pulls/${number}`;
	if (type === "issue") return `${base}/issues/${number}`;
	if (type === "tree" && path) return `${base}/tree/${path}`;
	if (type === "blob" && path) return `${base}/blob/${path}`;
	if (type === "commits") return `${base}/commits`;
	if (type === "commit" && path) return `${base}/commits/${path}`;
	if (type === "repo") return base;

	return htmlUrl;
}

/**
 * Converts a github.com URL to a full app URL using NEXT_PUBLIC_APP_URL.
 * Falls back to toInternalUrl (relative path) if env is not set.
 */
export function toAppUrl(htmlUrl: string): string {
	const internalPath = toInternalUrl(htmlUrl);
	// If toInternalUrl returned the original URL (couldn't parse), keep it
	if (internalPath === htmlUrl) return htmlUrl;
	const appBase = process.env.NEXT_PUBLIC_APP_URL;
	if (appBase) return `${appBase.replace(/\/$/, "")}${internalPath}`;
	return internalPath;
}

/** Known GitHub top-level paths that are NOT user profiles */
const GITHUB_NON_USER_PATHS = new Set([
	"settings",
	"explore",
	"trending",
	"topics",
	"collections",
	"events",
	"sponsors",
	"issues",
	"pulls",
	"codespaces",
	"marketplace",
	"notifications",
	"new",
	"login",
	"signup",
	"join",
	"organizations",
	"orgs",
	"about",
	"pricing",
	"security",
	"features",
	"enterprise",
	"team",
	"customer-stories",
	"readme",
	"search",
	"stars",
	"watching",
]);

type ParsedGitHubUrl =
	| {
			owner: string;
			repo: string;
			type: "repo" | "pull" | "issue" | "tree" | "blob" | "commits" | "commit";
			number?: number;
			path?: string;
	  }
	| {
			owner: string;
			repo: string;
			type: "download";
			tag: string;
			filename: string;
	  }
	| {
			owner: string;
			type: "user";
	  };

function parsePositiveInt(value: string | undefined): number | null {
	if (!value) return null;
	if (!/^\d+$/.test(value)) return null;
	const parsed = Number.parseInt(value, 10);
	return parsed > 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

export function parseGitHubUrl(htmlUrl: string): ParsedGitHubUrl | null {
	try {
		const url = new URL(htmlUrl);
		if (url.hostname !== "github.com") return null;

		const parts = url.pathname.split("/").filter(Boolean);
		if (parts.length === 0) return null;

		// Single segment: github.com/username
		if (parts.length === 1) {
			const name = parts[0];
			if (GITHUB_NON_USER_PATHS.has(name.toLowerCase())) return null;
			return { owner: name, type: "user" };
		}

		const [owner, repo, ...rest] = parts;

		if (rest.length === 0) return { owner, repo, type: "repo" };
		if (rest[0] === "pull" && rest[1]) {
			const number = parsePositiveInt(rest[1]);
			if (number === null) return null;
			return { owner, repo, type: "pull", number };
		}
		if (rest[0] === "issues" && rest[1]) {
			const number = parsePositiveInt(rest[1]);
			if (number === null) return null;
			return { owner, repo, type: "issue", number };
		}
		if (rest[0] === "tree")
			return { owner, repo, type: "tree", path: rest.slice(1).join("/") };
		if (rest[0] === "blob")
			return { owner, repo, type: "blob", path: rest.slice(1).join("/") };
		if (rest[0] === "commits" && rest.length === 1)
			return { owner, repo, type: "commits" };
		if (rest[0] === "commit" && rest[1])
			return { owner, repo, type: "commit", path: rest[1] };
		if (rest[0] === "releases" && rest[1] === "download" && rest[2] && rest[3])
			return {
				owner,
				repo,
				type: "download",
				tag: rest[2],
				filename: rest.slice(3).join("/"),
			};

		return { owner, repo, type: "repo" };
	} catch {
		return null;
	}
}

const extensionMap: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	py: "python",
	rb: "ruby",
	rs: "rust",
	go: "go",
	java: "java",
	kt: "kotlin",
	swift: "swift",
	c: "c",
	h: "c",
	cpp: "cpp",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	vue: "vue",
	svelte: "svelte",
	html: "html",
	htm: "html",
	css: "css",
	scss: "scss",
	less: "less",
	json: "json",
	ipynb: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	xml: "xml",
	md: "markdown",
	mdx: "mdx",
	sql: "sql",
	sh: "shellscript",
	bash: "shellscript",
	zsh: "shellscript",
	dockerfile: "dockerfile",
	docker: "dockerfile",
	makefile: "makefile",
	graphql: "graphql",
	gql: "graphql",
	lua: "lua",
	r: "r",
	dart: "dart",
	zig: "zig",
	ex: "elixir",
	exs: "elixir",
	erl: "erlang",
	hs: "haskell",
	ml: "ocaml",
	clj: "clojure",
	scala: "scala",
	tf: "hcl",
	prisma: "prisma",
	proto: "proto",
	ini: "ini",
	conf: "ini",
	env: "shellscript",
};

export function getLanguageFromFilename(filename: string): string {
	const lower = filename.toLowerCase();
	const basename = lower.split("/").pop() || lower;

	// Special filenames
	if (basename === "dockerfile") return "dockerfile";
	if (basename === "makefile") return "makefile";
	if (basename.endsWith(".d.ts")) return "typescript";

	const ext = basename.split(".").pop() || "";
	return extensionMap[ext] || "text";
}

export interface DiffSegment {
	text: string;
	highlight: boolean;
}

export interface DiffLine {
	type: "add" | "remove" | "context" | "header";
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
	segments?: DiffSegment[];
}

function computeWordDiff(
	oldStr: string,
	newStr: string,
): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } {
	// Find common prefix
	let prefixLen = 0;
	while (
		prefixLen < oldStr.length &&
		prefixLen < newStr.length &&
		oldStr[prefixLen] === newStr[prefixLen]
	) {
		prefixLen++;
	}
	// Find common suffix
	let suffixLen = 0;
	while (
		suffixLen < oldStr.length - prefixLen &&
		suffixLen < newStr.length - prefixLen &&
		oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
	) {
		suffixLen++;
	}

	const prefix = oldStr.slice(0, prefixLen);
	const oldMiddle = oldStr.slice(prefixLen, oldStr.length - suffixLen);
	const newMiddle = newStr.slice(prefixLen, newStr.length - suffixLen);
	const suffix = oldStr.slice(oldStr.length - suffixLen);

	const oldSegments: DiffSegment[] = [];
	const newSegments: DiffSegment[] = [];

	if (prefix) {
		oldSegments.push({ text: prefix, highlight: false });
		newSegments.push({ text: prefix, highlight: false });
	}
	if (oldMiddle) oldSegments.push({ text: oldMiddle, highlight: true });
	if (newMiddle) newSegments.push({ text: newMiddle, highlight: true });
	if (suffix) {
		oldSegments.push({ text: suffix, highlight: false });
		newSegments.push({ text: suffix, highlight: false });
	}

	return { oldSegments, newSegments };
}

export function parseDiffPatch(patch: string): DiffLine[] {
	if (!patch) return [];
	const lines = patch.split("\n");
	const raw: DiffLine[] = [];
	let oldLine = 0;
	let newLine = 0;

	for (const line of lines) {
		if (line.startsWith("@@")) {
			const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
			if (match) {
				oldLine = parseInt(match[1], 10);
				newLine = parseInt(match[2], 10);
			}
			raw.push({ type: "header", content: line });
		} else if (line.startsWith("+")) {
			raw.push({ type: "add", content: line.slice(1), newLineNumber: newLine });
			newLine++;
		} else if (line.startsWith("-")) {
			raw.push({
				type: "remove",
				content: line.slice(1),
				oldLineNumber: oldLine,
			});
			oldLine++;
		} else {
			raw.push({
				type: "context",
				content: line.startsWith(" ") ? line.slice(1) : line,
				oldLineNumber: oldLine,
				newLineNumber: newLine,
			});
			oldLine++;
			newLine++;
		}
	}

	// Second pass: pair consecutive remove/add blocks for word-level highlighting
	const result: DiffLine[] = [];
	let i = 0;
	while (i < raw.length) {
		if (raw[i].type === "remove") {
			const removes: DiffLine[] = [];
			while (i < raw.length && raw[i].type === "remove") {
				removes.push(raw[i]);
				i++;
			}
			const adds: DiffLine[] = [];
			while (i < raw.length && raw[i].type === "add") {
				adds.push(raw[i]);
				i++;
			}

			// Pair up for word-level diff
			const pairCount = Math.min(removes.length, adds.length);
			for (let j = 0; j < pairCount; j++) {
				const { oldSegments, newSegments } = computeWordDiff(
					removes[j].content,
					adds[j].content,
				);
				removes[j].segments = oldSegments;
				adds[j].segments = newSegments;
			}

			result.push(...removes, ...adds);
		} else {
			result.push(raw[i]);
			i++;
		}
	}

	return result;
}

export function parseHunkHeader(content: string): {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
} | null {
	const match = content.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
	if (!match) return null;
	return {
		oldStart: parseInt(match[1], 10),
		oldCount: match[2] !== undefined ? parseInt(match[2], 10) : 1,
		newStart: parseInt(match[3], 10),
		newCount: match[4] !== undefined ? parseInt(match[4], 10) : 1,
	};
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Encode file path segments that Next.js Link would interpret as dynamic routes */
export function encodeFilePath(path: string): string {
	return path
		.split("/")
		.map((s) =>
			s
				.replace(/\[/g, "%5B")
				.replace(/\]/g, "%5D")
				.replace(/\(/g, "%28")
				.replace(/\)/g, "%29"),
		)
		.join("/");
}
