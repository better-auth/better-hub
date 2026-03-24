import { Command } from "commander";
import pc from "picocolors";
import terminalLink from "terminal-link";
import { log, outro } from "@clack/prompts";
import { betterHubIntro } from "../lib/intro.js";
import { getBaseUrl } from "../lib/config.js";
import { getPreference } from "../lib/preferences.js";
import { execFileSync } from "child_process";

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
	}).trim();
}

function gitSafe(...args: string[]): string | null {
	try {
		return git(...args);
	} catch {
		return null;
	}
}

let _repoSlug: string | null | undefined;
function getRepoSlug(): string | null {
	if (_repoSlug !== undefined) return _repoSlug;
	let url: string | null = null;
	try {
		url =
			gitSafe("remote", "get-url", "origin") ??
			gitSafe("remote", "get-url", "better-hub");
	} catch (error) {
		if (!String(error).includes("No such remote")) {
			log.error(`Failed to get remote URL: ${error}`);
		}
	}
	if (!url) return (_repoSlug = null);
	const match = url.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
	return (_repoSlug = match ? `${match[1]}/${match[2]}` : null);
}

function commitUrl(hash: string): string | null {
	const slug = getRepoSlug();
	return slug ? `${getBaseUrl()}/${slug}/commit/${hash}` : null;
}

function authorUrl(author: string): string | null {
	const slug = getRepoSlug();
	return slug ? `${getBaseUrl()}/${author.replace(/\s+/g, "")}` : null;
}

function branchUrl(branch: string): string | null {
	const slug = getRepoSlug();
	return slug ? `${getBaseUrl()}/${slug}/tree/${branch}` : null;
}

function link(text: string, url: string | null): string {
	if (!url) return text;
	return terminalLink(text, url, { fallback: () => text });
}

// ─── Symbols ────────────────────────────────────────────────
const SYM = {
	staged: pc.green("●"),
	modified: pc.yellow("●"),
	untracked: pc.blue("?"),
	deleted: pc.red("✗"),
	renamed: pc.magenta("→"),
	conflict: pc.red("⚡"),
	added: pc.green("+"),
	branch: pc.cyan("⎇"),
	ahead: pc.green("↑"),
	behind: pc.red("↓"),
	commit: pc.dim("○"),
	clean: pc.green("✓"),
	dirty: pc.yellow("!"),
	bar: { filled: "█", half: "▓", empty: "░" },
} as const;

// ─── Types ──────────────────────────────────────────────────
type FileCategory = "staged" | "unstaged" | "untracked" | "conflicted";
type FileStatus =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "copied"
	| "untracked"
	| "conflicted";

interface StatusFile {
	path: string;
	origPath: string | undefined;
	status: FileStatus;
	category: FileCategory;
	additions: number;
	deletions: number;
}

interface BranchInfo {
	name: string;
	upstream: string | null;
	ahead: number;
	behind: number;
	detached: boolean;
}

// ─── Git Parsing ────────────────────────────────────────────

function parseBranch(): BranchInfo {
	const detachedHead = gitSafe("symbolic-ref", "--short", "HEAD") === null;
	const name = detachedHead
		? git("rev-parse", "--short", "HEAD")
		: git("branch", "--show-current");

	let upstream: string | null = null;
	let ahead = 0;
	let behind = 0;

	if (!detachedHead) {
		upstream = gitSafe("config", `branch.${name}.remote`);
		if (upstream) {
			const trackingBranch = gitSafe(
				"rev-parse",
				"--abbrev-ref",
				`${name}@{upstream}`,
			);
			if (trackingBranch) {
				upstream = trackingBranch;
				const counts = gitSafe(
					"rev-list",
					"--left-right",
					"--count",
					`${name}...${trackingBranch}`,
				);
				if (counts) {
					const [a, b] = counts.split(/\s+/);
					ahead = parseInt(a!) || 0;
					behind = parseInt(b!) || 0;
				}
			}
		}
	}

	return { name, upstream, ahead, behind, detached: detachedHead };
}

function parseStatusFiles(): StatusFile[] {
	const porcelain = gitSafe("status", "--porcelain=v2");
	if (!porcelain) return [];

	const stagedNumstat = new Map<string, { additions: number; deletions: number }>();
	const unstagedNumstat = new Map<string, { additions: number; deletions: number }>();

	for (const [map, args] of [
		[stagedNumstat, ["diff", "--cached", "--numstat"]],
		[unstagedNumstat, ["diff", "--numstat"]],
	] as const) {
		const output = gitSafe(...args);
		if (!output) continue;
		for (const line of output.split("\n").filter(Boolean)) {
			const [add, del, ...rest] = line.split("\t");
			const file = rest.join("\t");
			map.set(file, {
				additions: parseInt(add!) || 0,
				deletions: parseInt(del!) || 0,
			});
		}
	}

	const files: StatusFile[] = [];

	for (const line of porcelain.split("\n").filter(Boolean)) {
		if (line.startsWith("#")) continue;

		if (line.startsWith("?")) {
			const path = line.slice(2);
			files.push({
				path,
				origPath: undefined,
				status: "untracked",
				category: "untracked",
				additions: 0,
				deletions: 0,
			});
			continue;
		}

		if (line.startsWith("u")) {
			// Unmerged: u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
			const fields = line.split(" ");
			const path = fields.slice(10).join(" ");
			files.push({
				path,
				origPath: undefined,
				status: "conflicted",
				category: "conflicted",
				additions: 0,
				deletions: 0,
			});
			continue;
		}

		if (line.startsWith("1")) {
			// Ordinary entry: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
			const fields = line.split(" ");
			const xy = fields[1]!;
			const stagedCode = xy[0]!;
			const unstagedCode = xy[1]!;
			const path = fields.slice(8).join(" ");

			if (stagedCode !== ".") {
				const stat = stagedNumstat.get(path) ?? {
					additions: 0,
					deletions: 0,
				};
				files.push({
					path,
					origPath: undefined,
					status: codeToStatus(stagedCode),
					category: "staged",
					...stat,
				});
			}
			if (unstagedCode !== ".") {
				const stat = unstagedNumstat.get(path) ?? {
					additions: 0,
					deletions: 0,
				};
				files.push({
					path,
					origPath: undefined,
					status: codeToStatus(unstagedCode),
					category: "unstaged",
					...stat,
				});
			}
		}

		if (line.startsWith("2")) {
			// Rename/copy: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score>\t<path>\t<origPath>
			const tabParts = line.split("\t");
			const headerFields = tabParts[0]!.split(" ");
			const xy = headerFields[1]!;
			const stagedCode = xy[0]!;
			const unstagedCode = xy[1]!;
			const path = tabParts[1]!;
			const origPath = tabParts[2];

			if (stagedCode !== ".") {
				const stat = stagedNumstat.get(path) ?? {
					additions: 0,
					deletions: 0,
				};
				files.push({
					path,
					origPath,
					status: codeToStatus(stagedCode),
					category: "staged",
					...stat,
				});
			}
			if (unstagedCode !== ".") {
				const stat = unstagedNumstat.get(path) ?? {
					additions: 0,
					deletions: 0,
				};
				files.push({
					path,
					origPath,
					status: codeToStatus(unstagedCode),
					category: "unstaged",
					...stat,
				});
			}
		}
	}

	return files;
}

function codeToStatus(code: string): FileStatus {
	switch (code) {
		case "M":
			return "modified";
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		default:
			return "modified";
	}
}

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
	if (days > 0) {
		const remH = hours - days * 24;
		return remH > 0 ? `${days}d ${remH}h ago` : `${days}d ago`;
	}
	if (hours > 0) {
		const remM = minutes - hours * 60;
		return remM > 0 ? `${hours}h ${remM}m ago` : `${hours}h ago`;
	}
	return `${minutes}m ago`;
}

interface CommitInfo {
	hash: string;
	author: string;
	message: string;
	relTime: string;
}

function getRecentCommits(count = 3): CommitInfo[] {
	const output = gitSafe("log", "--format=%h\t%an\t%s\t%at", "--no-decorate", `-${count}`);
	if (!output) return [];
	return output
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [hash, author, message, epoch] = line.split("\t");
			return {
				hash: hash!,
				author: author!,
				message: message!,
				relTime: relativeTime(parseInt(epoch!)),
			};
		});
}

function getLastCommitTime(): string | null {
	const epoch = gitSafe("log", "-1", "--format=%at");
	if (!epoch) return null;
	return relativeTime(parseInt(epoch));
}

// ─── Display Helpers ────────────────────────────────────────

function diffBar(additions: number, deletions: number, width = 8): string {
	const total = additions + deletions;
	if (total === 0) return pc.dim("░".repeat(width));

	const addWidth = Math.round((additions / total) * width);
	const delWidth = width - addWidth;

	return pc.green("█".repeat(addWidth)) + pc.red("█".repeat(delWidth));
}

function diffNumbers(additions: number, deletions: number, addWidth = 0, delWidth = 0): string {
	if (additions > 0 && deletions > 0) {
		return `${pc.green(String(additions).padStart(addWidth))} ${pc.dim("│")} ${pc.red(String(deletions).padEnd(delWidth))}`;
	}
	if (additions > 0) return pc.green(String(additions).padStart(addWidth));
	if (deletions > 0) return pc.red(String(deletions).padEnd(delWidth));
	return pc.dim("0");
}

function statusSymbol(file: StatusFile): string {
	if (file.category === "untracked") return SYM.untracked;
	if (file.category === "conflicted") return SYM.conflict;
	if (file.category === "staged") {
		switch (file.status) {
			case "deleted":
				return SYM.deleted;
			case "renamed":
				return SYM.renamed;
			case "added":
				return SYM.added;
			default:
				return SYM.staged;
		}
	}
	switch (file.status) {
		case "deleted":
			return SYM.deleted;
		default:
			return SYM.modified;
	}
}

function formatFilePath(raw: string, status: FileStatus): string {
	const sep = raw.lastIndexOf("/");
	const dir = sep >= 0 ? raw.slice(0, sep + 1) : "";
	const file = sep >= 0 ? raw.slice(sep + 1) : raw;

	const coloredFile = (() => {
		switch (status) {
			case "added":
			case "untracked":
				return pc.green(file);
			case "deleted":
				return pc.strikethrough(pc.red(file));
			case "renamed":
			case "copied":
				return pc.magenta(file);
			case "conflicted":
				return pc.red(pc.bold(file));
			default:
				return pc.yellow(file);
		}
	})();

	return `${pc.dim(dir)}${coloredFile}`;
}

function statusLabel(status: FileStatus): string {
	switch (status) {
		case "modified":
			return pc.yellow("modified");
		case "added":
			return pc.green("new file");
		case "deleted":
			return pc.red("deleted ");
		case "renamed":
			return pc.magenta("renamed ");
		case "copied":
			return pc.magenta("copied  ");
		case "untracked":
			return pc.blue("untracked");
		case "conflicted":
			return pc.red(pc.bold("conflict"));
		default:
			return pc.dim("unknown ");
	}
}

interface ColumnWidths {
	path: number;
	add: number;
	del: number;
	diff: number;
}

function diffNumVisibleWidth(f: StatusFile, addW: number, delW: number): number {
	if (f.additions > 0 && f.deletions > 0) return addW + 3 + delW; // "N / N"
	if (f.additions > 0) return addW;
	if (f.deletions > 0) return delW;
	return 0;
}

function computeColumnWidths(files: StatusFile[]): ColumnWidths {
	const add = Math.max(...files.map((f) => String(f.additions).length));
	const del = Math.max(...files.map((f) => String(f.deletions).length));
	const diff = Math.max(
		0,
		...files
			.filter((f) => f.additions > 0 || f.deletions > 0)
			.map((f) => diffNumVisibleWidth(f, add, del)),
	);
	return {
		path: Math.max(...files.map((f) => f.path.length)),
		add,
		del,
		diff,
	};
}

function renderFileList(files: StatusFile[], cols: ColumnWidths): string {
	if (files.length === 0) return "";

	const { path: maxPathLen, add: maxAddLen, del: maxDelLen } = cols;

	return files
		.map((f) => {
			const sym = statusSymbol(f);
			const path = formatFilePath(f.path, f.status);
			const pathPad = " ".repeat(Math.max(0, maxPathLen - f.path.length + 2));
			const label = statusLabel(f.status);
			const hasDiff = f.additions > 0 || f.deletions > 0;

			let line = `  ${sym} ${path}${pathPad}${label}`;

			const visibleW = diffNumVisibleWidth(f, maxAddLen, maxDelLen);
			if (hasDiff) {
				const nums = diffNumbers(
					f.additions,
					f.deletions,
					maxAddLen,
					maxDelLen,
				);
				const numPad = " ".repeat(Math.max(0, cols.diff - visibleW));
				const bar = diffBar(f.additions, f.deletions, 6);
				line += `  ${nums}${numPad}  ${bar}`;
			} else {
				line += " ".repeat(cols.diff + 4 + 6);
			}

			if (f.origPath) {
				line += `  ${pc.dim(`← ${f.origPath}`)}`;
			}

			return line;
		})
		.join("\n");
}

function sectionHeader(
	icon: string,
	title: string,
	count: number,
	color: (s: string) => string,
): string {
	const badge = color(`${count}`);
	return `${icon} ${pc.bold(title)} ${badge}`;
}

function stripAnsi(str: string): number {
	return str.replace(/\x1B\[[0-9;]*m/g, "").length;
}

function box(content: string, title: string): string {
	const lines = content.split("\n");
	const innerWidth = Math.max(...lines.map((l) => stripAnsi(l)), stripAnsi(title) + 2) + 4;
	const pad = (line: string) => {
		const visible = stripAnsi(line);
		return `  ${line}${" ".repeat(Math.max(0, innerWidth - visible - 2))}`;
	};
	const empty = " ".repeat(innerWidth);
	const bar = pc.dim("│");
	const titleLen = stripAnsi(title);
	const leftDash = Math.floor((innerWidth - titleLen) / 2);
	const rightDash = innerWidth - titleLen - leftDash;
	const top = `${pc.dim("╭")}${pc.dim("─".repeat(leftDash))} ${title} ${pc.dim("─".repeat(rightDash))}${pc.dim("╮")}`;
	const bottom = `${pc.dim("╰")}${pc.dim("─".repeat(innerWidth + 2))}${pc.dim("╯")}`;
	const body = lines.map((l) => `${bar} ${pad(l)} ${bar}`).join("\n");
	return `${top}\n${bar} ${empty} ${bar}\n${body}\n${bar} ${empty} ${bar}\n${bottom}`;
}

// ─── Command ────────────────────────────────────────────────

export const statusCommand = new Command("status")
	.alias("s")
	.alias("st")
	.description("Show a beautiful overview of your working tree")
	.option("-s, --short", "Show compact output")
	.action(async (opts: { short?: boolean }) => {
		try {
			repoRoot();
		} catch {
			log.error("Not inside a git repository.");
			process.exit(1);
		}

		betterHubIntro("Status");

		const showCommits = getPreference("showRecentCommits");
		const branch = parseBranch();
		const files = parseStatusFiles();
		const lastCommitTime = getLastCommitTime();
		const recentCommits = showCommits ? getRecentCommits(3) : [];

		// ── Branch ────────────────────────────────────
		const branchDisplay = branch.detached
			? `${pc.red("⊘")} ${pc.bold("Detached HEAD")} at ${pc.cyan(branch.name)}`
			: `${SYM.branch} ${pc.bold(pc.cyan(branch.name))}`;

		let trackingInfo = "";
		if (branch.upstream) {
			trackingInfo = pc.gray(
				` → ${link(branch.upstream, branchUrl(branch.upstream))}`,
			);
			const parts: string[] = [];
			if (branch.ahead > 0) parts.push(`${SYM.ahead}${branch.ahead}`);
			if (branch.behind > 0) parts.push(`${SYM.behind}${branch.behind}`);
			if (parts.length > 0) trackingInfo += `  ${parts.join(pc.dim(" · "))}`;
			if (branch.ahead === 0 && branch.behind === 0)
				trackingInfo += `  ${pc.green("✓ up to date")}`;
		} else if (!branch.detached) {
			trackingInfo = pc.dim("  (no upstream)");
		}

		log.info(`${branchDisplay}${trackingInfo}`);

		if (files.length === 0) {
			log.success(`${SYM.clean} Working tree clean — nothing to commit`);
			if (recentCommits.length > 0 && !opts.short) {
				log.step(`${pc.dim("Recent commits:")}`);
				const maxAuthor = Math.max(
					...recentCommits.map((c) => c.author.length),
				);
				const maxMsg = Math.max(
					...recentCommits.map((c) => c.message.length),
				);
				const maxTime = Math.max(
					...recentCommits.map((c) => c.relTime.length),
				);
				log.message(
					recentCommits
						.map((c) => {
							const url = commitUrl(c.hash);
							const authorText = link(
								pc.cyan(c.author),
								authorUrl(c.author),
							);
							const msgText = link(
								pc.white(c.message),
								url,
							);
							const hashText = link(pc.dim(c.hash), url);
							return ` ${SYM.commit} ${authorText}${" ".repeat(maxAuthor - c.author.length)}  ${msgText}${" ".repeat(maxMsg - c.message.length)}  ${pc.dim(c.relTime)}${" ".repeat(maxTime - c.relTime.length)}  ${hashText}`;
						})
						.join("\n"),
				);
			}
			outro(pc.dim(lastCommitTime ? `Last commit ${lastCommitTime}` : ""));
			return;
		}

		// ── File Sections ────────────────────────────
		const staged = files.filter((f) => f.category === "staged");
		const unstaged = files.filter((f) => f.category === "unstaged");
		const untracked = files.filter((f) => f.category === "untracked");
		const conflicted = files.filter((f) => f.category === "conflicted");

		const totalAdd = files.reduce((s, f) => s + f.additions, 0);
		const totalDel = files.reduce((s, f) => s + f.deletions, 0);
		const cols = computeColumnWidths(files);

		// ── Build box content ─────────────────────────
		const sections: string[] = [];

		if (conflicted.length > 0) {
			sections.push(
				sectionHeader(
					SYM.conflict,
					"Merge Conflicts",
					conflicted.length,
					pc.red,
				),
			);
			sections.push(renderFileList(conflicted, cols));
		}

		if (staged.length > 0) {
			sections.push(
				`${sectionHeader(pc.green("◆"), "Staged", staged.length, pc.green)}\n${renderFileList(staged, cols)}`,
			);
		}

		if (unstaged.length > 0) {
			sections.push(
				`${sectionHeader(
					pc.yellow("◆"),
					"Modified",
					unstaged.length,
					pc.yellow,
				)}\n${renderFileList(unstaged, cols)}`,
			);
		}

		if (untracked.length > 0) {
			sections.push(
				`${sectionHeader(pc.blue("◆"), "Untracked", untracked.length, pc.blue)}\n${renderFileList(untracked, cols)}`,
			);
		}

		const summaryParts: string[] = [];
		if (staged.length > 0) summaryParts.push(pc.green(`${staged.length} staged`));
		if (unstaged.length > 0)
			summaryParts.push(pc.yellow(`${unstaged.length} modified`));
		if (untracked.length > 0)
			summaryParts.push(pc.blue(`${untracked.length} untracked`));
		if (conflicted.length > 0)
			summaryParts.push(pc.red(`${conflicted.length} conflicted`));

		const diffSummary =
			totalAdd > 0 || totalDel > 0
				? ` ${pc.dim("·")} ${pc.green(`+${totalAdd.toLocaleString()}`)} ${pc.red(`-${totalDel.toLocaleString()}`)}`
				: "";

		const title = `${pc.bold(`${files.length}`)} ${pc.gray("changes")} ${pc.dim("·")} ${summaryParts.join(pc.dim(" · "))}${diffSummary}`;

		log.message(box(sections.join("\n\n"), title));

		// ── Recent Commits ───────────────────────────
		if (!opts.short && recentCommits.length > 0) {
			log.info(pc.gray("Recent commits:"));
			const maxAuthor = Math.max(...recentCommits.map((c) => c.author.length));
			const maxMsg = Math.max(...recentCommits.map((c) => c.message.length));
			const maxTime = Math.max(...recentCommits.map((c) => c.relTime.length));
			log.message(
				recentCommits
					.map((c) => {
						const url = commitUrl(c.hash);
						const authorText = link(
							pc.cyan(c.author),
							authorUrl(c.author),
						);
						const msgText = link(pc.white(c.message), url);
						const hashText = link(pc.dim(c.hash), url);
						return ` ${SYM.commit} ${authorText}${" ".repeat(maxAuthor - c.author.length)}  ${msgText}${" ".repeat(maxMsg - c.message.length)}  ${pc.dim(c.relTime)}${" ".repeat(maxTime - c.relTime.length)}  ${hashText}`;
					})
					.join("\n"),
			);
		}

		outro(pc.dim(lastCommitTime ? `${"Last commit"} ${lastCommitTime}` : ""));
	});
