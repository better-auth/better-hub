"use client";

import { useState, useEffect, useCallback, useRef, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
	Check,
	AlertTriangle,
	FileCode2,
	ChevronDown,
	ChevronRight,
	Loader2,
	GitMerge,
	X,
	Keyboard,
} from "lucide-react";
import { cn, getErrorMessage } from "@/lib/utils";
import type { MergeHunk, ConflictFileData } from "@/lib/three-way-merge";
import { commitMergeConflictResolution } from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { highlightCodeClient } from "@/lib/shiki-client";
import { useColorTheme } from "@/components/theme/theme-provider";

const EXT_TO_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	swift: "swift",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	md: "markdown",
	mdx: "mdx",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	xml: "xml",
	html: "html",
	css: "css",
	scss: "scss",
	less: "less",
	vue: "vue",
	svelte: "svelte",
	sql: "sql",
	graphql: "graphql",
	gql: "graphql",
	dockerfile: "dockerfile",
	makefile: "makefile",
	r: "r",
	lua: "lua",
	dart: "dart",
	zig: "zig",
};

function getLangFromPath(path: string): string {
	const name = path.split("/").pop()?.toLowerCase() || "";
	if (name === "dockerfile") return "dockerfile";
	if (name === "makefile") return "makefile";
	const ext = name.split(".").pop() || "";
	return EXT_TO_LANG[ext] || ext || "text";
}

function escapeHtml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function useHighlightedLines(code: string, lang: string): string[] | null {
	const { themeId } = useColorTheme();
	const [lines, setLines] = useState<string[] | null>(null);

	useEffect(() => {
		if (!code) {
			setLines(null);
			return;
		}
		let cancelled = false;
		highlightCodeClient(code, lang, themeId).then((html) => {
			if (cancelled) return;
			if (typeof window === "undefined") {
				setLines(null);
				return;
			}
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");
			const lineSpans = doc.querySelectorAll(".shiki .line");
			if (lineSpans.length > 0) {
				setLines(Array.from(lineSpans).map((l) => l.innerHTML));
			} else {
				setLines(null);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [code, lang, themeId]);

	return lines;
}

function HighlightedLine({
	html,
	fallback,
	className,
}: {
	html?: string;
	fallback: string;
	className?: string;
}) {
	if (html) {
		return (
			<div
				className={className}
				style={{ minHeight: "20px", lineHeight: "20px" }}
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		);
	}
	return (
		<div className={className} style={{ minHeight: "20px", lineHeight: "20px" }}>
			{fallback || "\u00a0"}
		</div>
	);
}

// ── Types ───────────────────────────────────────────────────────

type HunkResolutionStatus =
	| "pending"
	| "accepted-base"
	| "accepted-head"
	| "accepted-both"
	| "custom";

interface HunkResolution {
	status: HunkResolutionStatus;
	resolvedLines: string[];
}

interface FileResolution {
	status: "auto-resolved" | "pending" | "resolved";
	hunkResolutions: HunkResolution[];
}

interface MergeConflictsResponse {
	mergeBaseSha: string;
	baseBranch: string;
	headBranch: string;
	files: ConflictFileData[];
}

// ── Props ───────────────────────────────────────────────────────

interface PRConflictResolverProps {
	owner: string;
	repo: string;
	pullNumber: number;
	baseBranch: string;
	headBranch: string;
	headRepoOwner?: string | null;
	headRepoName?: string | null;
}

// ── Component ───────────────────────────────────────────────────

export function PRConflictResolver({
	owner,
	repo,
	pullNumber,
	baseBranch,
	headBranch,
	headRepoOwner,
	headRepoName,
}: PRConflictResolverProps) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<MergeConflictsResponse | null>(null);
	const [resolutions, setResolutions] = useState<Map<string, FileResolution>>(new Map());
	const [activeFile, setActiveFile] = useState<string | null>(null);
	const [activeHunkIdx, setActiveHunkIdx] = useState(0);
	const [commitMessage, setCommitMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const [commitResult, setCommitResult] = useState<{
		type: "success" | "error";
		message: string;
	} | null>(null);
	const [showShortcuts, setShowShortcuts] = useState(false);
	const mainRef = useRef<HTMLDivElement>(null);

	// ── Fetch conflict data ────────────────────────────────────
	useEffect(() => {
		const fetchData = async () => {
			try {
				const headParam =
					headRepoOwner && headRepoOwner !== owner
						? `${headRepoOwner}:${headBranch}`
						: headBranch;
				const res = await fetch(
					`/api/merge-conflicts?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&base=${encodeURIComponent(baseBranch)}&head=${encodeURIComponent(headParam)}`,
				);
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(body.error || `HTTP ${res.status}`);
				}
				const json: MergeConflictsResponse = await res.json();
				setData(json);

				// Initialize resolutions
				const map = new Map<string, FileResolution>();
				let firstConflictFile: string | null = null;
				for (const file of json.files) {
					if (file.autoResolved) {
						map.set(file.path, {
							status: "auto-resolved",
							hunkResolutions: file.hunks.map((h) => ({
								status:
									h.type === "clean"
										? "accepted-base"
										: "pending",
								resolvedLines:
									h.resolvedLines || [],
							})),
						});
					} else {
						if (!firstConflictFile)
							firstConflictFile = file.path;
						map.set(file.path, {
							status: "pending",
							hunkResolutions: file.hunks.map((h) => ({
								status:
									h.type === "clean"
										? "accepted-base"
										: "pending",
								resolvedLines:
									h.type === "clean"
										? h.resolvedLines ||
											[]
										: [],
							})),
						});
					}
				}
				setResolutions(map);
				setActiveFile(firstConflictFile || json.files[0]?.path || null);
				setCommitMessage(
					`Merge branch '${json.baseBranch}' into ${json.headBranch}`,
				);
			} catch (e: unknown) {
				setError(getErrorMessage(e) || "Failed to load conflicts");
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [owner, repo, baseBranch, headBranch]);

	// ── Resolution helpers ─────────────────────────────────────

	const updateHunkResolution = useCallback(
		(
			filePath: string,
			hunkIdx: number,
			status: HunkResolutionStatus,
			lines: string[],
		) => {
			setResolutions((prev) => {
				const next = new Map(prev);
				const fileRes = { ...next.get(filePath)! };
				const hunks = [...fileRes.hunkResolutions];
				hunks[hunkIdx] = { status, resolvedLines: lines };
				fileRes.hunkResolutions = hunks;

				// Check if all conflict hunks are resolved
				const allResolved = hunks.every((h) => h.status !== "pending");
				fileRes.status = allResolved ? "resolved" : "pending";

				next.set(filePath, fileRes);
				return next;
			});
		},
		[],
	);

	const acceptBase = useCallback(
		(filePath: string, hunkIdx: number, baseLines: string[]) => {
			updateHunkResolution(filePath, hunkIdx, "accepted-base", baseLines);
		},
		[updateHunkResolution],
	);

	const acceptHead = useCallback(
		(filePath: string, hunkIdx: number, headLines: string[]) => {
			updateHunkResolution(filePath, hunkIdx, "accepted-head", headLines);
		},
		[updateHunkResolution],
	);

	const acceptBoth = useCallback(
		(filePath: string, hunkIdx: number, baseLines: string[], headLines: string[]) => {
			updateHunkResolution(filePath, hunkIdx, "accepted-both", [
				...baseLines,
				...headLines,
			]);
		},
		[updateHunkResolution],
	);

	const acceptAllBase = useCallback(
		(filePath: string) => {
			if (!data) return;
			const file = data.files.find((f) => f.path === filePath);
			if (!file) return;
			file.hunks.forEach((h, idx) => {
				if (h.type === "conflict") {
					acceptBase(filePath, idx, h.baseLines || []);
				}
			});
		},
		[data, acceptBase],
	);

	const acceptAllHead = useCallback(
		(filePath: string) => {
			if (!data) return;
			const file = data.files.find((f) => f.path === filePath);
			if (!file) return;
			file.hunks.forEach((h, idx) => {
				if (h.type === "conflict") {
					acceptHead(filePath, idx, h.headLines || []);
				}
			});
		},
		[data, acceptHead],
	);

	// ── Computed state ─────────────────────────────────────────

	const conflictFiles = data?.files.filter((f) => !f.autoResolved) || [];
	const autoFiles = data?.files.filter((f) => f.autoResolved) || [];
	const totalConflictFiles = conflictFiles.length;
	const resolvedCount = conflictFiles.filter(
		(f) => resolutions.get(f.path)?.status === "resolved",
	).length;
	const allResolved = totalConflictFiles > 0 && resolvedCount === totalConflictFiles;

	const activeFileData = data?.files.find((f) => f.path === activeFile);
	const activeFileRes = activeFile ? resolutions.get(activeFile) : undefined;
	const conflictHunkIndices = activeFileData
		? activeFileData.hunks
				.map((h, i) => (h.type === "conflict" ? i : -1))
				.filter((i) => i >= 0)
		: [];

	// ── Keyboard shortcuts ─────────────────────────────────────

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			// Don't capture when editing text
			if (
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLInputElement
			)
				return;

			if (e.key === "Escape") {
				router.back();
				return;
			}

			if (!activeFile || !activeFileData || !activeFileRes) return;

			if (e.key === "j") {
				// Next conflict hunk
				const curConflictPos = conflictHunkIndices.indexOf(activeHunkIdx);
				if (curConflictPos < conflictHunkIndices.length - 1) {
					setActiveHunkIdx(conflictHunkIndices[curConflictPos + 1]);
				}
				e.preventDefault();
			} else if (e.key === "k") {
				// Prev conflict hunk
				const curConflictPos = conflictHunkIndices.indexOf(activeHunkIdx);
				if (curConflictPos > 0) {
					setActiveHunkIdx(conflictHunkIndices[curConflictPos - 1]);
				}
				e.preventDefault();
			} else if (e.key === "]") {
				// Next file
				const idx = conflictFiles.findIndex((f) => f.path === activeFile);
				if (idx < conflictFiles.length - 1) {
					setActiveFile(conflictFiles[idx + 1].path);
					setActiveHunkIdx(0);
				}
				e.preventDefault();
			} else if (e.key === "[") {
				// Prev file
				const idx = conflictFiles.findIndex((f) => f.path === activeFile);
				if (idx > 0) {
					setActiveFile(conflictFiles[idx - 1].path);
					setActiveHunkIdx(0);
				}
				e.preventDefault();
			} else if (e.key === "1" && conflictHunkIndices.includes(activeHunkIdx)) {
				const hunk = activeFileData.hunks[activeHunkIdx];
				if (hunk.type === "conflict")
					acceptBase(activeFile, activeHunkIdx, hunk.baseLines || []);
				e.preventDefault();
			} else if (e.key === "2" && conflictHunkIndices.includes(activeHunkIdx)) {
				const hunk = activeFileData.hunks[activeHunkIdx];
				if (hunk.type === "conflict")
					acceptHead(activeFile, activeHunkIdx, hunk.headLines || []);
				e.preventDefault();
			} else if (e.key === "3" && conflictHunkIndices.includes(activeHunkIdx)) {
				const hunk = activeFileData.hunks[activeHunkIdx];
				if (hunk.type === "conflict")
					acceptBoth(
						activeFile,
						activeHunkIdx,
						hunk.baseLines || [],
						hunk.headLines || [],
					);
				e.preventDefault();
			} else if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && allResolved) {
				handleCommit();
				e.preventDefault();
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [
		activeFile,
		activeFileData,
		activeFileRes,
		activeHunkIdx,
		conflictHunkIndices,
		conflictFiles,
		allResolved,
		acceptBase,
		acceptHead,
		acceptBoth,
		router,
	]);

	// ── Commit handler ─────────────────────────────────────────

	const handleCommit = () => {
		if (!data || !allResolved) return;

		const resolvedFiles: { path: string; content: string }[] = [];

		for (const file of data.files) {
			const fileRes = resolutions.get(file.path);
			if (!fileRes) continue;

			const allLines: string[] = [];
			fileRes.hunkResolutions.forEach((hr) => {
				allLines.push(...hr.resolvedLines);
			});
			resolvedFiles.push({ path: file.path, content: allLines.join("\n") });
		}

		startTransition(async () => {
			const result = await commitMergeConflictResolution(
				owner,
				repo,
				pullNumber,
				headBranch,
				baseBranch,
				resolvedFiles,
				commitMessage,
				headRepoOwner,
				headRepoName,
			);
			if (result.error) {
				setCommitResult({ type: "error", message: result.error });
			} else {
				setCommitResult({
					type: "success",
					message: "Conflicts resolved!",
				});
				emit({
					type: "pr:conflict-resolved",
					owner,
					repo,
					number: pullNumber,
				});
				// Hard navigate to fully bust Next.js router cache + give GitHub a moment to recompute mergeable
				setTimeout(() => {
					window.location.href = `/${owner}/${repo}/pulls/${pullNumber}`;
				}, 1200);
			}
		});
	};

	// ── Loading / Error states ─────────────────────────────────

	if (loading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="flex items-center gap-2 text-muted-foreground">
					<Loader2 className="w-4 h-4 animate-spin" />
					<span className="text-xs font-mono">
						Analyzing conflicts...
					</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center space-y-2">
					<AlertTriangle className="w-5 h-5 text-amber-500 mx-auto" />
					<p className="text-xs font-mono text-muted-foreground">
						{error}
					</p>
					<button
						onClick={() => router.back()}
						className="text-[11px] font-mono text-foreground/70 hover:text-foreground underline cursor-pointer"
					>
						Go back
					</button>
				</div>
			</div>
		);
	}

	if (!data || data.files.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="text-center space-y-2">
					<Check className="w-5 h-5 text-green-500 mx-auto" />
					<p className="text-xs font-mono text-muted-foreground">
						No conflicts found
					</p>
					<button
						onClick={() => router.back()}
						className="text-[11px] font-mono text-foreground/70 hover:text-foreground underline cursor-pointer"
					>
						Go back
					</button>
				</div>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────

	return (
		<div ref={mainRef} className="flex-1 flex flex-col min-h-0" tabIndex={-1}>
			{/* Top bar */}
			<div className="shrink-0 flex items-center justify-between px-4 py-2 relative after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border after:to-transparent bg-muted/30">
				<div className="flex items-center gap-3">
					<GitMerge className="w-4 h-4 text-amber-500" />
					<span className="text-xs font-mono">Resolve conflicts</span>
					<span className="text-[10px] font-mono text-muted-foreground">
						{resolvedCount}/{totalConflictFiles} files resolved
					</span>
					{autoFiles.length > 0 && (
						<span className="text-[10px] font-mono text-muted-foreground/50">
							+{autoFiles.length} auto-merged
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => setShowShortcuts((s) => !s)}
						className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
						title="Keyboard shortcuts"
					>
						<Keyboard className="w-3 h-3" />
					</button>
					<button
						onClick={() => router.back()}
						className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					>
						<X className="w-3 h-3" />
						Exit
					</button>
				</div>
			</div>

			{/* Keyboard shortcuts tooltip */}
			{showShortcuts && (
				<div className="shrink-0 px-4 py-2 relative after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border after:to-transparent bg-muted/20 text-[10px] font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
					<span>
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							j
						</kbd>
						/
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							k
						</kbd>{" "}
						prev/next hunk
					</span>
					<span>
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							[
						</kbd>
						/
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							]
						</kbd>{" "}
						prev/next file
					</span>
					<span>
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							1
						</kbd>{" "}
						accept base
					</span>
					<span>
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							2
						</kbd>{" "}
						accept head
					</span>
					<span>
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							3
						</kbd>{" "}
						accept both
					</span>
					<span>
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							⌘↵
						</kbd>{" "}
						commit
					</span>
					<span>
						<kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[9px]">
							Esc
						</kbd>{" "}
						exit
					</span>
				</div>
			)}

			{/* Main content: sidebar + hunk viewer */}
			<div className="flex-1 min-h-0 flex">
				{/* Sidebar */}
				<div className="w-56 shrink-0 relative after:absolute after:top-[5%] after:bottom-[5%] after:right-0 after:w-px after:bg-gradient-to-b after:from-transparent after:via-border after:to-transparent overflow-y-auto bg-muted/10">
					{/* Progress bar */}
					<div className="px-3 py-2 relative after:absolute after:bottom-0 after:left-[10%] after:right-[10%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border/50 after:to-transparent">
						<div className="h-1.5 bg-muted rounded-full overflow-hidden">
							<div
								className="h-full bg-blue-500 transition-all duration-300"
								style={{
									width:
										totalConflictFiles >
										0
											? `${(resolvedCount / totalConflictFiles) * 100}%`
											: "0%",
								}}
							/>
						</div>
					</div>

					{/* Conflict files */}
					{conflictFiles.length > 0 && (
						<div className="py-1">
							<div className="px-3 py-1 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">
								Conflicts ({conflictFiles.length})
							</div>
							{conflictFiles.map((file) => {
								const res = resolutions.get(
									file.path,
								);
								const isResolved =
									res?.status === "resolved";
								const isActive =
									activeFile === file.path;
								return (
									<button
										key={file.path}
										onClick={() => {
											setActiveFile(
												file.path,
											);
											setActiveHunkIdx(
												0,
											);
										}}
										className={cn(
											"w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer",
											isActive
												? "bg-muted/60 dark:bg-white/[0.04] text-foreground"
												: "text-muted-foreground hover:bg-muted/40 dark:hover:bg-white/[0.03] hover:text-foreground",
										)}
									>
										{isResolved ? (
											<Check className="w-3 h-3 shrink-0 text-blue-500" />
										) : (
											<AlertTriangle className="w-3 h-3 shrink-0 text-amber-500" />
										)}
										<span className="text-[11px] font-mono truncate">
											{file.path
												.split(
													"/",
												)
												.pop()}
										</span>
									</button>
								);
							})}
						</div>
					)}

					{/* Auto-resolved files */}
					{autoFiles.length > 0 && (
						<div className="py-1 relative before:absolute before:top-0 before:left-[10%] before:right-[10%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-border/30 before:to-transparent">
							<div className="px-3 py-1 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">
								Auto-merged ({autoFiles.length})
							</div>
							{autoFiles.map((file) => (
								<button
									key={file.path}
									onClick={() => {
										setActiveFile(
											file.path,
										);
										setActiveHunkIdx(0);
									}}
									className={cn(
										"w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer",
										activeFile ===
											file.path
											? "bg-muted/60 dark:bg-white/[0.04] text-foreground"
											: "text-muted-foreground/50 hover:bg-muted/40 dark:hover:bg-white/[0.03] hover:text-muted-foreground",
									)}
								>
									<Check className="w-3 h-3 shrink-0 text-green-500/50" />
									<span className="text-[11px] font-mono truncate">
										{file.path
											.split("/")
											.pop()}
									</span>
								</button>
							))}
						</div>
					)}
				</div>

				{/* Main inline viewer */}
				<div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
					{activeFileData && activeFileRes ? (
						<>
							{/* File header */}
							<div className="shrink-0 sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-border bg-background/95 backdrop-blur-sm">
								<div className="flex items-center gap-2 min-w-0">
									<FileCode2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
									<span className="text-xs font-mono truncate">
										{
											activeFileData.path
										}
									</span>
									{activeFileData.hasConflicts && (
										<span className="text-[10px] font-mono text-amber-500">
											{
												conflictHunkIndices.filter(
													(
														i,
													) =>
														activeFileRes
															.hunkResolutions[
															i
														]
															?.status ===
														"pending",
												)
													.length
											}{" "}
											conflict
											{conflictHunkIndices.filter(
												(
													i,
												) =>
													activeFileRes
														.hunkResolutions[
														i
													]
														?.status ===
													"pending",
											).length !==
											1
												? "s"
												: ""}{" "}
											remaining
										</span>
									)}
								</div>
								{activeFileData.hasConflicts &&
									activeFileRes.status !==
										"auto-resolved" && (
										<div className="flex items-center gap-1">
											<button
												onClick={() =>
													acceptAllBase(
														activeFile!,
													)
												}
												className="px-2 py-1 text-[10px] font-mono rounded-sm bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
											>
												Accept
												all
												base
											</button>
											<button
												onClick={() =>
													acceptAllHead(
														activeFile!,
													)
												}
												className="px-2 py-1 text-[10px] font-mono rounded-sm bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
											>
												Accept
												all
												head
											</button>
										</div>
									)}
							</div>

							{/* Unified inline view */}
							<InlineFileView
								fileData={activeFileData}
								fileRes={activeFileRes}
								baseBranch={baseBranch}
								headBranch={headBranch}
								onAcceptBase={(idx, lines) =>
									acceptBase(
										activeFileData.path,
										idx,
										lines,
									)
								}
								onAcceptHead={(idx, lines) =>
									acceptHead(
										activeFileData.path,
										idx,
										lines,
									)
								}
								onAcceptBoth={(idx, base, head) =>
									acceptBoth(
										activeFileData.path,
										idx,
										base,
										head,
									)
								}
								onCustom={(idx, lines) =>
									updateHunkResolution(
										activeFileData.path,
										idx,
										"custom",
										lines,
									)
								}
								activeHunkIdx={activeHunkIdx}
								onFocusHunk={setActiveHunkIdx}
							/>
						</>
					) : (
						<div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
							Select a file to view conflicts
						</div>
					)}
				</div>
			</div>

			{/* Bottom commit bar */}
			<div className="shrink-0 relative before:absolute before:top-0 before:left-[3%] before:right-[3%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-border before:to-transparent bg-muted/30 px-4 py-3">
				<div className="flex items-center gap-3">
					<div className="flex-1 min-w-0">
						{allResolved ? (
							<div className="flex items-center gap-3">
								<span className="shrink-0 text-[10px] font-mono text-green-600 dark:text-green-400 flex items-center gap-1">
									<Check className="w-3 h-3" />
									All {totalConflictFiles}{" "}
									file
									{totalConflictFiles !== 1
										? "s"
										: ""}{" "}
									resolved
								</span>
								<input
									type="text"
									value={commitMessage}
									onChange={(e) =>
										setCommitMessage(
											e.target
												.value,
										)
									}
									className="flex-1 min-w-0 bg-transparent border border-border px-2 py-1 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors"
									placeholder="Commit message..."
								/>
							</div>
						) : (
							<span className="text-[10px] font-mono text-muted-foreground">
								Resolve all conflict files to commit
								({resolvedCount}/
								{totalConflictFiles})
							</span>
						)}
					</div>

					{commitResult && (
						<span
							className={cn(
								"text-[10px] font-mono",
								commitResult.type === "error"
									? "text-destructive"
									: "text-green-600 dark:text-green-400",
							)}
						>
							{commitResult.message}
						</span>
					)}

					<button
						onClick={handleCommit}
						disabled={
							!allResolved ||
							isPending ||
							!commitMessage.trim()
						}
						className={cn(
							"shrink-0 flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
							allResolved
								? "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
								: "bg-muted text-muted-foreground cursor-not-allowed",
							"disabled:opacity-50 disabled:cursor-not-allowed",
						)}
					>
						{isPending ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							<GitMerge className="w-3 h-3" />
						)}
						Commit resolution
					</button>
				</div>
			</div>
		</div>
	);
}

// ── HunkView sub-component ──────────────────────────────────────

interface InlineFileViewProps {
	fileData: ConflictFileData;
	fileRes: FileResolution;
	baseBranch: string;
	headBranch: string;
	onAcceptBase: (hunkIdx: number, lines: string[]) => void;
	onAcceptHead: (hunkIdx: number, lines: string[]) => void;
	onAcceptBoth: (hunkIdx: number, base: string[], head: string[]) => void;
	onCustom: (hunkIdx: number, lines: string[]) => void;
	activeHunkIdx: number;
	onFocusHunk: (idx: number) => void;
}

function InlineConflictBlock({
	hunkIdx,
	hunk,
	res,
	baseBranch,
	headBranch,
	highlighted,
	baseHlStart,
	headHlStart,
	onAcceptBase,
	onAcceptHead,
	onAcceptBoth,
	onCustom,
}: {
	hunkIdx: number;
	hunk: MergeHunk;
	res: HunkResolution;
	baseBranch: string;
	headBranch: string;
	highlighted: string[] | null;
	baseHlStart: number;
	headHlStart: number;
	onAcceptBase: (hunkIdx: number, lines: string[]) => void;
	onAcceptHead: (hunkIdx: number, lines: string[]) => void;
	onAcceptBoth: (hunkIdx: number, base: string[], head: string[]) => void;
	onCustom: (hunkIdx: number, lines: string[]) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [editText, setEditText] = useState("");
	const baseLines = hunk.baseLines || [];
	const headLines = hunk.headLines || [];
	const isResolved = res.status !== "pending";

	if (isResolved && !editing) {
		return (
			<div className="border-y border-blue-500/20">
				<div className="flex items-center justify-between px-3 py-1 bg-blue-500/5">
					<div className="flex items-center gap-2">
						<Check className="w-3 h-3 text-blue-500" />
						<span className="text-[10px] font-mono text-blue-500">
							Resolved
							{res.status === "accepted-base" &&
								" — using base"}
							{res.status === "accepted-head" &&
								" — using head"}
							{res.status === "accepted-both" &&
								" — using both"}
							{res.status === "custom" &&
								" — custom edit"}
						</span>
					</div>
					<div className="flex items-center gap-1">
						<button
							onClick={() => {
								setEditText(
									res.resolvedLines.join(
										"\n",
									),
								);
								setEditing(true);
							}}
							className="px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-sm transition-colors cursor-pointer"
						>
							Edit
						</button>
					</div>
				</div>
				{res.resolvedLines.map((l, i) => (
					<div
						key={i}
						className="flex bg-blue-500/[0.03] hover:bg-blue-500/[0.06] transition-colors"
					>
						<span className="select-none text-right pr-3 pl-3 text-blue-400/25 w-12 shrink-0 border-r border-blue-500/10">
							{i + 1}
						</span>
						<div className="flex-1 pl-3 pr-4 whitespace-pre-wrap break-all">
							<HighlightedLine
								html={undefined}
								fallback={l}
							/>
						</div>
					</div>
				))}
			</div>
		);
	}

	if (editing) {
		return (
			<div className="border-y border-amber-500/20">
				<div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/5">
					<span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
						Editing conflict
					</span>
					<div className="flex items-center gap-1.5">
						<button
							onClick={() => setEditing(false)}
							className="px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-sm transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							onClick={() => {
								onCustom(
									hunkIdx,
									editText.split("\n"),
								);
								setEditing(false);
							}}
							className="px-2 py-0.5 text-[10px] font-mono bg-foreground text-background hover:bg-foreground/90 rounded-sm transition-colors cursor-pointer"
						>
							Apply
						</button>
					</div>
				</div>
				<textarea
					value={editText}
					onChange={(e) => setEditText(e.target.value)}
					className="w-full min-h-24 bg-transparent px-4 py-2 text-[12px] font-mono leading-[22px] focus:outline-none resize-y border-0"
					autoFocus
				/>
			</div>
		);
	}

	return (
		<div className="border-y-2 border-amber-500/30">
			{/* Base (current) section */}
			<div className="flex items-center justify-between px-3 py-1 bg-red-500/8 border-b border-red-500/10">
				<span className="text-[10px] font-mono text-red-500 dark:text-red-400 font-medium">
					{baseBranch} (current)
				</span>
				<button
					onClick={() => onAcceptBase(hunkIdx, baseLines)}
					className="px-2 py-0.5 text-[10px] font-mono text-red-600 dark:text-red-400 hover:bg-red-500/15 rounded-sm transition-colors cursor-pointer"
				>
					Accept current
				</button>
			</div>
			{baseLines.map((l, i) => (
				<div
					key={`b-${i}`}
					className="flex bg-red-500/[0.06] hover:bg-red-500/10 transition-colors"
				>
					<span className="select-none text-right pr-3 pl-3 text-red-400/25 w-12 shrink-0 border-r border-red-500/10">
						{i + 1}
					</span>
					<span className="select-none w-5 text-center text-red-500/40 shrink-0">
						−
					</span>
					<div className="flex-1 pl-1 pr-4 whitespace-pre-wrap break-all">
						<HighlightedLine
							html={highlighted?.[baseHlStart + i]}
							fallback={l}
						/>
					</div>
				</div>
			))}

			{/* Separator with actions */}
			<div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-muted/30 border-y border-border/30">
				<button
					onClick={() => onAcceptBoth(hunkIdx, baseLines, headLines)}
					className="px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-sm transition-colors cursor-pointer"
				>
					Accept both
				</button>
				<span className="text-muted-foreground/20">|</span>
				<button
					onClick={() => {
						setEditText(
							[...baseLines, ...headLines].join("\n"),
						);
						setEditing(true);
					}}
					className="px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-sm transition-colors cursor-pointer"
				>
					Edit manually
				</button>
			</div>

			{/* Head (incoming) section */}
			<div className="flex items-center justify-between px-3 py-1 bg-green-500/8 border-b border-green-500/10">
				<span className="text-[10px] font-mono text-green-500 dark:text-green-400 font-medium">
					{headBranch} (incoming)
				</span>
				<button
					onClick={() => onAcceptHead(hunkIdx, headLines)}
					className="px-2 py-0.5 text-[10px] font-mono text-green-600 dark:text-green-400 hover:bg-green-500/15 rounded-sm transition-colors cursor-pointer"
				>
					Accept incoming
				</button>
			</div>
			{headLines.map((l, i) => (
				<div
					key={`h-${i}`}
					className="flex bg-green-500/[0.06] hover:bg-green-500/10 transition-colors"
				>
					<span className="select-none text-right pr-3 pl-3 text-green-400/25 w-12 shrink-0 border-r border-green-500/10">
						{i + 1}
					</span>
					<span className="select-none w-5 text-center text-green-500/40 shrink-0">
						+
					</span>
					<div className="flex-1 pl-1 pr-4 whitespace-pre-wrap break-all">
						<HighlightedLine
							html={highlighted?.[headHlStart + i]}
							fallback={l}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

function InlineFileView({
	fileData,
	fileRes,
	baseBranch,
	headBranch,
	onAcceptBase,
	onAcceptHead,
	onAcceptBoth,
	onCustom,
	activeHunkIdx,
	onFocusHunk,
}: InlineFileViewProps) {
	const lang = useMemo(() => getLangFromPath(fileData.path), [fileData.path]);

	const fullCode = useMemo(() => {
		const parts: string[] = [];
		for (const hunk of fileData.hunks) {
			if (hunk.type === "clean") {
				parts.push(...(hunk.resolvedLines || []));
			} else {
				parts.push(...(hunk.baseLines || []));
				parts.push(...(hunk.headLines || []));
			}
		}
		return parts.join("\n");
	}, [fileData.hunks]);

	const highlighted = useHighlightedLines(fullCode, lang);

	const hunkHlOffsets = useMemo(() => {
		const offsets: { baseStart: number; headStart: number; cleanStart: number }[] = [];
		let idx = 0;
		for (const hunk of fileData.hunks) {
			if (hunk.type === "clean") {
				const len = (hunk.resolvedLines || []).length;
				offsets.push({ baseStart: idx, headStart: idx, cleanStart: idx });
				idx += len;
			} else {
				const bLen = (hunk.baseLines || []).length;
				const hLen = (hunk.headLines || []).length;
				offsets.push({
					baseStart: idx,
					headStart: idx + bLen,
					cleanStart: idx,
				});
				idx += bLen + hLen;
			}
		}
		return offsets;
	}, [fileData.hunks]);

	let lineNum = 0;

	return (
		<div className="flex-1 overflow-auto text-[12px] font-mono leading-[22px]">
			{fileData.hunks.map((hunk, hIdx) => {
				const res = fileRes.hunkResolutions[hIdx];
				const offsets = hunkHlOffsets[hIdx];

				if (hunk.type === "clean") {
					const lines = res?.resolvedLines?.length
						? res.resolvedLines
						: hunk.resolvedLines || [];
					return lines.map((l, i) => {
						lineNum++;
						return (
							<div
								key={`${hIdx}-${i}`}
								className="flex hover:bg-muted/30 transition-colors"
							>
								<span className="select-none text-right pr-3 pl-3 text-muted-foreground/25 w-12 shrink-0 border-r border-border/20">
									{lineNum}
								</span>
								<div className="flex-1 pl-3 pr-4 whitespace-pre-wrap break-all">
									<HighlightedLine
										html={
											highlighted?.[
												offsets.cleanStart +
													i
											]
										}
										fallback={l}
									/>
								</div>
							</div>
						);
					});
				}

				return (
					<InlineConflictBlock
						key={`conflict-${hIdx}`}
						hunkIdx={hIdx}
						hunk={hunk}
						res={res}
						baseBranch={baseBranch}
						headBranch={headBranch}
						highlighted={highlighted}
						baseHlStart={offsets.baseStart}
						headHlStart={offsets.headStart}
						onAcceptBase={onAcceptBase}
						onAcceptHead={onAcceptHead}
						onAcceptBoth={onAcceptBoth}
						onCustom={onCustom}
					/>
				);
			})}
		</div>
	);
}
