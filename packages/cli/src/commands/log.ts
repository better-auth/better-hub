import { Command } from "commander";
import pc from "picocolors";
import terminalLink from "terminal-link";
import { log, outro } from "@clack/prompts";
import { betterHubIntro } from "../lib/intro.js";
import { getBaseUrl } from "../lib/config.js";
import { execFileSync } from "child_process";

// ─── Git Helpers ─────────────────────────────────────────────

let _repoRoot: string | undefined;
function repoRoot(): string {
	if (!_repoRoot) {
		_repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			encoding: "utf-8",
		}).trim();
	}
	return _repoRoot;
}

function git(...args: string[]): string {
	return execFileSync("git", args, {
		encoding: "utf-8",
		cwd: repoRoot(),
		stdio: "pipe",
		maxBuffer: 10 * 1024 * 1024,
	}).trim();
}

function gitSafe(...args: string[]): string | null {
	try {
		return git(...args);
	} catch {
		return null;
	}
}

// ─── Repo / URL Helpers ──────────────────────────────────────

let _repoSlug: string | null | undefined;
function getRepoSlug(): string | null {
	if (_repoSlug !== undefined) return _repoSlug;
	const url =
		gitSafe("remote", "get-url", "origin") ??
		gitSafe("remote", "get-url", "better-hub");
	if (!url) return (_repoSlug = null);
	const match = url.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
	return (_repoSlug = match ? `${match[1]}/${match[2]}` : null);
}

function commitUrl(hash: string): string | null {
	const slug = getRepoSlug();
	return slug ? `${getBaseUrl()}/${slug}/commit/${hash}` : null;
}

function authorUrl(name: string): string | null {
	const slug = getRepoSlug();
	return slug ? `${getBaseUrl()}/${name.replace(/\s+/g, "")}` : null;
}

/** Terminal hyperlink — same pattern as `status.ts` */
function link(text: string, url: string | null): string {
	if (!url) return text;
	return terminalLink(text, url, { fallback: () => text });
}

// ─── Constants ───────────────────────────────────────────────

const SEP = "\x01";
const FORMAT = `${SEP}%h${SEP}%H${SEP}%an${SEP}%at${SEP}%s${SEP}%d${SEP}%p`;

/** Cap layout width on very wide terminals so the graph + columns don’t span the full screen. */
const MAX_LOG_LAYOUT_WIDTH = 200;

const LANE_COLORS = [pc.cyan, pc.magenta, pc.green, pc.yellow, pc.blue, pc.red] as const;

// ─── Types ───────────────────────────────────────────────────

interface CommitLine {
	type: "commit";
	graph: string;
	hash: string;
	fullHash: string;
	author: string;
	timestamp: number;
	subject: string;
	refs: string;
	parentHashes: string[];
	lane: number;
}

interface GraphOnlyLine {
	type: "graph";
	graph: string;
}

type LogLine = CommitLine | GraphOnlyLine;

// ─── Parsing ─────────────────────────────────────────────────

function parseLogOutput(raw: string): LogLine[] {
	const lines: LogLine[] = [];

	for (const line of raw.split("\n")) {
		if (!line && lines.length === 0) continue;

		const sepIdx = line.indexOf(SEP);
		if (sepIdx >= 0) {
			const graphPart = line.slice(0, sepIdx);
			const parts = line.slice(sepIdx + 1).split(SEP);
			const lane = graphPart.indexOf("*");

			lines.push({
				type: "commit",
				graph: graphPart,
				hash: parts[0] ?? "",
				fullHash: parts[1] ?? "",
				author: parts[2] ?? "",
				timestamp: parseInt(parts[3] ?? "0"),
				subject: parts[4] ?? "",
				refs: (parts[5] ?? "").trim(),
				parentHashes: (parts[6] ?? "").trim().split(" ").filter(Boolean),
				lane: lane >= 0 ? lane : 0,
			});
		} else {
			if (line.trim() || lines.length > 0) {
				lines.push({ type: "graph", graph: line });
			}
		}
	}

	return lines;
}

// ─── Graph Beautification ────────────────────────────────────

function laneColor(lane: number): (s: string) => string {
	return LANE_COLORS[lane % LANE_COLORS.length]!;
}

function beautifyGraph(raw: string, isHead: boolean, isMerge: boolean): string {
	let result = "";

	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i]!;

		if (ch === " ") {
			result += " ";
			continue;
		}

		const lane = Math.round(i / 2);
		const color = laneColor(lane);

		switch (ch) {
			case "*":
				if (isHead) {
					result += color(pc.bold("◉"));
				} else if (isMerge) {
					result += color("◆");
				} else {
					result += color("●");
				}
				break;
			case "|":
				result += color("│");
				break;
			case "-":
				result += color("─");
				break;
			case "_":
				result += color("─");
				break;
			case ".":
				result += color("·");
				break;
			case "/":
				result += color("╱");
				break;
			case "\\":
				result += color("╲");
				break;
			default:
				result += color(ch);
		}
	}

	return result;
}

// ─── Time ────────────────────────────────────────────────────

function relativeTime(epochSec: number): string {
	const delta = Math.floor(Date.now() / 1000) - epochSec;
	if (delta < 60) return "just now";

	const minutes = Math.floor(delta / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (years > 0) return `${years}y ago`;
	if (months > 0) return `${months}mo ago`;
	if (weeks > 0) return `${weeks}w ago`;
	if (days > 0) return `${days}d ago`;
	if (hours > 0) return `${hours}h ago`;
	return `${minutes}m ago`;
}

// ─── Decorations ─────────────────────────────────────────────

function renderRefs(raw: string): string {
	if (!raw) return "";

	const inner = raw.replace(/^\s*\(/, "").replace(/\)\s*$/, "");
	if (!inner) return "";

	const parts = inner.split(",").map((s) => s.trim());
	const rendered = parts.map((part) => {
		if (part.startsWith("HEAD -> ")) {
			const branch = part.slice(8);
			return `${pc.bold(pc.red("HEAD"))} ${pc.dim("→")} ${pc.bold(pc.green(branch))}`;
		}
		if (part === "HEAD") {
			return pc.bold(pc.red("HEAD"));
		}
		if (part.startsWith("tag: ")) {
			return pc.bold(pc.yellow(`⚑ ${part.slice(5)}`));
		}
		if (part.startsWith("origin/")) {
			return pc.red(part);
		}
		return pc.bold(pc.green(part));
	});

	return ` ${pc.dim("‹")}${rendered.join(pc.dim(", "))}${pc.dim("›")}`;
}

// ─── Stats ───────────────────────────────────────────────────

interface DiffStat {
	files: number;
	additions: number;
	deletions: number;
}

function getCommitStat(hash: string): DiffStat | null {
	const raw = gitSafe("show", "--stat", "--format=", hash);
	if (!raw) return null;

	const lines = raw.split("\n").filter(Boolean);
	const summary = lines[lines.length - 1];
	if (!summary) return null;

	const filesMatch = summary.match(/(\d+) files? changed/);
	const addMatch = summary.match(/(\d+) insertions?/);
	const delMatch = summary.match(/(\d+) deletions?/);

	return {
		files: parseInt(filesMatch?.[1] ?? "0"),
		additions: parseInt(addMatch?.[1] ?? "0"),
		deletions: parseInt(delMatch?.[1] ?? "0"),
	};
}

// ─── Subject Formatting ──────────────────────────────────────

const COMMIT_TYPE_COLORS: Record<string, (s: string) => string> = {
	feat: pc.green,
	fix: pc.red,
	refactor: pc.blue,
	chore: pc.yellow,
	docs: pc.cyan,
	style: pc.magenta,
	test: pc.yellow,
	perf: pc.yellow,
	ci: pc.dim,
	build: pc.dim,
	revert: pc.red,
	add: pc.green,
};

function formatSubject(raw: string, bold: boolean): string {
	const match = raw.match(/^(\w+)(\(.+?\))?(!)?:\s*(.*)$/);
	if (match) {
		const [, type, scope, bang, rest] = match;
		const colorFn = COMMIT_TYPE_COLORS[type!.toLowerCase()] ?? pc.white;
		const typeStr = colorFn(pc.bold(type!));
		const scopeStr = scope ? pc.dim(scope) : "";
		const bangStr = bang ? pc.red(pc.bold("!")) : "";
		const restStr = bold ? pc.bold(pc.white(rest!)) : pc.white(rest!);
		return `${typeStr}${scopeStr}${bangStr}${pc.dim(":")} ${restStr}`;
	}

	if (raw.startsWith("Merge ")) {
		return `${pc.dim("Merge")} ${pc.white(raw.slice(6))}`;
	}

	return bold ? pc.bold(pc.white(raw)) : pc.white(raw);
}

// ─── Rendering ───────────────────────────────────────────────

const CLACK_PREFIX_W = 3; // clack's `│  ` prefix on each line

function visibleLength(str: string): number {
	return str.replace(/\x1B\]8;[^\x07]*\x07/g, "").replace(/\x1B\[[0-9;]*m/g, "").length;
}

function skipEscape(str: string, i: number): number {
	if (str[i] !== "\x1B") return i;

	if (str[i + 1] === "[") {
		// CSI sequence — skip to 'm'
		let j = i + 2;
		while (j < str.length && str[j] !== "m") j++;
		return j + 1;
	}

	if (str[i + 1] === "]") {
		// OSC sequence — skip to BEL (\x07) or ST (\x1B\\)
		let j = i + 2;
		while (j < str.length) {
			if (str[j] === "\x07") return j + 1;
			if (str[j] === "\x1B" && str[j + 1] === "\\") return j + 2;
			j++;
		}
		return j;
	}

	return i + 1;
}

function truncateLine(str: string, maxVisible: number): string {
	if (maxVisible <= 0) return "";
	const currentLen = visibleLength(str);
	if (currentLen <= maxVisible) return str;

	const target = maxVisible - 1;
	let visible = 0;
	let i = 0;

	while (i < str.length && visible < target) {
		if (str[i] === "\x1B") {
			i = skipEscape(str, i);
		} else if (str[i] === "\x07") {
			i++;
		} else {
			visible++;
			i++;
		}
	}

	return str.slice(0, i) + "\x1B[0m…";
}

function padRight(str: string, width: number): string {
	const visible = visibleLength(str);
	return visible >= width ? str : str + " ".repeat(width - visible);
}

function continuationGraphFor(commitGraph: string): string {
	return commitGraph.replace(/\*/g, "|");
}

function renderFullGraph(lines: LogLine[], opts: { stat?: boolean; termWidth: number }): string {
	const commits = lines.filter((l): l is CommitLine => l.type === "commit");
	if (commits.length === 0) return pc.dim("  No commits found.");

	const currentHead = gitSafe("rev-parse", "HEAD");

	const maxGraphLen = Math.max(...lines.map((l) => l.graph.length), 0);
	const maxAuthorLen = Math.min(Math.max(...commits.map((c) => c.author.length), 0), 16);
	const maxTimeLen = Math.max(...commits.map((c) => relativeTime(c.timestamp).length), 0);

	// Git abbreviates %h to more characters in large repos (often 7, sometimes 9+).
	const HASH_W = Math.max(7, ...commits.map((c) => c.hash.length));
	const rightColW = maxAuthorLen + 2 + maxTimeLen;
	const contentW = opts.termWidth - CLACK_PREFIX_W;
	const subjectColW = contentW - maxGraphLen - 1 - HASH_W - 2 - rightColW - 2;

	const statCache = new Map<string, DiffStat | null>();
	let maxStatTotal = 0;
	if (opts.stat) {
		for (const c of commits) {
			const stat = getCommitStat(c.hash);
			statCache.set(c.hash, stat);
			if (stat) {
				maxStatTotal = Math.max(
					maxStatTotal,
					stat.additions + stat.deletions,
				);
			}
		}
	}

	const output: string[] = [];

	for (const line of lines) {
		if (line.type === "graph") {
			if (!line.graph.trim() && output.length === 0) continue;
			output.push(beautifyGraph(line.graph, false, false));
			continue;
		}

		const isHead = line.fullHash === currentHead;
		const isMerge = line.parentHashes.length > 1;

		const graph = beautifyGraph(line.graph, isHead, isMerge);
		const graphPad = " ".repeat(Math.max(0, maxGraphLen - line.graph.length));

		const hashColored = link(
			pc.dim(pc.yellowBright(line.hash)),
			commitUrl(line.fullHash),
		);

		const authorTrunc =
			line.author.length > maxAuthorLen
				? line.author.slice(0, maxAuthorLen - 1) + "…"
				: line.author;
		const authorColored = padRight(
			link(pc.cyan(authorTrunc), authorUrl(line.author)),
			maxAuthorLen,
		);

		const time = relativeTime(line.timestamp);
		const timeColored = pc.dim(time.padStart(maxTimeLen));

		const refs = renderRefs(line.refs);
		const refsVisLen = visibleLength(refs);

		const refsOverflow = refsVisLen > 0 && subjectColW - refsVisLen < 30;

		let subject = line.subject;
		if (refsOverflow) {
			if (subject.length > subjectColW) {
				subject = subject.slice(0, subjectColW - 1) + "…";
			}
		} else {
			const availSubject = Math.max(10, subjectColW - refsVisLen);
			if (subject.length > availSubject) {
				subject = subject.slice(0, availSubject - 1) + "…";
			}
		}

		const subjectColored = link(
			formatSubject(subject, isHead),
			commitUrl(line.fullHash),
		);

		if (refsOverflow) {
			const paddedSubject = padRight(subjectColored, subjectColW);
			output.push(
				`${graph}${graphPad} ${hashColored}  ${paddedSubject}  ${authorColored}  ${timeColored}`,
			);

			const contGraph = continuationGraphFor(line.graph);
			const contBeautified = beautifyGraph(contGraph, false, false);
			const contPad = " ".repeat(Math.max(0, maxGraphLen - contGraph.length));
			const refsLinePrefix = `${contBeautified}${contPad} ${" ".repeat(HASH_W)}  `;
			const refsAvail = contentW - maxGraphLen - 1 - HASH_W - 2;
			const refsTruncated =
				visibleLength(refs.trimStart()) > refsAvail
					? truncateLine(refs.trimStart(), refsAvail)
					: refs.trimStart();
			output.push(`${refsLinePrefix}${refsTruncated}`);
		} else {
			const subjectAndRefs = `${subjectColored}${refs}`;
			const paddedSubject = padRight(subjectAndRefs, subjectColW);
			output.push(
				`${graph}${graphPad} ${hashColored}  ${paddedSubject}  ${authorColored}  ${timeColored}`,
			);
		}

		if (opts.stat) {
			const stat = statCache.get(line.hash);
			if (stat && (stat.additions > 0 || stat.deletions > 0)) {
				const contGraph = continuationGraphFor(line.graph);
				const contBeautified = beautifyGraph(contGraph, false, false);
				const contPad = " ".repeat(
					Math.max(0, maxGraphLen - contGraph.length),
				);
				output.push(
					`${contBeautified}${contPad} ${" ".repeat(HASH_W)}  ${renderStatBar(stat, Math.min(20, subjectColW), maxStatTotal)}`,
				);
			}
		}
	}

	return output.map((l) => truncateLine(l, contentW)).join("\n");
}

function renderStatBar(stat: DiffStat, maxBarWidth: number, maxTotal: number): string {
	const total = stat.additions + stat.deletions;
	const barWidth = Math.max(1, Math.round((total / Math.max(maxTotal, 1)) * maxBarWidth));
	const addW = Math.max(
		stat.additions > 0 ? 1 : 0,
		Math.round((stat.additions / Math.max(total, 1)) * barWidth),
	);
	const delW = Math.max(stat.deletions > 0 ? 1 : 0, barWidth - addW);

	const bar = pc.green("▓".repeat(addW)) + pc.red("▓".repeat(delW));
	const nums: string[] = [];
	if (stat.additions > 0) nums.push(pc.green(`+${stat.additions}`));
	if (stat.deletions > 0) nums.push(pc.red(`-${stat.deletions}`));
	return `${pc.dim(`${stat.files}f`)} ${nums.join(" ")}  ${bar}`;
}

function renderOneline(lines: LogLine[], opts: { termWidth: number }): string {
	const commits = lines.filter((l): l is CommitLine => l.type === "commit");
	if (commits.length === 0) return pc.dim("  No commits found.");

	const currentHead = gitSafe("rev-parse", "HEAD");
	const contentW = opts.termWidth - CLACK_PREFIX_W;
	const hashW = Math.max(7, ...commits.map((c) => c.hash.length));

	const maxGraphLen = Math.max(...lines.map((l) => l.graph.length), 0);

	const output: string[] = [];

	for (const line of lines) {
		if (line.type === "graph") {
			if (!line.graph.trim() && output.length === 0) continue;
			output.push(beautifyGraph(line.graph, false, false));
			continue;
		}

		const isHead = line.fullHash === currentHead;
		const isMerge = line.parentHashes.length > 1;

		const graph = beautifyGraph(line.graph, isHead, isMerge);
		const graphPad = " ".repeat(Math.max(0, maxGraphLen - line.graph.length));

		const hashColored = link(pc.yellow(line.hash), commitUrl(line.fullHash));

		const refs = renderRefs(line.refs);
		const refsVisLen = visibleLength(refs);

		const available = contentW - maxGraphLen - 1 - hashW - 2 - refsVisLen;
		let subject = line.subject;
		if (subject.length > available && available > 10) {
			subject = subject.slice(0, available - 1) + "…";
		}

		const subjectColored = link(
			formatSubject(subject, isHead),
			commitUrl(line.fullHash),
		);

		output.push(`${graph}${graphPad} ${hashColored}  ${subjectColored}${refs}`);
	}

	return output.map((l) => truncateLine(l, contentW)).join("\n");
}

// ─── Branch Header ───────────────────────────────────────────

function renderBranchHeader(showAll: boolean): string {
	const head = gitSafe("symbolic-ref", "--short", "HEAD");
	const detached = head === null;
	const name = detached ? (gitSafe("rev-parse", "--short", "HEAD") ?? "???") : head;

	const icon = detached ? pc.red("⊘") : pc.cyan("⎇");
	const branchName = detached
		? `${pc.red("detached")} at ${pc.cyan(name)}`
		: pc.bold(pc.cyan(name));

	const scope = showAll ? pc.dim("  (all branches)") : "";

	return `${icon} ${branchName}${scope}`;
}

// ─── Summary Footer ──────────────────────────────────────────

function renderSummary(commits: CommitLine[]): string {
	if (commits.length === 0) return "";

	const authors = new Set(commits.map((c) => c.author));
	const merges = commits.filter((c) => c.parentHashes.length > 1).length;
	const oldest = Math.min(...commits.map((c) => c.timestamp));
	const newest = Math.max(...commits.map((c) => c.timestamp));

	const parts: string[] = [];
	parts.push(pc.bold(`${commits.length}`) + pc.gray(" commits"));
	parts.push(
		pc.bold(`${authors.size}`) + pc.gray(authors.size === 1 ? " author" : " authors"),
	);
	if (merges > 0) {
		parts.push(pc.bold(`${merges}`) + pc.gray(merges === 1 ? " merge" : " merges"));
	}

	if (oldest !== newest) {
		parts.push(
			pc.gray(`${relativeTime(newest)} ${pc.dim("→")} ${relativeTime(oldest)}`),
		);
	}

	return parts.join(pc.dim("  ·  "));
}

// ─── Command ─────────────────────────────────────────────────

export const logCommand = new Command("log")
	.alias("l")
	.alias("lg")
	.description("Show a beautiful commit graph log")
	.option("-n, --count <n>", "Number of commits to show", "20")
	.option("-a, --all", "Show all branches")
	.option("--oneline", "Compact one-line output")
	.option("--stat", "Show file change stats per commit")
	.option("--no-graph", "Disable graph rendering")
	.option("--author <name>", "Filter commits by author")
	.option("--since <date>", "Show commits after date")
	.option("--until <date>", "Show commits before date")
	.option("--grep <pattern>", "Filter commits by message pattern")
	.option("--reverse", "Show commits in reverse order")
	.argument("[path...]", "Limit to commits touching these paths")
	.action(
		async (
			paths: string[],
			opts: {
				count: string;
				all?: boolean;
				oneline?: boolean;
				stat?: boolean;
				graph?: boolean;
				author?: string;
				since?: string;
				until?: string;
				grep?: string;
				reverse?: boolean;
			},
		) => {
			try {
				repoRoot();
			} catch {
				log.error("Not inside a git repository.");
				process.exit(1);
			}

			betterHubIntro("Log");

			log.info(renderBranchHeader(opts.all ?? false));

			const args: string[] = ["log", `-${opts.count}`, `--format=${FORMAT}`];

			if (opts.graph !== false) {
				args.push("--graph");
			}
			if (opts.all) args.push("--all");
			if (opts.author) args.push(`--author=${opts.author}`);
			if (opts.since) args.push(`--since=${opts.since}`);
			if (opts.until) args.push(`--until=${opts.until}`);
			if (opts.grep) args.push(`--grep=${opts.grep}`);
			if (opts.reverse) args.push("--reverse");

			if (paths.length > 0) {
				args.push("--");
				args.push(...paths);
			}

			const raw = gitSafe(...args);
			if (!raw) {
				log.warn("No commits found.");
				outro(pc.dim("Try adjusting your filters."));
				return;
			}

			const parsed = parseLogOutput(raw);
			const commits = parsed.filter((l): l is CommitLine => l.type === "commit");

			const envCols = process.env["COLUMNS"]
				? parseInt(process.env["COLUMNS"])
				: 0;
			const rawWidth = process.stdout.columns ?? (envCols || 100);
			const termWidth = Math.min(rawWidth, MAX_LOG_LAYOUT_WIDTH);

			if (opts.oneline) {
				log.message(renderOneline(parsed, { termWidth }));
			} else {
				log.message(
					renderFullGraph(parsed, {
						stat: opts.stat ?? false,
						termWidth,
					}),
				);
			}

			// Summary footer
			log.message("");
			outro(renderSummary(commits));
		},
	);
