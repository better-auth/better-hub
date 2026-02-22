"use client";

import { useState, useEffect, useCallback, useRef, useTransition } from "react";
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
}

// ── Component ───────────────────────────────────────────────────

export function PRConflictResolver({
	owner,
	repo,
	pullNumber,
	baseBranch,
	headBranch,
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
				const res = await fetch(
					`/api/merge-conflicts?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&base=${encodeURIComponent(baseBranch)}&head=${encodeURIComponent(headBranch)}`,
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

				{/* Main hunk viewer */}
				<div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
					{activeFileData && activeFileRes ? (
						<>
							{/* File header */}
							<div className="shrink-0 sticky top-0 z-10 flex items-center justify-between px-4 py-2 relative after:absolute after:bottom-0 after:left-[3%] after:right-[3%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border after:to-transparent bg-background/95 backdrop-blur-sm">
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
												className="px-2 py-1 text-[10px] font-mono rounded-sm bg-muted/50 dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
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
												className="px-2 py-1 text-[10px] font-mono rounded-sm bg-muted/50 dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
											>
												Accept
												all
												head
											</button>
										</div>
									)}
							</div>

							{/* Hunks */}
							<div className="flex-1 p-4 space-y-3">
								{activeFileData.hunks.map(
									(hunk, idx) => (
										<HunkView
											key={idx}
											hunk={hunk}
											hunkIdx={
												idx
											}
											filePath={
												activeFileData.path
											}
											resolution={
												activeFileRes
													.hunkResolutions[
													idx
												]
											}
											isActive={
												activeHunkIdx ===
												idx
											}
											onFocus={() =>
												setActiveHunkIdx(
													idx,
												)
											}
											onAcceptBase={(
												lines,
											) =>
												acceptBase(
													activeFileData.path,
													idx,
													lines,
												)
											}
											onAcceptHead={(
												lines,
											) =>
												acceptHead(
													activeFileData.path,
													idx,
													lines,
												)
											}
											onAcceptBoth={(
												base,
												head,
											) =>
												acceptBoth(
													activeFileData.path,
													idx,
													base,
													head,
												)
											}
											onCustom={(
												lines,
											) =>
												updateHunkResolution(
													activeFileData.path,
													idx,
													"custom",
													lines,
												)
											}
											baseBranch={
												baseBranch
											}
											headBranch={
												headBranch
											}
										/>
									),
								)}
							</div>
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

interface HunkViewProps {
	hunk: MergeHunk;
	hunkIdx: number;
	filePath: string;
	resolution: HunkResolution;
	isActive: boolean;
	onFocus: () => void;
	onAcceptBase: (lines: string[]) => void;
	onAcceptHead: (lines: string[]) => void;
	onAcceptBoth: (base: string[], head: string[]) => void;
	onCustom: (lines: string[]) => void;
	baseBranch: string;
	headBranch: string;
}

function HunkView({
	hunk,
	hunkIdx,
	filePath,
	resolution,
	isActive,
	onFocus,
	onAcceptBase,
	onAcceptHead,
	onAcceptBoth,
	onCustom,
	baseBranch,
	headBranch,
}: HunkViewProps) {
	const [editing, setEditing] = useState(false);
	const [editText, setEditText] = useState("");
	const [collapsed, setCollapsed] = useState(false);

	if (hunk.type === "clean") {
		const lines = hunk.resolvedLines || [];
		if (lines.length === 0) return null;

		// Collapsible context block
		const MAX_PREVIEW = 3;
		const isLong = lines.length > MAX_PREVIEW * 2;

		return (
			<div className="group">
				<button
					onClick={() => setCollapsed((c) => !c)}
					className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-pointer mb-0.5"
				>
					{collapsed ? (
						<ChevronRight className="w-2.5 h-2.5" />
					) : (
						<ChevronDown className="w-2.5 h-2.5" />
					)}
					{lines.length} unchanged line{lines.length !== 1 ? "s" : ""}
				</button>
				{!collapsed && (
					<pre className="text-[11px] font-mono leading-relaxed text-muted-foreground/40 overflow-x-auto max-h-40 overflow-y-auto bg-muted/20 px-3 py-1.5 border border-border/30 rounded-sm">
						{isLong ? (
							<>
								{lines
									.slice(0, MAX_PREVIEW)
									.map((l, i) => (
										<div key={i}>
											{l || " "}
										</div>
									))}
								<div className="text-muted-foreground/20 my-0.5">
									···{" "}
									{lines.length -
										MAX_PREVIEW *
											2}{" "}
									lines ···
								</div>
								{lines
									.slice(-MAX_PREVIEW)
									.map((l, i) => (
										<div
											key={`end-${i}`}
										>
											{l || " "}
										</div>
									))}
							</>
						) : (
							lines.map((l, i) => (
								<div key={i}>{l || " "}</div>
							))
						)}
					</pre>
				)}
			</div>
		);
	}

	// ── Conflict hunk ─────────────────────────────────────────

	const baseLines = hunk.baseLines || [];
	const headLines = hunk.headLines || [];
	const isResolved = resolution.status !== "pending";

	const statusLabel: Record<HunkResolutionStatus, string> = {
		pending: "",
		"accepted-base": "base accepted",
		"accepted-head": "head accepted",
		"accepted-both": "both accepted",
		custom: "custom edit",
	};

	return (
		<div
			onClick={onFocus}
			className={cn(
				"border rounded-sm transition-colors",
				isActive
					? "border-blue-500/40 ring-1 ring-blue-500/20"
					: "border-border",
				isResolved && !isActive ? "opacity-60" : "",
			)}
		>
			{/* Action bar */}
			<div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 relative after:absolute after:bottom-0 after:left-[5%] after:right-[5%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border/50 after:to-transparent">
				<div className="flex items-center gap-2">
					{isResolved ? (
						<Check className="w-3 h-3 text-blue-500" />
					) : (
						<AlertTriangle className="w-3 h-3 text-amber-500" />
					)}
					<span className="text-[10px] font-mono text-muted-foreground">
						Conflict hunk
						{isResolved && (
							<span className="ml-2 text-blue-500">
								— {statusLabel[resolution.status]}
							</span>
						)}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						onClick={(e) => {
							e.stopPropagation();
							onAcceptBase(baseLines);
						}}
						className={cn(
							"px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors cursor-pointer",
							resolution.status === "accepted-base"
								? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
								: "bg-muted/50 dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.08]",
						)}
						title="Accept base (1)"
					>
						Base
					</button>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onAcceptHead(headLines);
						}}
						className={cn(
							"px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors cursor-pointer",
							resolution.status === "accepted-head"
								? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
								: "bg-muted/50 dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.08]",
						)}
						title="Accept head (2)"
					>
						Head
					</button>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onAcceptBoth(baseLines, headLines);
						}}
						className={cn(
							"px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors cursor-pointer",
							resolution.status === "accepted-both"
								? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
								: "bg-muted/50 dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.08]",
						)}
						title="Accept both (3)"
					>
						Both
					</button>
					<button
						onClick={(e) => {
							e.stopPropagation();
							if (!editing) {
								const current =
									resolution.status !==
									"pending"
										? resolution.resolvedLines.join(
												"\n",
											)
										: baseLines.join(
												"\n",
											);
								setEditText(current);
								setEditing(true);
							} else {
								setEditing(false);
							}
						}}
						className={cn(
							"px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors cursor-pointer",
							editing || resolution.status === "custom"
								? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
								: "bg-muted/50 dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.08]",
						)}
						title="Edit manually (e)"
					>
						Edit
					</button>
				</div>
			</div>

			{/* Side-by-side diff */}
			{!editing && (
				<div className="grid grid-cols-2 relative after:absolute after:top-[10%] after:bottom-[10%] after:left-1/2 after:w-px after:bg-gradient-to-b after:from-transparent after:via-border/50 after:to-transparent">
					{/* Base side */}
					<div className="min-w-0">
						<div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 bg-red-500/5 relative after:absolute after:bottom-0 after:left-[8%] after:right-[8%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border/30 after:to-transparent">
							{baseBranch} (base)
						</div>
						<pre className="text-[11px] font-mono leading-relaxed overflow-x-auto px-3 py-1.5 bg-red-500/[0.03] min-h-[2rem]">
							{baseLines.length > 0 ? (
								baseLines.map((l, i) => (
									<div
										key={i}
										className="text-red-700/70 dark:text-red-400/60"
									>
										{l || " "}
									</div>
								))
							) : (
								<div className="text-muted-foreground/30 italic">
									empty
								</div>
							)}
						</pre>
					</div>

					{/* Head side */}
					<div className="min-w-0">
						<div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 bg-green-500/5 relative after:absolute after:bottom-0 after:left-[8%] after:right-[8%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border/30 after:to-transparent">
							{headBranch} (head)
						</div>
						<pre className="text-[11px] font-mono leading-relaxed overflow-x-auto px-3 py-1.5 bg-green-500/[0.03] min-h-[2rem]">
							{headLines.length > 0 ? (
								headLines.map((l, i) => (
									<div
										key={i}
										className="text-green-700/70 dark:text-green-400/60"
									>
										{l || " "}
									</div>
								))
							) : (
								<div className="text-muted-foreground/30 italic">
									empty
								</div>
							)}
						</pre>
					</div>
				</div>
			)}

			{/* Edit mode */}
			{editing && (
				<div className="p-3 space-y-2">
					<textarea
						value={editText}
						onChange={(e) => setEditText(e.target.value)}
						className="w-full min-h-[6rem] bg-transparent border border-border px-3 py-2 text-[11px] font-mono leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors resize-y"
						placeholder="Enter resolved content..."
					/>
					<div className="flex items-center gap-2 justify-end">
						<button
							onClick={() => setEditing(false)}
							className="px-2 py-1 text-[10px] font-mono rounded-sm bg-muted/50 dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
						>
							Cancel
						</button>
						<button
							onClick={() => {
								onCustom(editText.split("\n"));
								setEditing(false);
							}}
							className="px-2 py-1 text-[10px] font-mono bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer"
						>
							Apply
						</button>
					</div>
				</div>
			)}

			{/* Resolved preview */}
			{isResolved && !editing && (
				<div className="relative before:absolute before:top-0 before:left-[5%] before:right-[5%] before:h-px before:bg-gradient-to-r before:from-transparent before:via-border/30 before:to-transparent">
					<div className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-blue-500/60 bg-blue-500/5 relative after:absolute after:bottom-0 after:left-[8%] after:right-[8%] after:h-px after:bg-gradient-to-r after:from-transparent after:via-border/30 after:to-transparent">
						Resolved
					</div>
					<pre className="text-[11px] font-mono leading-relaxed overflow-x-auto px-3 py-1.5 bg-blue-500/[0.02] max-h-40 overflow-y-auto">
						{resolution.resolvedLines.length > 0 ? (
							resolution.resolvedLines.map((l, i) => (
								<div
									key={i}
									className="text-foreground/70"
								>
									{l || " "}
								</div>
							))
						) : (
							<div className="text-muted-foreground/30 italic">
								empty (lines removed)
							</div>
						)}
					</pre>
				</div>
			)}
		</div>
	);
}
