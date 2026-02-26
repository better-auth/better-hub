"use client";

import React, { useState, useTransition, useRef, useCallback, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
	parseDiffPatch,
	parseHunkHeader,
	type DiffLine,
	type DiffSegment,
} from "@/lib/github-utils";
import type { SyntaxToken } from "@/lib/shiki";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import Image from "next/image";
import {
	File,
	FileText,
	FilePlus2,
	FileX2,
	FileEdit,
	ArrowRight,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	ChevronUp,
	WrapText,
	Columns2,
	Plus,
	X,
	Loader2,
	CornerDownLeft,
	Eye,
	EyeOff,
	Code2,
	Lightbulb,
	Check,
	CheckCircle2,
	Circle,
	MessageSquare,
	UnfoldVertical,
	FileCode,
	Ghost,
	GitCommitHorizontal,
	Search,
	Pencil,
} from "lucide-react";
import {
	addPRReviewComment,
	commitSuggestion,
	commitFileEditOnPR,
	resolveReviewThread,
	unresolveReviewThread,
} from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { CommitDialog } from "@/components/shared/commit-dialog";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";
import { MarkdownEditor, type MarkdownEditorRef } from "@/components/shared/markdown-editor";
import type { ReviewThread, CheckStatus } from "@/lib/github";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { CheckStatusBadge } from "@/components/pr/check-status-badge";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface DiffFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

interface ReviewComment {
	id: number;
	user: { login: string; avatar_url: string } | null;
	body: string;
	path: string;
	line: number | null;
	start_line?: number | null;
	original_line: number | null;
	side: string | null;
	created_at: string;
}

interface ReviewSummary {
	id: number;
	user: { login: string; avatar_url: string } | null;
	state: string;
	submitted_at: string | null;
}

interface PRCommit {
	sha: string;
	commit: {
		message: string;
		author: { name: string; date: string } | null;
	};
	author: { login: string; avatar_url: string } | null;
}

interface PRDiffViewerProps {
	files: DiffFile[];
	reviewComments?: ReviewComment[];
	reviewThreads?: ReviewThread[];
	reviewSummaries?: ReviewSummary[];
	commits?: PRCommit[];
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headSha?: string;
	headBranch?: string;
	baseSha?: string;
	canWrite?: boolean;
	highlightData?: Record<string, Record<string, SyntaxToken[]>>;
	participants?: Array<{ login: string; avatar_url: string }>;
	checkStatus?: CheckStatus;
}

type AddContextCallback = (context: {
	filename: string;
	startLine: number;
	endLine: number;
	selectedCode: string;
	side: "LEFT" | "RIGHT";
}) => void;

type SidebarMode = "files" | "reviews" | "commits";

export function PRDiffViewer({
	files,
	reviewComments = [],
	reviewThreads = [],
	reviewSummaries = [],
	commits = [],
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
	baseSha,
	canWrite = true,
	highlightData = {},
	participants,
	checkStatus,
}: PRDiffViewerProps) {
	const globalChat = useGlobalChatOptional();
	const onAddContext = globalChat?.addCodeContext;
	const searchParams = useSearchParams();
	const router = useRouter();

	// Resolve initial index from ?file= query param
	const [activeIndex, setActiveIndex] = useState(() => {
		const fileParam = searchParams.get("file");
		if (fileParam) {
			const idx = files.findIndex((f) => f.filename === fileParam);
			if (idx >= 0) return idx;
		}
		return 0;
	});
	const [wordWrap, setWordWrap] = useState(true);
	const [splitView, setSplitView] = useState(false);
	const [sidebarWidth, setSidebarWidth] = useState(220);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
	const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
		const tab = searchParams.get("tab");
		if (tab === "reviews" || tab === "commits") return tab;
		return "files";
	});
	const [scrollToLine, setScrollToLine] = useState<number | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
	const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

	const currentFile = files[activeIndex];

	// Sync active file to URL ?file= param (only when activeIndex changes)
	const prevIndexRef = useRef(activeIndex);
	useEffect(() => {
		if (!currentFile) return;
		if (
			prevIndexRef.current === activeIndex &&
			searchParams.get("file") === currentFile.filename
		)
			return;
		prevIndexRef.current = activeIndex;
		const url = new URL(window.location.href);
		url.searchParams.set("file", currentFile.filename);
		window.history.replaceState(null, "", url.toString());
	}, [activeIndex, currentFile]); // eslint-disable-line react-hooks/exhaustive-deps

	// Sync sidebar mode to URL ?tab= param
	useEffect(() => {
		const url = new URL(window.location.href);
		if (sidebarMode === "files") {
			url.searchParams.delete("tab");
		} else {
			url.searchParams.set("tab", sidebarMode);
		}
		window.history.replaceState(null, "", url.toString());
	}, [sidebarMode]);

	// Listen for Ghost chat file navigation events
	useEffect(() => {
		const handler = (e: Event) => {
			const { filename, line } = (
				e as CustomEvent<{ filename: string; line?: number }>
			).detail;
			const idx = files.findIndex((f) => f.filename === filename);
			if (idx >= 0) {
				setActiveIndex(idx);
				if (line) {
					setScrollToLine(line);
				}
			}
		};
		window.addEventListener("ghost:navigate-to-file", handler);
		return () => window.removeEventListener("ghost:navigate-to-file", handler);
	}, [files]);

	const handleScrollComplete = useCallback(() => setScrollToLine(null), []);

	const goToPrev = useCallback(() => setActiveIndex((i) => Math.max(0, i - 1)), []);
	const goToNext = useCallback(
		() => setActiveIndex((i) => Math.min(files.length - 1, i + 1)),
		[files.length],
	);

	const toggleViewed = (filename: string) => {
		setViewedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(filename)) next.delete(filename);
			else next.add(filename);
			return next;
		});
	};

	const viewedCount = viewedFiles.size;

	// Group review comments by file
	const commentsByFile = new Map<string, ReviewComment[]>();
	for (const rc of reviewComments) {
		const existing = commentsByFile.get(rc.path) || [];
		existing.push(rc);
		commentsByFile.set(rc.path, existing);
	}

	// Group review threads by file
	const threadsByFile = new Map<string, ReviewThread[]>();
	for (const t of reviewThreads) {
		const existing = threadsByFile.get(t.path) || [];
		existing.push(t);
		threadsByFile.set(t.path, existing);
	}

	const unresolvedThreadCount = reviewThreads.filter((t) => !t.isResolved).length;

	const handleSidebarResize = useCallback((clientX: number) => {
		if (!containerRef.current) return;
		const rect = containerRef.current.getBoundingClientRect();
		const x = clientX - rect.left;
		setSidebarWidth(Math.max(140, Math.min(400, x)));
	}, []);

	return (
		<div ref={containerRef} className="flex flex-1 min-h-0 min-w-0">
			{/* File sidebar */}
			{!sidebarCollapsed && (
				<>
					<div
						className="hidden lg:flex flex-col shrink-0 border-r border-border"
						style={{
							width: sidebarWidth,
							transition: isDragging
								? "none"
								: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
						}}
					>
						{/* Sidebar header */}
						<div className="shrink-0 flex items-center gap-2 px-3 py-2">
							<span className="text-[11px] font-mono text-foreground font-medium">
								{files.length} file
								{files.length !== 1 ? "s" : ""}
							</span>
							<span className="text-[10px] font-mono text-success">
								+{totalAdditions}
							</span>
							<span className="text-[10px] font-mono text-destructive">
								-{totalDeletions}
							</span>
							{viewedCount > 0 && (
								<span className="text-[10px] font-mono text-muted-foreground/60">
									{viewedCount}/{files.length}
								</span>
							)}
							<div className="flex items-center gap-0.5 ml-auto">
								<button
									onClick={() =>
										setSidebarMode(
											"files",
										)
									}
									className={cn(
										"p-1 rounded transition-colors cursor-pointer",
										sidebarMode ===
											"files"
											? "text-foreground bg-accent"
											: "text-muted-foreground/60 hover:text-muted-foreground",
									)}
									title="Files"
								>
									<Code2 className="w-3.5 h-3.5" />
								</button>
								<button
									onClick={() =>
										setSidebarMode(
											"reviews",
										)
									}
									className={cn(
										"p-1 rounded transition-colors cursor-pointer relative",
										sidebarMode ===
											"reviews"
											? "text-foreground bg-accent"
											: "text-muted-foreground/60 hover:text-muted-foreground",
									)}
									title="Reviews"
								>
									<MessageSquare className="w-3.5 h-3.5" />
									{unresolvedThreadCount >
										0 && (
										<span className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center text-[8px] font-mono rounded-full bg-warning/20 text-warning">
											{
												unresolvedThreadCount
											}
										</span>
									)}
								</button>
								<button
									onClick={() =>
										setSidebarMode(
											"commits",
										)
									}
									className={cn(
										"p-1 rounded transition-colors cursor-pointer relative",
										sidebarMode ===
											"commits"
											? "text-foreground bg-accent"
											: "text-muted-foreground/60 hover:text-muted-foreground",
									)}
									title="Commits"
								>
									<GitCommitHorizontal className="w-3.5 h-3.5" />
									{commits.length > 0 && (
										<span className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center text-[8px] font-mono rounded-full bg-info/20 text-info">
											{
												commits.length
											}
										</span>
									)}
								</button>
							</div>
						</div>
						{viewedCount > 0 && (
							<div className="shrink-0 h-1 bg-border/60 mx-3 rounded-full overflow-hidden">
								<div
									className="h-full bg-success/70 transition-all duration-300 rounded-full"
									style={{
										width: `${(viewedCount / files.length) * 100}%`,
									}}
								/>
							</div>
						)}

						{/* Sidebar content */}
						<div className="flex-1 overflow-y-auto overscroll-contain py-1">
							{sidebarMode === "files" ? (
								<>
									{files.map((file, i) => {
										const name =
											file.filename
												.split(
													"/",
												)
												.pop() ||
											file.filename;
										const dir =
											file.filename.includes(
												"/",
											)
												? file.filename.slice(
														0,
														file.filename.lastIndexOf(
															"/",
														),
													)
												: "";
										const Icon =
											getFileIcon(
												file.status,
											);
										const isViewed =
											viewedFiles.has(
												file.filename,
											);
										const fileThreads =
											threadsByFile.get(
												file.filename,
											);

										return (
											<button
												key={
													file.filename
												}
												onClick={() =>
													setActiveIndex(
														i,
													)
												}
												className={cn(
													"w-full flex items-center gap-1.5 px-3 py-1 text-left transition-colors cursor-pointer group/file",
													activeIndex ===
														i
														? "bg-muted/60"
														: "hover:bg-muted/50",
													isViewed &&
														"opacity-50",
												)}
											>
												{isViewed ? (
													<Check className="w-3 h-3 shrink-0 text-success" />
												) : (
													<Icon
														className={cn(
															"w-3 h-3 shrink-0",
															getFileIconColor(
																file.status,
															),
														)}
													/>
												)}
												<div className="flex-1 min-w-0 truncate">
													<span
														className={cn(
															"text-[11px] font-mono group-hover/file:text-foreground",
															isViewed
																? "text-muted-foreground/60 line-through"
																: "text-foreground/80",
														)}
													>
														{
															name
														}
													</span>
													{dir && (
														<span className="block text-[9px] font-mono text-muted-foreground/50 truncate">
															{
																dir
															}
														</span>
													)}
												</div>
												{fileThreads &&
													fileThreads.length >
														0 && (
														<span
															className="w-1.5 h-1.5 rounded-full bg-warning/60 shrink-0"
															title={`${fileThreads.length} review thread${fileThreads.length !== 1 ? "s" : ""}`}
														/>
													)}
												<span className="text-[10px] font-mono text-success tabular-nums shrink-0">
													+
													{
														file.additions
													}
												</span>
												<span className="text-[10px] font-mono text-destructive tabular-nums shrink-0">
													-
													{
														file.deletions
													}
												</span>
											</button>
										);
									})}
								</>
							) : sidebarMode === "commits" ? (
								<SidebarCommits
									commits={commits}
									owner={owner}
									repo={repo}
									checkStatus={checkStatus}
								/>
							) : (
								<SidebarReviews
									files={files}
									threadsByFile={
										threadsByFile
									}
									reviewSummaries={
										reviewSummaries
									}
									onNavigateToFile={(
										i,
										line,
									) => {
										setActiveIndex(i);
										setScrollToLine(
											line ??
												null,
										);
									}}
									owner={owner}
									repo={repo}
									pullNumber={pullNumber}
								/>
							)}
						</div>
					</div>

					{/* Sidebar resize handle */}
					<div className="hidden lg:flex shrink-0">
						<ResizeHandle
							onResize={handleSidebarResize}
							onDragStart={() => setIsDragging(true)}
							onDragEnd={() => setIsDragging(false)}
							onDoubleClick={() => setSidebarWidth(220)}
						/>
					</div>
				</>
			)}

			{/* Single file diff view */}
			<div className="flex-1 min-w-0 min-h-0 flex flex-col">
				{currentFile && (
					<SingleFileDiff
						file={currentFile}
						index={activeIndex}
						total={files.length}
						wordWrap={wordWrap}
						splitView={splitView}
						onToggleWrap={() => setWordWrap((w) => !w)}
						onToggleSplit={() => setSplitView((s) => !s)}
						sidebarCollapsed={sidebarCollapsed}
						onToggleSidebar={() =>
							setSidebarCollapsed((c) => !c)
						}
						onPrev={goToPrev}
						onNext={goToNext}
						fileComments={
							commentsByFile.get(currentFile.filename) ||
							[]
						}
						viewed={viewedFiles.has(currentFile.filename)}
						onToggleViewed={() =>
							toggleViewed(currentFile.filename)
						}
						owner={owner}
						repo={repo}
						pullNumber={pullNumber}
						headSha={headSha}
						headBranch={headBranch}
						baseSha={baseSha}
						scrollToLine={scrollToLine}
						onScrollComplete={handleScrollComplete}
						canWrite={canWrite}
						fileHighlightData={
							highlightData[currentFile.filename]
						}
						onAddContext={onAddContext}
						participants={participants}
					/>
				)}
			</div>
		</div>
	);
}

function SingleFileDiff({
	file,
	index,
	total,
	wordWrap,
	splitView,
	onToggleWrap,
	onToggleSplit,
	sidebarCollapsed,
	onToggleSidebar,
	onPrev,
	onNext,
	fileComments,
	viewed,
	onToggleViewed,
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
	baseSha,
	scrollToLine,
	onScrollComplete,
	canWrite = true,
	fileHighlightData,
	onAddContext,
	participants,
}: {
	file: DiffFile;
	index: number;
	total: number;
	wordWrap: boolean;
	splitView: boolean;
	onToggleWrap: () => void;
	onToggleSplit: () => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	onPrev: () => void;
	onNext: () => void;
	fileComments: ReviewComment[];
	viewed: boolean;
	onToggleViewed: () => void;
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headSha?: string;
	headBranch?: string;
	baseSha?: string;
	scrollToLine?: number | null;
	onScrollComplete?: () => void;
	canWrite?: boolean;
	fileHighlightData?: Record<string, SyntaxToken[]>;
	onAddContext?: AddContextCallback;
	participants?: Array<{ login: string; avatar_url: string }>;
}) {
	const { emit } = useMutationEvents();
	const lines = file.patch ? parseDiffPatch(file.patch) : [];
	const diffContainerRef = useRef<HTMLDivElement>(null);
	const onScrollCompleteRef = useRef(onScrollComplete);
	onScrollCompleteRef.current = onScrollComplete;

	useEffect(() => {
		if (scrollToLine == null || !diffContainerRef.current) return;
		const row = diffContainerRef.current.querySelector(`[data-line="${scrollToLine}"]`);
		if (row) {
			// Small delay to let the file render
			requestAnimationFrame(() => {
				row.scrollIntoView({ behavior: "smooth", block: "center" });
				// Brief highlight
				row.classList.add("!bg-warning/10");
				setTimeout(() => row.classList.remove("!bg-warning/10"), 2000);
			});
		}
		onScrollCompleteRef.current?.();
	}, [scrollToLine]);
	const [commentRange, setCommentRange] = useState<{
		startLine: number;
		endLine: number;
		side: "LEFT" | "RIGHT";
	} | null>(null);
	// Track which line the user started clicking on for drag-select
	const [selectingFrom, setSelectingFrom] = useState<{
		line: number;
		side: "LEFT" | "RIGHT";
	} | null>(null);
	const [hoverLine, setHoverLine] = useState<number | null>(null);
	const hoverLineRef = useRef<number | null>(null);
	const [hideReviewComments, setHideReviewComments] = useState(false);
	const selectingFromRef = useRef<{ line: number; side: "LEFT" | "RIGHT" } | null>(null);

	// Expand context & full file view state
	const [expandedLines, setExpandedLines] = useState<Map<number, string[]>>(new Map());
	const [fileContent, setFileContent] = useState<string[] | null>(null);
	const [fullFileTokens, setFullFileTokens] = useState<SyntaxToken[][] | null>(null);
	const [isLoadingExpand, setIsLoadingExpand] = useState<number | null>(null);
	const [showFullFile, setShowFullFile] = useState(false);
	const [isLoadingFullFile, setIsLoadingFullFile] = useState(false);

	// Inline edit state
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState("");
	const [originalEditContent, setOriginalEditContent] = useState("");
	const [baseEditContent, setBaseEditContent] = useState<string | null>(null);
	const [editSha, setEditSha] = useState<string | null>(null);
	const [isLoadingEdit, setIsLoadingEdit] = useState(false);
	const [commitDialogOpen, setCommitDialogOpen] = useState(false);
	const [editTokens, setEditTokens] = useState<SyntaxToken[][] | null>(null);
	const [editView, setEditView] = useState<"edit" | "changes">("edit");
	const editTextareaRef = useRef<HTMLTextAreaElement>(null);
	const editPreRef = useRef<HTMLPreElement>(null);

	// Compute which lines were changed by the PR (new-file line numbers from the patch)
	const prChangedLines = useMemo(() => {
		if (!file.patch) return new Set<number>();
		const diffLines = parseDiffPatch(file.patch);
		const changed = new Set<number>();
		for (const line of diffLines) {
			if (line.type === "add" && line.newLineNumber !== undefined) {
				changed.add(line.newLineNumber);
			}
		}
		return changed;
	}, [file.patch]);

	// Sorted array for prev/next navigation
	const prChangedLinesSorted = useMemo(
		() => Array.from(prChangedLines).sort((a, b) => a - b),
		[prChangedLines],
	);

	// Search state
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [matchCase, setMatchCase] = useState(false);
	const [currentSearchIdx, setCurrentSearchIdx] = useState(-1);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const isHoveringDiffRef = useRef(false);
	const searchMatchesRef = useRef<number[]>([]);

	// Reset search and edit when file changes
	const prevFilenameRef = useRef(file.filename);
	if (prevFilenameRef.current !== file.filename) {
		prevFilenameRef.current = file.filename;
		if (searchOpen) {
			setSearchOpen(false);
			setSearchQuery("");
			setCurrentSearchIdx(-1);
		}
		if (isEditing) {
			setIsEditing(false);
			setEditContent("");
			setOriginalEditContent("");
			setBaseEditContent(null);
			setEditSha(null);
			setEditTokens(null);
			setEditView("edit");
			setCommitDialogOpen(false);
		}
	}

	// Derive matches (pure computation, no effect needed)
	const searchMatches = useMemo(() => {
		if (!searchOpen || !searchQuery) return [];
		const query = matchCase ? searchQuery : searchQuery.toLowerCase();
		const found: number[] = [];
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].type === "header") continue;
			const content = matchCase
				? lines[i].content
				: lines[i].content.toLowerCase();
			let pos = 0;
			while (true) {
				const idx = content.indexOf(query, pos);
				if (idx === -1) break;
				found.push(i);
				pos = idx + query.length;
			}
		}
		return found;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchOpen, searchQuery, matchCase, file.patch]);

	// Reset currentSearchIdx when matches change
	if (searchMatches !== searchMatchesRef.current) {
		searchMatchesRef.current = searchMatches;
		const nextIdx = searchMatches.length > 0 ? 0 : -1;
		if (currentSearchIdx !== nextIdx) {
			setCurrentSearchIdx(nextIdx);
		}
	}

	// Highlight matching rows
	useEffect(() => {
		if (!diffContainerRef.current) return;
		diffContainerRef.current.querySelectorAll("tr[data-diff-idx]").forEach((el) => {
			el.classList.remove("diff-search-match", "diff-search-match-active");
		});
		if (searchMatches.length === 0 || currentSearchIdx < 0) return;
		const matchedIndices = new Set(searchMatches);
		for (const idx of matchedIndices) {
			const el = diffContainerRef.current.querySelector(
				`tr[data-diff-idx="${idx}"]`,
			);
			el?.classList.add("diff-search-match");
		}
		const activeIdx = searchMatches[currentSearchIdx];
		if (activeIdx !== undefined) {
			const activeEl = diffContainerRef.current.querySelector(
				`tr[data-diff-idx="${activeIdx}"]`,
			);
			if (activeEl) {
				activeEl.classList.remove("diff-search-match");
				activeEl.classList.add("diff-search-match-active");
				activeEl.scrollIntoView({ block: "center", behavior: "smooth" });
			}
		}
	}, [searchMatches, currentSearchIdx]);

	// Cmd+F intercept
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				(e.metaKey || e.ctrlKey) &&
				e.key === "f" &&
				isHoveringDiffRef.current
			) {
				e.preventDefault();
				e.stopPropagation();
				setSearchOpen(true);
				setTimeout(() => searchInputRef.current?.focus(), 0);
			}
		};
		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, []);

	const closeDiffSearch = useCallback(() => {
		setSearchOpen(false);
		setSearchQuery("");
		setCurrentSearchIdx(-1);
		if (diffContainerRef.current) {
			diffContainerRef.current
				.querySelectorAll("tr[data-diff-idx]")
				.forEach((el) => {
					el.classList.remove(
						"diff-search-match",
						"diff-search-match-active",
					);
				});
		}
	}, []);

	const matchCount = searchMatches.length;

	const goToNextSearch = useCallback(() => {
		if (matchCount === 0) return;
		setCurrentSearchIdx((prev) => (prev + 1) % matchCount);
	}, [matchCount]);

	const goToPrevSearch = useCallback(() => {
		if (matchCount === 0) return;
		setCurrentSearchIdx((prev) => (prev - 1 + matchCount) % matchCount);
	}, [matchCount]);

	const handleDiffSearchKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				closeDiffSearch();
			} else if (e.key === "Enter" && e.shiftKey) {
				e.preventDefault();
				goToPrevSearch();
			} else if (e.key === "Enter") {
				e.preventDefault();
				goToNextSearch();
			}
		},
		[closeDiffSearch, goToNextSearch, goToPrevSearch],
	);

	// Compute hunk info for expand context
	const hunkInfos = lines.reduce<
		{ index: number; newStart: number; newCount: number; endNewLine: number }[]
	>((acc, line, i) => {
		if (line.type === "header") {
			const parsed = parseHunkHeader(line.content);
			if (parsed) {
				acc.push({
					index: i,
					newStart: parsed.newStart,
					newCount: parsed.newCount,
					endNewLine: parsed.newStart + parsed.newCount - 1,
				});
			}
		}
		return acc;
	}, []);

	const fetchFileContent = useCallback(
		async (withHighlight = false): Promise<string[] | null> => {
			if (fileContent && (!withHighlight || fullFileTokens)) return fileContent;
			if (!owner || !repo || !headSha) return null;
			try {
				const url = `/api/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(file.filename)}&ref=${encodeURIComponent(headSha)}${withHighlight ? "&highlight=true" : ""}`;
				const res = await fetch(url);
				if (!res.ok) return null;
				const data = await res.json();
				const contentLines = (data.content as string).split("\n");
				setFileContent(contentLines);
				if (data.tokens) {
					setFullFileTokens(data.tokens);
				}
				return contentLines;
			} catch {
				return null;
			}
		},
		[fileContent, fullFileTokens, owner, repo, headSha, file.filename],
	);

	const handleStartEdit = useCallback(async () => {
		if (!owner || !repo || !headBranch) return;
		setIsLoadingEdit(true);
		try {
			// Fetch head content (for editing) and base content (for merged diff) in parallel
			const headUrl = `/api/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(file.filename)}&ref=${encodeURIComponent(headBranch)}&highlight=true`;
			const fetches: Promise<Response>[] = [fetch(headUrl)];
			if (baseSha) {
				const baseUrl = `/api/file-content?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(file.filename)}&ref=${encodeURIComponent(baseSha)}`;
				fetches.push(fetch(baseUrl));
			}
			const [headRes, baseRes] = await Promise.all(fetches);
			if (!headRes.ok) return;
			const headData = await headRes.json();
			const content = headData.content as string;
			if (content == null) return;
			setEditContent(content);
			setOriginalEditContent(content);
			setEditSha(headData.sha || null);
			setEditTokens(headData.tokens || null);
			setEditView("edit");
			// Base content for merged diff on Changes tab
			if (baseRes?.ok) {
				const baseData = await baseRes.json();
				setBaseEditContent(baseData.content as string);
			} else {
				setBaseEditContent(null);
			}
			setIsEditing(true);
		} catch {
			// fetch or parse error
		} finally {
			setIsLoadingEdit(false);
		}
	}, [owner, repo, headBranch, baseSha, file.filename]);

	const handleCancelEdit = useCallback(() => {
		setIsEditing(false);
		setEditContent("");
		setOriginalEditContent("");
		setBaseEditContent(null);
		setEditSha(null);
		setEditTokens(null);
		setEditView("edit");
	}, []);

	const diffRouter = useRouter();
	const handleCommitEdit = useCallback(
		async (message: string) => {
			if (!owner || !repo || !pullNumber || !headBranch || !editSha) return;
			const result = await commitFileEditOnPR(
				owner,
				repo,
				pullNumber,
				file.filename,
				headBranch,
				editContent,
				editSha,
				message,
			);
			if (result.error) {
				throw new Error(result.error);
			}
			setIsEditing(false);
			setEditContent("");
			setOriginalEditContent("");
			setBaseEditContent(null);
			setEditSha(null);
			setEditTokens(null);
			setEditView("edit");
			emit({
				type: "pr:file-committed",
				owner: owner!,
				repo: repo!,
				number: pullNumber!,
			});
			diffRouter.refresh();
		},
		[
			owner,
			repo,
			pullNumber,
			headBranch,
			editSha,
			editContent,
			file.filename,
			diffRouter,
			emit,
		],
	);

	// Cmd+S to open commit dialog while editing
	useEffect(() => {
		if (!isEditing) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault();
				setCommitDialogOpen(true);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isEditing]);

	// Sync scroll between textarea and pre overlay
	const handleEditScroll = useCallback(() => {
		if (editTextareaRef.current && editPreRef.current) {
			editPreRef.current.scrollTop = editTextareaRef.current.scrollTop;
			editPreRef.current.scrollLeft = editTextareaRef.current.scrollLeft;
		}
	}, []);

	// Handle textarea input without breaking undo — read from DOM
	const handleEditInput = useCallback(() => {
		if (editTextareaRef.current) {
			const val = editTextareaRef.current.value;
			setEditContent(val);
		}
	}, []);

	// Tab key inserts indentation instead of moving focus
	const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Tab") {
			e.preventDefault();
			const ta = e.currentTarget;
			const start = ta.selectionStart;
			const end = ta.selectionEnd;

			if (e.shiftKey) {
				// Shift+Tab: dedent selected lines
				const val = ta.value;
				const lineStart = val.lastIndexOf("\n", start - 1) + 1;
				const lineEnd = end;
				const selectedText = val.slice(lineStart, lineEnd);
				const dedented = selectedText.replace(/^  /gm, "");
				const diff = selectedText.length - dedented.length;

				// Use execCommand to preserve undo
				ta.selectionStart = lineStart;
				ta.selectionEnd = lineEnd;
				document.execCommand("insertText", false, dedented);
				ta.selectionStart = Math.max(
					lineStart,
					start - (start > lineStart ? Math.min(2, diff) : 0),
				);
				ta.selectionEnd = end - diff;
			} else if (start !== end) {
				// Tab with selection: indent all selected lines
				const val = ta.value;
				const lineStart = val.lastIndexOf("\n", start - 1) + 1;
				const selectedText = val.slice(lineStart, end);
				const indented = selectedText.replace(/^/gm, "  ");
				const lineCount = selectedText.split("\n").length;

				ta.selectionStart = lineStart;
				ta.selectionEnd = end;
				document.execCommand("insertText", false, indented);
				ta.selectionStart = start + 2;
				ta.selectionEnd = end + lineCount * 2;
			} else {
				// No selection: insert 2 spaces via execCommand (preserves undo)
				document.execCommand("insertText", false, "  ");
			}
			setEditContent(ta.value);
		}
	}, []);

	// Sync textarea DOM value when editContent changes programmatically (initial load)
	const editContentInitRef = useRef(false);
	useEffect(() => {
		if (isEditing && editTextareaRef.current && !editContentInitRef.current) {
			editTextareaRef.current.value = editContent;
			editContentInitRef.current = true;
		}
		if (!isEditing) editContentInitRef.current = false;
	}, [isEditing, editContent]);

	// Debounced re-tokenization — skip if content matches original (initial load already has tokens)
	const prevEditContentRef = useRef<string>("");
	useEffect(() => {
		if (!isEditing || !editContent) return;
		// Skip re-tokenization if content hasn't changed from what we already have tokens for
		if (editContent === prevEditContentRef.current) return;
		prevEditContentRef.current = editContent;
		// Don't re-fetch on initial load — handleStartEdit already fetched tokens
		if (editContent === originalEditContent && editTokens) return;
		const timer = setTimeout(async () => {
			try {
				const res = await fetch("/api/highlight-code", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						code: editContent,
						filename: file.filename,
					}),
				});
				if (res.ok) {
					const data = await res.json();
					setEditTokens(data.tokens);
				}
			} catch {
				// silently fail — keep stale tokens
			}
		}, 500);
		return () => clearTimeout(timer);
	}, [isEditing, editContent, originalEditContent, editTokens, file.filename]);

	const handleExpandHunk = useCallback(
		async (hunkIdx: number) => {
			setIsLoadingExpand(hunkIdx);
			const content = await fetchFileContent();
			if (!content) {
				setIsLoadingExpand(null);
				return;
			}

			// Find the gap: from end of previous hunk to start of this hunk (in new-file line numbers)
			const currentHunk = hunkInfos.find((h) => h.index === hunkIdx);
			if (!currentHunk) {
				setIsLoadingExpand(null);
				return;
			}

			// Find previous hunk's end
			const prevHunk = hunkInfos.filter((h) => h.index < hunkIdx).pop();
			const gapStart = prevHunk ? prevHunk.endNewLine + 1 : 1;
			const gapEnd = currentHunk.newStart - 1;

			if (gapEnd >= gapStart) {
				// content is 0-indexed, line numbers are 1-indexed
				const expandedContent = content.slice(gapStart - 1, gapEnd);
				setExpandedLines((prev) => {
					const next = new Map(prev);
					next.set(hunkIdx, expandedContent);
					return next;
				});
			}
			setIsLoadingExpand(null);
		},
		[fetchFileContent, hunkInfos],
	);

	const handleToggleFullFile = useCallback(async () => {
		if (showFullFile) {
			setShowFullFile(false);
			return;
		}
		setIsLoadingFullFile(true);
		const content = await fetchFileContent(true);
		setIsLoadingFullFile(false);
		if (content) {
			setShowFullFile(true);
		}
	}, [showFullFile, fetchFileContent]);

	const dir = file.filename.includes("/")
		? file.filename.slice(0, file.filename.lastIndexOf("/") + 1)
		: "";
	const name = file.filename.slice(dir.length);
	const FileIcon = getFileIcon(file.status);

	// Index comments by line number for quick lookup
	const commentsByLine = new Map<string, ReviewComment[]>();
	for (const c of fileComments) {
		const lineNum = c.line ?? c.original_line;
		if (lineNum !== null) {
			const key = `${c.side || "RIGHT"}-${lineNum}`;
			const existing = commentsByLine.get(key) || [];
			existing.push(c);
			commentsByLine.set(key, existing);
		}
	}

	const canComment = !!(owner && repo && pullNumber && headSha);

	// Compute the content of the selected lines for suggestion pre-fill
	const selectedLinesContent = commentRange
		? lines
				.filter((l) => {
					if (l.type === "header") return false;
					if (commentRange.side === "LEFT") {
						// LEFT side = removed lines: match by oldLineNumber
						if (l.type !== "remove") return false;
						const ln = l.oldLineNumber;
						return (
							ln !== undefined &&
							ln >= commentRange.startLine &&
							ln <= commentRange.endLine
						);
					} else {
						// RIGHT side = add/context lines: match by newLineNumber
						if (l.type === "remove") return false;
						const ln = l.newLineNumber;
						return (
							ln !== undefined &&
							ln >= commentRange.startLine &&
							ln <= commentRange.endLine
						);
					}
				})
				.map((l) => l.content)
				.join("\n")
		: "";

	// Compute diff-formatted code for AI context (includes +/- markers)
	const selectedCodeForAI = commentRange
		? (() => {
				const startLine = Math.min(
					commentRange.startLine,
					commentRange.endLine,
				);
				const endLine = Math.max(
					commentRange.startLine,
					commentRange.endLine,
				);
				const isLeft = commentRange.side === "LEFT";

				const matchingLines = lines.filter((l) => {
					if (l.type === "header") return false;
					if (isLeft) {
						if (l.type !== "remove") return false;
						const ln = l.oldLineNumber;
						return (
							ln !== undefined &&
							ln >= startLine &&
							ln <= endLine
						);
					} else {
						if (l.type === "remove") return false;
						const ln = l.newLineNumber;
						return (
							ln !== undefined &&
							ln >= startLine &&
							ln <= endLine
						);
					}
				});

				return matchingLines
					.map((l) => {
						const prefix =
							l.type === "add"
								? "+"
								: l.type === "remove"
									? "-"
									: " ";
						return `${prefix} ${l.content}`;
					})
					.join("\n");
			})()
		: "";

	// Compute highlighted selection range
	const selectionRange =
		selectingFrom && hoverLine !== null
			? {
					start: Math.min(selectingFrom.line, hoverLine),
					end: Math.max(selectingFrom.line, hoverLine),
					side: selectingFrom.side,
				}
			: commentRange
				? {
						start: Math.min(
							commentRange.startLine,
							commentRange.endLine,
						),
						end: Math.max(
							commentRange.startLine,
							commentRange.endLine,
						),
						side: commentRange.side,
					}
				: null;

	// Build split rows for side-by-side view
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const splitRows = useMemo(
		() => (splitView ? buildSplitRows(lines) : []),
		[splitView, file.patch],
	);

	const handleLineClick = (lineNum: number, side: "LEFT" | "RIGHT", shiftKey: boolean) => {
		// If we're in a drag selection, ignore click — mouseup already handled it
		if (selectingFromRef.current) return;

		if (shiftKey && commentRange) {
			// Extend existing range with shift+click
			const allLines = [commentRange.startLine, commentRange.endLine, lineNum];
			setCommentRange({
				startLine: Math.min(...allLines),
				endLine: Math.max(...allLines),
				side: commentRange.side,
			});
		} else {
			// Single line comment
			setCommentRange({ startLine: lineNum, endLine: lineNum, side });
		}
	};

	const handleLineMouseDown = (lineNum: number, side: "LEFT" | "RIGHT") => {
		// Start potential drag selection
		selectingFromRef.current = { line: lineNum, side };
		hoverLineRef.current = lineNum;
		setSelectingFrom({ line: lineNum, side });
		setHoverLine(lineNum);

		const handleMouseUp = () => {
			document.removeEventListener("mouseup", handleMouseUp);
			const from = selectingFromRef.current;
			const hover = hoverLineRef.current;
			if (from && hover !== null) {
				const startLine = Math.min(from.line, hover);
				const endLine = Math.max(from.line, hover);
				setCommentRange({ startLine, endLine, side: from.side });
			}
			selectingFromRef.current = null;
			hoverLineRef.current = null;
			setSelectingFrom(null);
			setHoverLine(null);
		};
		document.addEventListener("mouseup", handleMouseUp);
	};

	const handleLineHover = (lineNum: number) => {
		if (selectingFromRef.current) {
			hoverLineRef.current = lineNum;
			setHoverLine(lineNum);
		}
	};

	return (
		<div
			className="flex flex-col flex-1 min-h-0"
			onMouseEnter={() => {
				isHoveringDiffRef.current = true;
			}}
			onMouseLeave={() => {
				isHoveringDiffRef.current = false;
			}}
		>
			{/* Sticky file header */}
			<div className="shrink-0 sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border">
				<div className="flex items-center gap-2 px-3 py-1.5">
					{/* Sidebar collapse/expand toggle */}
					<button
						onClick={onToggleSidebar}
						className="hidden lg:flex p-0.5 rounded transition-colors cursor-pointer shrink-0 text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60"
						title={
							sidebarCollapsed
								? "Show sidebar"
								: "Hide sidebar"
						}
					>
						{sidebarCollapsed ? (
							<ChevronRight className="w-3.5 h-3.5" />
						) : (
							<ChevronLeft className="w-3.5 h-3.5" />
						)}
					</button>

					<FileIcon
						className={cn(
							"w-3.5 h-3.5 shrink-0",
							getFileIconColor(file.status),
						)}
					/>

					<span className="text-xs font-mono truncate flex-1 min-w-0">
						{dir && (
							<span className="text-muted-foreground/60">
								{dir}
							</span>
						)}
						<span className="text-foreground font-medium">
							{name}
						</span>
						{file.previous_filename && (
							<span className="text-muted-foreground/50 ml-2 inline-flex items-center gap-1">
								<ArrowRight className="w-2.5 h-2.5 inline" />
								<span className="line-through">
									{file.previous_filename
										.split("/")
										.pop()}
								</span>
							</span>
						)}
					</span>

					<span className="text-[11px] font-mono text-success tabular-nums shrink-0">
						+{file.additions}
					</span>
					<span className="text-[11px] font-mono text-destructive tabular-nums shrink-0">
						-{file.deletions}
					</span>

					{/* Viewed toggle */}
					<button
						onClick={(e) => {
							e.stopPropagation();
							onToggleViewed();
						}}
						className={cn(
							"flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] transition-colors cursor-pointer shrink-0 ml-1",
							viewed
								? "bg-success/10 text-success"
								: "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60",
						)}
						title={
							viewed
								? "Mark as unreviewed"
								: "Mark as reviewed"
						}
					>
						{viewed ? (
							<Eye className="w-3 h-3" />
						) : (
							<EyeOff className="w-3 h-3" />
						)}
						{viewed ? "Viewed" : "Mark viewed"}
					</button>

					{/* Edit file inline */}
					{canWrite &&
						headBranch &&
						file.status !== "removed" &&
						file.filename &&
						(isEditing ? (
							<div className="flex items-center gap-1 shrink-0">
								{/* Edit / Changes toggle */}
								<div className="flex items-center bg-secondary/60 rounded overflow-hidden mr-1">
									<button
										onClick={() =>
											setEditView(
												"edit",
											)
										}
										className={cn(
											"px-2 py-0.5 text-[10px] font-mono transition-colors cursor-pointer",
											editView ===
												"edit"
												? "bg-accent text-foreground"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										Edit
									</button>
									<button
										onClick={() =>
											setEditView(
												"changes",
											)
										}
										className={cn(
											"px-2 py-0.5 text-[10px] font-mono transition-colors cursor-pointer",
											editView ===
												"changes"
												? "bg-accent text-foreground"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										Changes
									</button>
								</div>
								<button
									onClick={handleCancelEdit}
									className="px-2 py-0.5 rounded text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors cursor-pointer"
								>
									Cancel
								</button>
								<button
									onClick={() =>
										setCommitDialogOpen(
											true,
										)
									}
									className="px-2 py-0.5 rounded text-[10px] font-mono bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer"
								>
									Save
								</button>
							</div>
						) : (
							<button
								onClick={handleStartEdit}
								disabled={isLoadingEdit}
								className="p-0.5 rounded transition-colors cursor-pointer shrink-0 text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60 disabled:opacity-40"
								title="Edit file"
							>
								{isLoadingEdit ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<Pencil className="w-3.5 h-3.5" />
								)}
							</button>
						))}

					{/* Full file toggle */}
					<button
						onClick={handleToggleFullFile}
						disabled={isLoadingFullFile}
						className={cn(
							"p-0.5 rounded transition-colors cursor-pointer shrink-0",
							showFullFile
								? "bg-accent text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60",
							"disabled:opacity-40",
						)}
						title={
							showFullFile
								? "Show diff only"
								: "Show full file"
						}
					>
						{isLoadingFullFile ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<FileCode className="w-3.5 h-3.5" />
						)}
					</button>

					{/* Prev/next PR change navigation — visible in edit mode or full file view */}
					{(isEditing || showFullFile) &&
						prChangedLinesSorted.length > 0 && (
							<div className="flex items-center gap-0.5 shrink-0">
								<span className="w-1.5 h-1.5 rounded-full bg-success/60 shrink-0" />
								<button
									disabled={
										isEditing &&
										editView !== "edit"
									}
									onClick={() => {
										if (
											isEditing &&
											editView ===
												"edit" &&
											editTextareaRef.current
										) {
											const cursorPos =
												editTextareaRef
													.current
													.selectionStart;
											const currentLine =
												editContent
													.slice(
														0,
														cursorPos,
													)
													.split(
														"\n",
													).length;
											const prev =
												[
													...prChangedLinesSorted,
												]
													.reverse()
													.find(
														(
															l,
														) =>
															l <
															currentLine,
													);
											const target =
												prev ??
												prChangedLinesSorted[
													prChangedLinesSorted.length -
														1
												];
											if (
												target !==
												undefined
											) {
												const container =
													editTextareaRef.current.closest(
														".overflow-auto",
													);
												const gutterLine =
													container?.querySelector(
														`[data-edit-line="${target}"]`,
													);
												gutterLine?.scrollIntoView(
													{
														block: "center",
														behavior: "smooth",
													},
												);
												const edLines =
													editContent.split(
														"\n",
													);
												const pos =
													edLines
														.slice(
															0,
															target -
																1,
														)
														.reduce(
															(
																s,
																l,
															) =>
																s +
																l.length +
																1,
															0,
														);
												editTextareaRef.current.focus();
												editTextareaRef.current.setSelectionRange(
													pos,
													pos,
												);
											}
										} else if (
											diffContainerRef.current
										) {
											const rows =
												Array.from(
													diffContainerRef.current.querySelectorAll<HTMLElement>(
														"tr.diff-add-row",
													),
												);
											if (
												rows.length ===
												0
											)
												return;
											const containerRect =
												diffContainerRef.current.getBoundingClientRect();
											const centerY =
												containerRect.top +
												containerRect.height /
													2;
											// Find the row closest to but above center
											let target =
												rows[
													rows.length -
														1
												];
											for (
												let ri =
													rows.length -
													1;
												ri >=
												0;
												ri--
											) {
												if (
													rows[
														ri
													].getBoundingClientRect()
														.top <
													centerY -
														10
												) {
													target =
														ri >
														0
															? rows[
																	ri -
																		1
																]
															: rows[
																	rows.length -
																		1
																];
													break;
												}
												target =
													rows[
														ri
													];
											}
											target.scrollIntoView(
												{
													block: "center",
													behavior: "smooth",
												},
											);
											target.classList.add(
												"!brightness-125",
											);
											setTimeout(
												() =>
													target.classList.remove(
														"!brightness-125",
													),
												1000,
											);
										}
									}}
									className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
									title="Previous PR change"
								>
									<ChevronUp className="w-3 h-3" />
								</button>
								<button
									disabled={
										isEditing &&
										editView !== "edit"
									}
									onClick={() => {
										if (
											isEditing &&
											editView ===
												"edit" &&
											editTextareaRef.current
										) {
											const cursorPos =
												editTextareaRef
													.current
													.selectionStart;
											const currentLine =
												editContent
													.slice(
														0,
														cursorPos,
													)
													.split(
														"\n",
													).length;
											const next =
												prChangedLinesSorted.find(
													(
														l,
													) =>
														l >
														currentLine,
												);
											const target =
												next ??
												prChangedLinesSorted[0];
											if (
												target !==
												undefined
											) {
												const container =
													editTextareaRef.current.closest(
														".overflow-auto",
													);
												const gutterLine =
													container?.querySelector(
														`[data-edit-line="${target}"]`,
													);
												gutterLine?.scrollIntoView(
													{
														block: "center",
														behavior: "smooth",
													},
												);
												const edLines =
													editContent.split(
														"\n",
													);
												const pos =
													edLines
														.slice(
															0,
															target -
																1,
														)
														.reduce(
															(
																s,
																l,
															) =>
																s +
																l.length +
																1,
															0,
														);
												editTextareaRef.current.focus();
												editTextareaRef.current.setSelectionRange(
													pos,
													pos,
												);
											}
										} else if (
											diffContainerRef.current
										) {
											const rows =
												Array.from(
													diffContainerRef.current.querySelectorAll<HTMLElement>(
														"tr.diff-add-row",
													),
												);
											if (
												rows.length ===
												0
											)
												return;
											const containerRect =
												diffContainerRef.current.getBoundingClientRect();
											const centerY =
												containerRect.top +
												containerRect.height /
													2;
											// Find the first row below center
											let target =
												rows[0];
											for (const row of rows) {
												if (
													row.getBoundingClientRect()
														.top >
													centerY +
														10
												) {
													target =
														row;
													break;
												}
											}
											target.scrollIntoView(
												{
													block: "center",
													behavior: "smooth",
												},
											);
											target.classList.add(
												"!brightness-125",
											);
											setTimeout(
												() =>
													target.classList.remove(
														"!brightness-125",
													),
												1000,
											);
										}
									}}
									className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent/60 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
									title="Next PR change"
								>
									<ChevronDown className="w-3 h-3" />
								</button>
							</div>
						)}

					{/* Hide review comments toggle */}
					{fileComments.length > 0 && (
						<button
							onClick={() =>
								setHideReviewComments((h) => !h)
							}
							className={cn(
								"p-0.5 rounded transition-colors cursor-pointer shrink-0",
								hideReviewComments
									? "bg-accent text-foreground"
									: "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60",
							)}
							title={
								hideReviewComments
									? "Show review comments"
									: "Hide review comments"
							}
						>
							<MessageSquare className="w-3.5 h-3.5" />
						</button>
					)}

					{/* Split view toggle */}
					<button
						onClick={onToggleSplit}
						className={cn(
							"p-0.5 rounded transition-colors cursor-pointer shrink-0",
							splitView
								? "bg-accent text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60",
						)}
						title={splitView ? "Unified diff" : "Split diff"}
					>
						<Columns2 className="w-3.5 h-3.5" />
					</button>

					{/* Wrap toggle */}
					<button
						onClick={onToggleWrap}
						className={cn(
							"p-0.5 rounded transition-colors cursor-pointer shrink-0",
							wordWrap
								? "bg-accent text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/60",
						)}
						title={
							wordWrap
								? "Disable word wrap"
								: "Enable word wrap"
						}
					>
						<WrapText className="w-3.5 h-3.5" />
					</button>

					{/* Prev / Next nav */}
					<div className="flex items-center gap-0.5 shrink-0">
						<button
							onClick={onPrev}
							disabled={index === 0}
							className="p-0.5 rounded hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
						>
							<ChevronLeft className="w-3.5 h-3.5" />
						</button>
						<span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums min-w-[3ch] text-center">
							{index + 1}/{total}
						</span>
						<button
							onClick={onNext}
							disabled={index === total - 1}
							className="p-0.5 rounded hover:bg-accent disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
						>
							<ChevronRight className="w-3.5 h-3.5" />
						</button>
					</div>
				</div>

				{/* Inline search bar */}
				{searchOpen && (
					<div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border/50">
						<Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={(e) =>
								setSearchQuery(e.target.value)
							}
							onKeyDown={handleDiffSearchKeyDown}
							placeholder="Find in diff..."
							className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none min-w-0"
							autoFocus
						/>
						{searchQuery && (
							<span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0">
								{searchMatches.length > 0
									? `${currentSearchIdx + 1} of ${searchMatches.length}`
									: "No results"}
							</span>
						)}
						<div className="flex items-center gap-0.5 shrink-0">
							<button
								onClick={goToPrevSearch}
								disabled={
									searchMatches.length === 0
								}
								className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
								title="Previous match (Shift+Enter)"
							>
								<ChevronUp className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={goToNextSearch}
								disabled={
									searchMatches.length === 0
								}
								className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
								title="Next match (Enter)"
							>
								<ChevronDown className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={() =>
									setMatchCase(!matchCase)
								}
								className={cn(
									"px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer",
									matchCase
										? "text-foreground bg-accent"
										: "text-muted-foreground hover:text-foreground",
								)}
								title="Match case"
							>
								Aa
							</button>
							<button
								onClick={closeDiffSearch}
								className="p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
								title="Close (Escape)"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				)}
			</div>

			{/* Scrollable diff content */}
			<div
				ref={diffContainerRef}
				className={cn(
					"flex-1 overflow-y-auto overscroll-contain",
					wordWrap ? "overflow-x-hidden" : "overflow-x-auto",
				)}
			>
				{isEditing ? (
					<>
						{/* Editor — always mounted to preserve undo history */}
						<div
							className={cn(
								"flex flex-1 min-h-0 overflow-auto",
								editView !== "edit" && "hidden",
							)}
						>
							{/* Line numbers gutter with PR change markers */}
							<div className="shrink-0 select-none text-right border-r border-border/50 pt-4 pb-4 sticky left-0 bg-code-bg z-[1]">
								{editContent
									.split("\n")
									.map((_, i) => {
										const lineNum =
											i + 1;
										const isPrChanged =
											prChangedLines.has(
												lineNum,
											);
										return (
											<div
												key={
													i
												}
												data-edit-line={
													lineNum
												}
												className={cn(
													"text-[12.5px] leading-[20px] font-mono h-[20px] pr-2 pl-2 flex items-center justify-end gap-1",
													isPrChanged
														? "text-muted-foreground/60"
														: "text-muted-foreground",
													isPrChanged &&
														"bg-diff-add-bg",
												)}
											>
												{isPrChanged && (
													<span className="w-[3px] h-3 rounded-full bg-success/60 shrink-0" />
												)}
												{
													lineNum
												}
											</div>
										);
									})}
							</div>
							{/* Code area: relative container with pre + absolute textarea overlay */}
							<div className="flex-1 relative min-h-[400px]">
								<pre
									ref={editPreRef}
									className={cn(
										"pointer-events-none font-mono text-[12.5px] leading-[20px] p-4 overflow-hidden m-0 diff-syntax",
										wordWrap
											? "whitespace-pre-wrap break-words"
											: "whitespace-pre",
									)}
									aria-hidden="true"
									style={{ tabSize: 2 }}
								>
									{editTokens
										? editContent
												.split(
													"\n",
												)
												.map(
													(
														lineText,
														lineIdx,
													) => {
														const tokens =
															editTokens[
																lineIdx
															];
														return (
															<React.Fragment
																key={
																	lineIdx
																}
															>
																{tokens
																	? tokens.map(
																			(
																				t,
																				ti,
																			) => (
																				<span
																					key={
																						ti
																					}
																					style={{
																						color: `light-dark(${t.lightColor}, ${t.darkColor})`,
																					}}
																				>
																					{
																						t.text
																					}
																				</span>
																			),
																		)
																	: lineText}
																{
																	"\n"
																}
															</React.Fragment>
														);
													},
												)
										: editContent}
								</pre>
								<textarea
									ref={editTextareaRef}
									defaultValue={editContent}
									onInput={handleEditInput}
									onKeyDown={
										handleEditKeyDown
									}
									onScroll={handleEditScroll}
									className={cn(
										"absolute inset-0 w-full h-full bg-transparent font-mono text-[12.5px] leading-[20px] p-4 outline-none resize-none border-none m-0",
										wordWrap
											? "whitespace-pre-wrap break-words"
											: "whitespace-pre",
									)}
									style={{
										tabSize: 2,
										color: "transparent",
										caretColor: "var(--foreground)",
										WebkitTextFillColor:
											"transparent",
									}}
									spellCheck={false}
									autoFocus
								/>
							</div>
						</div>
						{/* Changes view — merged diff (base → edited content), same style as full file view */}
						{editView === "changes" && (
							<div className="flex-1 overflow-auto">
								{(() => {
									const diffBase =
										baseEditContent ??
										originalEditContent;
									const noChanges =
										editContent ===
										diffBase;
									if (noChanges) {
										return (
											<div className="px-4 py-16 text-center">
												<p className="text-[11px] text-muted-foreground/50 font-mono">
													No
													changes
												</p>
											</div>
										);
									}
									const diffEntries =
										computeLineDiff(
											diffBase,
											editContent,
										);
									return (
										<table
											className={cn(
												"w-full border-collapse",
												wordWrap &&
													"table-fixed",
											)}
										>
											{wordWrap && (
												<colgroup>
													<col className="w-[3px]" />
													<col className="w-10" />
													<col />
												</colgroup>
											)}
											<tbody>
												{diffEntries.map(
													(
														entry,
														i,
													) => {
														const isGapSeparator =
															entry.type ===
																"context" &&
															entry.content ===
																"···";
														if (
															isGapSeparator
														) {
															return (
																<tr
																	key={
																		i
																	}
																>
																	<td
																		colSpan={
																			3
																		}
																		className="py-1.5 text-center text-[11px] font-mono text-muted-foreground/30 bg-secondary/20 border-y border-border/30"
																	>
																		<UnfoldVertical className="w-3 h-3 inline-block mr-1 opacity-50" />
																	</td>
																</tr>
															);
														}
														const isAdd =
															entry.type ===
															"add";
														const isDel =
															entry.type ===
															"remove";
														return (
															<tr
																key={
																	i
																}
																className={cn(
																	isAdd &&
																		"diff-add-row",
																	isDel &&
																		"diff-del-row",
																)}
															>
																{/* Gutter bar */}
																<td
																	className={cn(
																		"w-[3px] p-0 sticky left-0 z-[1]",
																		isAdd
																			? "bg-success"
																			: isDel
																				? "bg-destructive"
																				: "",
																	)}
																/>
																{/* Line number */}
																<td
																	className={cn(
																		"w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-border/40 sticky left-[3px] z-[1]",
																		isAdd
																			? "bg-diff-add-gutter text-diff-add-gutter"
																			: isDel
																				? "bg-diff-del-gutter text-diff-del-gutter"
																				: "text-muted-foreground/30",
																	)}
																>
																	{isAdd
																		? entry.newLineNumber
																		: isDel
																			? entry.oldLineNumber
																			: entry.newLineNumber}
																</td>
																{/* Content */}
																<td
																	className={cn(
																		"py-0 font-mono text-[12.5px] leading-[20px]",
																		wordWrap
																			? "whitespace-pre-wrap break-words"
																			: "whitespace-pre",
																		isAdd &&
																			"bg-diff-add-bg",
																		isDel &&
																			"bg-diff-del-bg",
																	)}
																>
																	<div className="flex">
																		<span
																			className={cn(
																				"inline-block w-5 text-center shrink-0 select-none",
																				isAdd
																					? "text-success/50"
																					: isDel
																						? "text-destructive/50"
																						: "text-transparent",
																			)}
																		>
																			{isAdd
																				? "+"
																				: isDel
																					? "-"
																					: " "}
																		</span>
																		<span className="pl-1">
																			<span
																				className={cn(
																					isAdd &&
																						"text-diff-add-text",
																					isDel &&
																						"text-diff-del-text",
																				)}
																			>
																				{
																					entry.content
																				}
																			</span>
																		</span>
																	</div>
																</td>
															</tr>
														);
													},
												)}
											</tbody>
										</table>
									);
								})()}
							</div>
						)}
					</>
				) : showFullFile && fileContent ? (
					<FullFileView
						fileContent={fileContent}
						lines={lines}
						hunkInfos={hunkInfos}
						wordWrap={wordWrap}
						fileHighlightData={fileHighlightData}
						fullFileTokens={fullFileTokens}
					/>
				) : lines.length > 0 ? (
					splitView ? (
						<SplitDiffTable
							lines={lines}
							splitRows={splitRows}
							wordWrap={wordWrap}
							canComment={canComment}
							commentsByLine={commentsByLine}
							commentRange={commentRange}
							selectionRange={selectionRange}
							fileHighlightData={fileHighlightData}
							expandedLines={expandedLines}
							hunkInfos={hunkInfos}
							isLoadingExpand={isLoadingExpand}
							onExpandHunk={handleExpandHunk}
							onLineClick={handleLineClick}
							onLineMouseDown={handleLineMouseDown}
							onLineHover={handleLineHover}
							onCloseComment={() => {
								setCommentRange(null);
								setSelectingFrom(null);
								setHoverLine(null);
							}}
							commentStartLine={commentRange?.startLine}
							selectedLinesContent={selectedLinesContent}
							selectedCodeForAI={selectedCodeForAI}
							owner={owner}
							repo={repo}
							pullNumber={pullNumber}
							headSha={headSha}
							headBranch={headBranch}
							filename={file.filename}
							canWrite={canWrite}
							onAddContext={onAddContext}
							participants={participants}
							hideComments={hideReviewComments}
						/>
					) : (
						<table
							className={cn(
								"w-full border-collapse",
								wordWrap && "table-fixed",
							)}
						>
							{wordWrap && (
								<colgroup>
									<col className="w-[3px]" />
									<col className="w-10" />
									<col />
								</colgroup>
							)}
							<tbody>
								{lines.map((line, i) => {
									const lineNum =
										line.type ===
											"add" ||
										line.type ===
											"context"
											? line.newLineNumber
											: line.type ===
												  "remove"
												? line.oldLineNumber
												: undefined;
									const side:
										| "LEFT"
										| "RIGHT" =
										line.type ===
										"remove"
											? "LEFT"
											: "RIGHT";

									// Find inline comments for this line
									const inlineComments: ReviewComment[] =
										[];
									if (
										lineNum !==
											undefined &&
										!hideReviewComments
									) {
										const rightComments =
											commentsByLine.get(
												`RIGHT-${lineNum}`,
											) || [];
										const leftComments =
											commentsByLine.get(
												`LEFT-${lineNum}`,
											) || [];
										if (
											line.type ===
											"remove"
										) {
											inlineComments.push(
												...leftComments,
											);
										} else {
											inlineComments.push(
												...rightComments,
											);
										}
									}

									// Show comment form at end of selected range
									const isCommentFormOpen =
										commentRange !==
											null &&
										lineNum !==
											undefined &&
										lineNum ===
											commentRange.endLine &&
										side ===
											commentRange.side;

									// Is this line in the selection highlight? (side-aware)
									const isSelected =
										selectionRange !==
											null &&
										lineNum !==
											undefined &&
										lineNum >=
											selectionRange.start &&
										lineNum <=
											selectionRange.end &&
										side ===
											selectionRange.side;

									// Compute syntax highlight key for this line
									let syntaxTokens:
										| SyntaxToken[]
										| undefined;
									if (
										fileHighlightData &&
										lineNum !==
											undefined
									) {
										if (
											line.type ===
											"remove"
										) {
											syntaxTokens =
												fileHighlightData[
													`R-${line.oldLineNumber}`
												];
										} else if (
											line.type ===
											"add"
										) {
											syntaxTokens =
												fileHighlightData[
													`A-${line.newLineNumber}`
												];
										} else if (
											line.type ===
											"context"
										) {
											syntaxTokens =
												fileHighlightData[
													`C-${line.newLineNumber}`
												];
										}
									}

									// Render expanded context lines before hunk headers
									const expandedContent =
										line.type ===
										"header"
											? expandedLines.get(
													i,
												)
											: undefined;

									return (
										<DiffLineRow
											key={i}
											diffIdx={i}
											line={line}
											wordWrap={
												wordWrap
											}
											canComment={
												canComment
											}
											inlineComments={
												inlineComments
											}
											isCommentFormOpen={
												isCommentFormOpen
											}
											isSelected={
												isSelected
											}
											syntaxTokens={
												syntaxTokens
											}
											expandedContent={
												expandedContent
											}
											expandStartLine={
												expandedContent
													? hunkInfos.find(
															(
																h,
															) =>
																h.index ===
																i,
														)
														? (() => {
																const currentHunk =
																	hunkInfos.find(
																		(
																			h,
																		) =>
																			h.index ===
																			i,
																	)!;
																const prevHunk =
																	hunkInfos
																		.filter(
																			(
																				h,
																			) =>
																				h.index <
																				i,
																		)
																		.pop();
																return prevHunk
																	? prevHunk.endNewLine +
																			1
																	: 1;
															})()
														: 1
													: undefined
											}
											isExpandLoading={
												isLoadingExpand ===
												i
											}
											onExpandHunk={() =>
												handleExpandHunk(
													i,
												)
											}
											onOpenComment={(
												shiftKey,
											) => {
												if (
													lineNum !==
														undefined &&
													line.type !==
														"header"
												) {
													handleLineClick(
														lineNum,
														side,
														shiftKey,
													);
												}
											}}
											onStartSelect={() => {
												if (
													lineNum !==
														undefined &&
													line.type !==
														"header"
												) {
													handleLineMouseDown(
														lineNum,
														side,
													);
												}
											}}
											onHoverLine={() => {
												if (
													lineNum !==
													undefined
												) {
													handleLineHover(
														lineNum,
													);
												}
											}}
											onCloseComment={() => {
												setCommentRange(
													null,
												);
												setSelectingFrom(
													null,
												);
												setHoverLine(
													null,
												);
											}}
											commentStartLine={
												isCommentFormOpen
													? commentRange!
															.startLine
													: undefined
											}
											selectedLinesContent={
												isCommentFormOpen
													? selectedLinesContent
													: undefined
											}
											selectedCodeForAI={
												isCommentFormOpen
													? selectedCodeForAI
													: undefined
											}
											owner={
												owner
											}
											repo={repo}
											pullNumber={
												pullNumber
											}
											headSha={
												headSha
											}
											headBranch={
												headBranch
											}
											filename={
												file.filename
											}
											canWrite={
												canWrite
											}
											onAddContext={
												onAddContext
											}
											participants={
												participants
											}
										/>
									);
								})}
							</tbody>
						</table>
					)
				) : (
					<div className="px-4 py-16 text-center">
						<File className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
						<p className="text-[11px] text-muted-foreground/50 font-mono">
							{file.status === "renamed"
								? "File renamed without changes"
								: "Binary file or no diff available"}
						</p>
					</div>
				)}
			</div>

			{/* Commit dialog for inline edits */}
			{isEditing && headBranch && (
				<CommitDialog
					open={commitDialogOpen}
					onOpenChange={setCommitDialogOpen}
					filename={file.filename}
					branch={headBranch}
					originalContent={originalEditContent}
					newContent={editContent}
					onCommit={handleCommitEdit}
				/>
			)}
		</div>
	);
}

function DiffLineRow({
	line,
	diffIdx,
	wordWrap,
	canComment,
	inlineComments,
	isCommentFormOpen,
	isSelected,
	syntaxTokens,
	expandedContent,
	expandStartLine,
	isExpandLoading,
	onExpandHunk,
	onOpenComment,
	onStartSelect,
	onHoverLine,
	onCloseComment,
	commentStartLine,
	selectedLinesContent,
	selectedCodeForAI,
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
	filename,
	canWrite = true,
	onAddContext,
	participants,
}: {
	line: DiffLine;
	diffIdx: number;
	wordWrap: boolean;
	canComment: boolean;
	inlineComments: ReviewComment[];
	isCommentFormOpen: boolean;
	isSelected?: boolean;
	syntaxTokens?: SyntaxToken[];
	expandedContent?: string[];
	expandStartLine?: number;
	isExpandLoading?: boolean;
	onExpandHunk?: () => void;
	onOpenComment: (shiftKey: boolean) => void;
	onStartSelect?: () => void;
	onHoverLine?: () => void;
	onCloseComment: () => void;
	commentStartLine?: number;
	selectedLinesContent?: string;
	selectedCodeForAI?: string;
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headSha?: string;
	headBranch?: string;
	filename: string;
	canWrite?: boolean;
	onAddContext?: AddContextCallback;
	participants?: Array<{ login: string; avatar_url: string }>;
}) {
	if (line.type === "header") {
		const funcMatch = line.content.match(/@@ .+? @@\s*(.*)/);
		const funcName = funcMatch?.[1];
		return (
			<>
				{/* Expanded context lines above this hunk */}
				{expandedContent &&
					expandedContent.length > 0 &&
					expandedContent.map((text, ei) => (
						<tr
							key={`exp-${ei}`}
							className="diff-expanded-context"
						>
							<td className="w-[3px] p-0 sticky left-0 z-[1]" />
							<td className="w-10 py-0 pr-2 text-right text-[11px] font-mono text-muted-foreground/25 select-none border-r border-border/40 sticky left-[3px] z-[1]">
								{(expandStartLine ?? 1) + ei}
							</td>
							<td
								className={cn(
									"py-0 font-mono text-[12.5px] leading-[20px]",
									wordWrap
										? "whitespace-pre-wrap break-words"
										: "whitespace-pre",
								)}
							>
								<div className="flex">
									<span className="inline-block w-5 text-center shrink-0 select-none text-transparent">
										{" "}
									</span>
									<span className="pl-1 text-muted-foreground/60">
										{text}
									</span>
								</div>
							</td>
						</tr>
					))}
				<tr className="diff-hunk-header">
					<td className="w-[3px] p-0 sticky left-0 z-[1]" />
					<td className="w-10 py-1.5 pr-2 text-right text-[11px] font-mono text-info/40 select-none bg-info/[0.04] dark:bg-info/[0.06] border-r border-border/60 sticky left-[3px] z-[1]">
						{onExpandHunk && !expandedContent ? (
							<button
								onClick={onExpandHunk}
								disabled={isExpandLoading}
								className="w-full flex items-center justify-center cursor-pointer hover:text-info/70 transition-colors disabled:opacity-40"
								title="Expand context"
							>
								{isExpandLoading ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<UnfoldVertical className="w-3.5 h-3.5" />
								)}
							</button>
						) : (
							"..."
						)}
					</td>
					<td className="py-1.5 px-3 text-[11px] font-mono bg-info/[0.04] dark:bg-info/[0.06]">
						<span className="text-info/60 dark:text-info/50">
							{line.content.match(/@@ .+? @@/)?.[0]}
						</span>
						{funcName && (
							<span className="text-muted-foreground/50 ml-2">
								{funcName}
							</span>
						)}
					</td>
				</tr>
			</>
		);
	}

	const isAdd = line.type === "add";
	const isDel = line.type === "remove";
	const lineNum = isAdd ? line.newLineNumber : line.oldLineNumber;
	const side: "LEFT" | "RIGHT" = isDel ? "LEFT" : "RIGHT";

	return (
		<>
			<tr
				data-line={lineNum}
				data-diff-idx={diffIdx}
				onMouseEnter={onHoverLine}
				className={cn(
					"group/line hover:brightness-95 dark:hover:brightness-110 transition-[filter] duration-75",
					isAdd && "diff-add-row",
					isDel && "diff-del-row",
					isSelected && "!bg-muted-foreground/[0.08]",
				)}
			>
				{/* Gutter bar */}
				<td
					className={cn(
						"w-[3px] p-0 sticky left-0 z-[1]",
						isSelected
							? "bg-muted-foreground"
							: isAdd
								? "bg-success"
								: isDel
									? "bg-destructive"
									: "",
					)}
				/>

				{/* Line number */}
				<td
					className={cn(
						"w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-border/40 sticky left-[3px] z-[1] relative",
						isSelected
							? "bg-muted-foreground/[0.06] text-muted-foreground"
							: isAdd
								? "bg-diff-add-gutter text-diff-add-gutter"
								: isDel
									? "bg-diff-del-gutter text-diff-del-gutter"
									: "text-muted-foreground/30",
					)}
				>
					{canComment && lineNum !== undefined && (
						<button
							onMouseDown={(e) => {
								e.preventDefault();
								onStartSelect?.();
							}}
							onClick={(e) => onOpenComment(e.shiftKey)}
							className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center opacity-0 group-hover/line:opacity-100 transition-opacity text-foreground/50 hover:text-foreground/70 cursor-pointer"
							title="Add review comment (shift+click for range)"
						>
							<Plus className="w-3 h-3" />
						</button>
					)}
					{(isAdd ? line.newLineNumber : line.oldLineNumber) ?? ""}
				</td>

				{/* Content */}
				<td
					className={cn(
						"py-0 font-mono text-[12.5px] leading-[20px]",
						wordWrap
							? "whitespace-pre-wrap break-words"
							: "whitespace-pre",
						isAdd && "bg-diff-add-bg",
						isDel && "bg-diff-del-bg",
					)}
				>
					<div className="flex">
						<span
							className={cn(
								"inline-block w-5 text-center shrink-0 select-none",
								isAdd
									? "text-success/50"
									: isDel
										? "text-destructive/50"
										: "text-transparent",
							)}
						>
							{isAdd ? "+" : isDel ? "-" : " "}
						</span>
						<span className="pl-1">
							{syntaxTokens ? (
								line.segments ? (
									<SyntaxSegmentedContent
										segments={
											line.segments
										}
										tokens={
											syntaxTokens
										}
										type={line.type}
									/>
								) : (
									<span className="diff-syntax">
										{syntaxTokens.map(
											(t, ti) => (
												<span
													key={
														ti
													}
													style={{
														color: `light-dark(${t.lightColor}, ${t.darkColor})`,
													}}
												>
													{
														t.text
													}
												</span>
											),
										)}
									</span>
								)
							) : line.segments ? (
								<SegmentedContent
									segments={line.segments}
									type={line.type}
								/>
							) : (
								<span
									className={cn(
										isAdd &&
											"text-diff-add-text",
										isDel &&
											"text-diff-del-text",
									)}
								>
									{line.content}
								</span>
							)}
						</span>
					</div>
				</td>
			</tr>

			{/* Existing inline review comments */}
			{inlineComments.map((comment) => (
				<tr key={`rc-${comment.id}`}>
					<td colSpan={3} className="p-0">
						<InlineCommentDisplay
							comment={comment}
							owner={owner}
							repo={repo}
							pullNumber={pullNumber}
							headBranch={headBranch}
							filename={filename}
							canWrite={canWrite}
						/>
					</td>
				</tr>
			))}

			{/* Inline comment form */}
			{isCommentFormOpen && lineNum !== undefined && (
				<tr>
					<td colSpan={3} className="p-0">
						<InlineCommentForm
							owner={owner!}
							repo={repo!}
							pullNumber={pullNumber!}
							headSha={headSha!}
							headBranch={headBranch}
							filename={filename}
							line={lineNum}
							side={side}
							startLine={commentStartLine}
							selectedLinesContent={selectedLinesContent}
							selectedCodeForAI={selectedCodeForAI}
							onClose={onCloseComment}
							onAddContext={onAddContext}
							participants={participants}
						/>
					</td>
				</tr>
			)}
		</>
	);
}

function InlineCommentForm({
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
	filename,
	line,
	side,
	startLine,
	selectedLinesContent,
	selectedCodeForAI,
	onClose,
	onAddContext,
	participants,
}: {
	owner: string;
	repo: string;
	pullNumber: number;
	headSha: string;
	headBranch?: string;
	filename: string;
	line: number;
	side: "LEFT" | "RIGHT";
	startLine?: number;
	selectedLinesContent?: string;
	selectedCodeForAI?: string;
	onClose: () => void;
	onAddContext?: AddContextCallback;
	participants?: Array<{ login: string; avatar_url: string }>;
}) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [body, setBody] = useState("");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const editorRef = useRef<MarkdownEditorRef>(null);

	const isMultiLine = startLine !== undefined && startLine !== line;

	const handleInsertSuggestion = () => {
		const suggestion = `\`\`\`suggestion\n${selectedLinesContent || ""}\n\`\`\``;
		if (!body) {
			setBody(suggestion);
		} else {
			setBody(body + "\n" + suggestion);
		}
		setTimeout(() => editorRef.current?.focus(), 0);
	};

	const handleSubmit = () => {
		if (!body.trim()) return;
		setError(null);
		startTransition(async () => {
			const res = await addPRReviewComment(
				owner,
				repo,
				pullNumber,
				body.trim(),
				headSha,
				filename,
				line,
				side,
				startLine,
				side,
			);
			if (res.error) {
				setError(res.error);
			} else {
				onClose();
				emit({ type: "pr:commented", owner, repo, number: pullNumber });
				router.refresh();
			}
		});
	};

	return (
		<div className="mx-3 my-1.5 max-w-xl rounded-lg border border-border bg-background overflow-hidden shadow-sm">
			{isMultiLine && (
				<div className="px-3 py-1 bg-muted/20 border-b border-border/40">
					<span className="text-[10px] font-mono text-muted-foreground/60">
						Lines {startLine}–{line}
					</span>
				</div>
			)}

			<div className="px-2 pt-2 pb-1">
				<MarkdownEditor
					ref={editorRef}
					value={body}
					onChange={setBody}
					placeholder="Leave a comment..."
					rows={5}
					autoFocus
					compact
					participants={participants}
					owner={owner}
					className="border-0 rounded-none focus-within:border-0 focus-within:ring-0"
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							handleSubmit();
						}
						if (e.key === "Escape") {
							onClose();
						}
					}}
				/>
			</div>

			{error && <p className="text-[10px] text-destructive px-3 pb-1">{error}</p>}

			{/* Bottom bar */}
			<div className="flex items-center gap-1 px-2 py-1.5 border-t border-border/60">
				{/* Suggest button */}
				{side === "RIGHT" && (
					<button
						onClick={handleInsertSuggestion}
						className={cn(
							"flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors cursor-pointer",
							"text-muted-foreground/50 hover:text-foreground hover:bg-accent/60",
						)}
						title="Suggest a code change"
					>
						Suggest
					</button>
				)}

				{/* Ask Ghost button */}
				{onAddContext && (
					<button
						onClick={() => {
							onAddContext({
								filename,
								startLine: startLine ?? line,
								endLine: line,
								selectedCode:
									selectedCodeForAI ||
									selectedLinesContent ||
									"",
								side,
							});
						}}
						className={cn(
							"flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-colors cursor-pointer",
							"text-muted-foreground/50 hover:text-foreground hover:bg-accent/60",
						)}
						title="Add code context to Ghost"
					>
						<Ghost className="w-3.5 h-3.5" />
						Add to Ghost
					</button>
				)}

				<div className="flex-1" />

				{/* Cancel */}
				<button
					onClick={onClose}
					disabled={isPending}
					className="px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-foreground rounded-md transition-colors cursor-pointer disabled:opacity-40"
				>
					Cancel
				</button>

				{/* Submit */}
				<button
					onClick={handleSubmit}
					disabled={isPending || !body.trim()}
					className={cn(
						"flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-md text-[10px] font-medium transition-all cursor-pointer",
						body.trim()
							? "bg-foreground text-background hover:bg-foreground/90"
							: "bg-muted text-muted-foreground",
						"disabled:opacity-40 disabled:cursor-not-allowed",
					)}
				>
					{isPending ? (
						<Loader2 className="w-3 h-3 animate-spin" />
					) : (
						<>
							Comment
							<CornerDownLeft className="w-3 h-3 opacity-50" />
						</>
					)}
				</button>
			</div>
		</div>
	);
}

/** Parse suggestion blocks from comment body */
function parseSuggestionBlock(body: string) {
	const match = body.match(/```suggestion\n([\s\S]*?)```/);
	if (!match) return null;
	const suggestion = match[1].replace(/\n$/, "");
	const before = body.slice(0, match.index!).trim();
	const after = body.slice(match.index! + match[0].length).trim();
	return { before, suggestion, after };
}

/** Renders an inline review comment with suggestion support */
function InlineCommentDisplay({
	comment,
	owner,
	repo,
	pullNumber,
	headBranch,
	filename,
	canWrite = true,
}: {
	comment: ReviewComment;
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headBranch?: string;
	filename: string;
	canWrite?: boolean;
}) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [isPending, startTransition] = useTransition();
	const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(
		null,
	);
	const [commitMessage, setCommitMessage] = useState(`Apply suggestion to ${filename}`);

	// Persist committed state across refreshes via sessionStorage
	const storageKey = `committed_suggestion_${comment.id}`;
	const [alreadyCommitted, setAlreadyCommitted] = useState(false);
	useEffect(() => {
		try {
			if (sessionStorage.getItem(storageKey) === "1") setAlreadyCommitted(true);
		} catch {}
	}, [storageKey]);

	const parsed = parseSuggestionBlock(comment.body);
	const canCommit = !!(
		owner &&
		repo &&
		pullNumber &&
		headBranch &&
		comment.line &&
		!alreadyCommitted
	);

	const handleCommitSuggestion = (suggestion: string, message: string) => {
		if (!canCommit) return;
		const startLine = comment.start_line ?? comment.line!;
		const endLine = comment.line!;
		setResult(null);
		startTransition(async () => {
			const res = await commitSuggestion(
				owner!,
				repo!,
				pullNumber!,
				filename,
				headBranch!,
				startLine,
				endLine,
				suggestion,
				message,
			);
			if (res.error) {
				setResult({ type: "error", msg: res.error });
			} else {
				setResult({ type: "success", msg: "Committed" });
				setAlreadyCommitted(true);
				try {
					sessionStorage.setItem(storageKey, "1");
				} catch {}
				// Give GitHub time to process the new commit before refreshing
				await new Promise((r) => setTimeout(r, 1500));
				emit({
					type: "pr:suggestion-committed",
					owner: owner!,
					repo: repo!,
					number: pullNumber!,
				});
				router.refresh();
			}
		});
	};

	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="mx-3 my-1.5 border border-border rounded-lg bg-muted/40">
			<div
				className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none hover:bg-muted/50 transition-colors rounded-t-lg"
				onClick={() => setCollapsed((c) => !c)}
			>
				<ChevronDown
					className={cn(
						"w-3 h-3 shrink-0 text-muted-foreground transition-transform",
						collapsed && "-rotate-90",
					)}
				/>
				{comment.user ? (
					<Link
						href={`/users/${comment.user.login}`}
						className="text-xs font-medium text-foreground/70 hover:text-foreground hover:underline transition-colors"
						onClick={(e) => e.stopPropagation()}
					>
						{comment.user.login}
					</Link>
				) : (
					<span className="text-xs font-medium text-foreground/70">
						ghost
					</span>
				)}
				<span className="text-[10px] text-muted-foreground/50">
					<TimeAgo date={comment.created_at} />
				</span>
				{collapsed && (
					<span className="text-[10px] text-muted-foreground/50 truncate flex-1 min-w-0">
						{comment.body.slice(0, 60)}
						{comment.body.length > 60 ? "..." : ""}
					</span>
				)}
			</div>

			{!collapsed && (
				<>
					{parsed ? (
						<div>
							{parsed.before && (
								<div className="px-3 py-2 text-sm text-foreground/70">
									<ClientMarkdown
										content={
											parsed.before
										}
									/>
								</div>
							)}

							<div className="border-y border-border/40">
								<div className="flex items-center gap-1.5 px-3 py-1 bg-muted/40">
									<Code2 className="w-3 h-3 text-muted-foreground/50" />
									<span className="text-[10px] font-mono text-muted-foreground/60">
										Suggested change
									</span>
								</div>
								<pre className="px-3 py-2 text-[12.5px] font-mono leading-[20px] bg-success/[0.04] text-diff-add-text overflow-x-auto">
									{parsed.suggestion}
								</pre>
								{alreadyCommitted ||
								result?.type === "success" ? (
									<div className="flex items-center gap-1.5 px-3 py-1.5 bg-success/[0.06]">
										<CheckCircle2 className="w-3 h-3 text-success" />
										<span className="text-[10px] font-mono text-success">
											Suggestion
											committed
										</span>
										{isPending && (
											<Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50 ml-auto" />
										)}
									</div>
								) : canCommit && canWrite ? (
									<div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40">
										{result?.type ===
											"error" && (
											<span className="text-[10px] font-mono text-destructive">
												{
													result.msg
												}
											</span>
										)}
										<input
											type="text"
											value={
												commitMessage
											}
											onChange={(
												e,
											) =>
												setCommitMessage(
													e
														.target
														.value,
												)
											}
											disabled={
												isPending
											}
											className={cn(
												"flex-1 min-w-0 px-2 py-1 text-[10px] font-mono",
												"bg-transparent border border-border rounded-md",
												"text-foreground/70 placeholder:text-muted-foreground",
												"focus:outline-none focus:ring-1 focus:ring-foreground/20",
												"disabled:opacity-40 disabled:cursor-not-allowed",
											)}
										/>
										<button
											onClick={() =>
												handleCommitSuggestion(
													parsed.suggestion,
													commitMessage,
												)
											}
											disabled={
												isPending
											}
											className={cn(
												"flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider",
												"border border-border",
												"text-foreground/70 hover:text-foreground hover:bg-muted/60",
												"transition-colors cursor-pointer rounded-md",
												"disabled:opacity-40 disabled:cursor-not-allowed",
											)}
										>
											{isPending ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<Check className="w-3 h-3" />
											)}
											Commit
											suggestion
										</button>
									</div>
								) : null}
							</div>

							{parsed.after && (
								<div className="px-3 py-2 text-sm text-foreground/70">
									<ClientMarkdown
										content={
											parsed.after
										}
									/>
								</div>
							)}
						</div>
					) : (
						<div className="px-3 py-2 text-sm text-foreground/70">
							<ClientMarkdown content={comment.body} />
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ── Split Diff View ──

interface SplitRow {
	type: "pair" | "header";
	left: DiffLine | null;
	right: DiffLine | null;
	headerContent?: string;
	hunkIndex?: number;
}

function buildSplitRows(lines: DiffLine[]): SplitRow[] {
	const rows: SplitRow[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.type === "header") {
			rows.push({
				type: "header",
				left: null,
				right: null,
				headerContent: line.content,
				hunkIndex: i,
			});
			i++;
			continue;
		}

		if (line.type === "context") {
			rows.push({ type: "pair", left: line, right: line });
			i++;
			continue;
		}

		// Collect consecutive remove/add blocks
		const removes: DiffLine[] = [];
		const adds: DiffLine[] = [];

		while (i < lines.length && lines[i].type === "remove") {
			removes.push(lines[i]);
			i++;
		}
		while (i < lines.length && lines[i].type === "add") {
			adds.push(lines[i]);
			i++;
		}

		// Pair them up
		const maxLen = Math.max(removes.length, adds.length);
		for (let j = 0; j < maxLen; j++) {
			rows.push({
				type: "pair",
				left: j < removes.length ? removes[j] : null,
				right: j < adds.length ? adds[j] : null,
			});
		}
	}

	return rows;
}

function SplitDiffTable({
	lines,
	splitRows,
	wordWrap,
	canComment,
	commentsByLine,
	commentRange,
	selectionRange,
	fileHighlightData,
	expandedLines,
	hunkInfos,
	isLoadingExpand,
	onExpandHunk,
	onLineClick,
	onLineMouseDown,
	onLineHover,
	onCloseComment,
	commentStartLine,
	selectedLinesContent,
	selectedCodeForAI,
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
	filename,
	canWrite,
	onAddContext,
	participants,
	hideComments = false,
}: {
	lines: DiffLine[];
	splitRows: SplitRow[];
	wordWrap: boolean;
	canComment: boolean;
	commentsByLine: Map<string, ReviewComment[]>;
	commentRange: { startLine: number; endLine: number; side: "LEFT" | "RIGHT" } | null;
	selectionRange: { start: number; end: number; side: "LEFT" | "RIGHT" } | null;
	fileHighlightData?: Record<string, SyntaxToken[]>;
	expandedLines: Map<number, string[]>;
	hunkInfos: { index: number; newStart: number; newCount: number; endNewLine: number }[];
	isLoadingExpand: number | null;
	onExpandHunk: (hunkIdx: number) => void;
	onLineClick: (lineNum: number, side: "LEFT" | "RIGHT", shiftKey: boolean) => void;
	onLineMouseDown: (lineNum: number, side: "LEFT" | "RIGHT") => void;
	onLineHover: (lineNum: number) => void;
	onCloseComment: () => void;
	commentStartLine?: number;
	selectedLinesContent?: string;
	selectedCodeForAI?: string;
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headSha?: string;
	headBranch?: string;
	filename: string;
	canWrite: boolean;
	onAddContext?: AddContextCallback;
	participants?: Array<{ login: string; avatar_url: string }>;
	hideComments?: boolean;
}) {
	const [splitRatio, setSplitRatio] = useState(50);
	const [isDraggingSplit, setIsDraggingSplit] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);

	const handleSplitResize = useCallback((clientX: number) => {
		if (!splitContainerRef.current) return;
		const rect = splitContainerRef.current.getBoundingClientRect();
		const ratio = ((clientX - rect.left) / rect.width) * 100;
		setSplitRatio(Math.max(20, Math.min(80, ratio)));
	}, []);

	const getSyntaxTokens = (line: DiffLine | null) => {
		if (!line || !fileHighlightData) return undefined;
		if (line.type === "remove") return fileHighlightData[`R-${line.oldLineNumber}`];
		if (line.type === "add") return fileHighlightData[`A-${line.newLineNumber}`];
		if (line.type === "context") return fileHighlightData[`C-${line.newLineNumber}`];
		return undefined;
	};

	const getLineNum = (line: DiffLine | null): number | undefined => {
		if (!line) return undefined;
		if (line.type === "remove") return line.oldLineNumber;
		return line.newLineNumber;
	};

	// Fixed gutter width = 3px bar + 40px line number = 43px per side
	const gutterWidth = 43;
	const leftContentWidth = `calc(${splitRatio}% - ${gutterWidth}px)`;
	const rightContentWidth = `calc(${100 - splitRatio}% - ${gutterWidth}px)`;

	const isLineSelected = (line: DiffLine | null, side: "LEFT" | "RIGHT") => {
		if (!selectionRange || !line) return false;
		const ln = side === "LEFT" ? line.oldLineNumber : line.newLineNumber;
		return (
			ln !== undefined &&
			ln >= selectionRange.start &&
			ln <= selectionRange.end &&
			side === selectionRange.side
		);
	};

	const getInlineComments = (
		line: DiffLine | null,
		side: "LEFT" | "RIGHT",
	): ReviewComment[] => {
		if (hideComments || !line) return [];
		const lineNum = side === "LEFT" ? line.oldLineNumber : line.newLineNumber;
		if (lineNum === undefined) return [];
		if (side === "LEFT") return commentsByLine.get(`LEFT-${lineNum}`) || [];
		return commentsByLine.get(`RIGHT-${lineNum}`) || [];
	};

	const isCommentFormLine = (line: DiffLine | null, side: "LEFT" | "RIGHT") => {
		if (!commentRange || !line) return false;
		const lineNum = side === "LEFT" ? line.oldLineNumber : line.newLineNumber;
		return (
			lineNum !== undefined &&
			lineNum === commentRange.endLine &&
			side === commentRange.side
		);
	};

	const renderCellContent = (line: DiffLine | null, tokens: SyntaxToken[] | undefined) => {
		if (!line) return null;
		const isAdd = line.type === "add";
		const isDel = line.type === "remove";

		return (
			<div className="flex">
				<span
					className={cn(
						"inline-block w-5 text-center shrink-0 select-none",
						isAdd
							? "text-success/50"
							: isDel
								? "text-destructive/50"
								: "text-transparent",
					)}
				>
					{isAdd ? "+" : isDel ? "-" : " "}
				</span>
				<span className="pl-1">
					{tokens ? (
						line.segments ? (
							<SyntaxSegmentedContent
								segments={line.segments}
								tokens={tokens}
								type={line.type}
							/>
						) : (
							<span className="diff-syntax">
								{tokens.map((t, ti) => (
									<span
										key={ti}
										style={{
											color: `light-dark(${t.lightColor}, ${t.darkColor})`,
										}}
									>
										{t.text}
									</span>
								))}
							</span>
						)
					) : line.segments ? (
						<SegmentedContent
							segments={line.segments}
							type={line.type}
						/>
					) : (
						<span
							className={cn(
								isAdd && "text-diff-add-text",
								isDel && "text-diff-del-text",
							)}
						>
							{line.content}
						</span>
					)}
				</span>
			</div>
		);
	};

	const renderHalf = (
		line: DiffLine | null,
		side: "LEFT" | "RIGHT",
		tokens: SyntaxToken[] | undefined,
		isSelected: boolean,
		isFirst: boolean,
	) => {
		const lineNum = line ? getLineNum(line) : undefined;
		const isAdd = line?.type === "add";
		const isDel = line?.type === "remove";
		const isEmpty = !line;

		return (
			<>
				{/* Gutter bar */}
				<td
					className={cn(
						"w-[3px] p-0",
						isFirst && "sticky left-0 z-[1]",
						isEmpty
							? ""
							: isSelected
								? "bg-muted-foreground"
								: isAdd
									? "bg-success"
									: isDel
										? "bg-destructive"
										: "",
					)}
				/>
				{/* Line number */}
				<td
					className={cn(
						"w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-border/40 relative",
						isEmpty
							? "diff-split-empty"
							: isSelected
								? "bg-muted-foreground/[0.06] text-muted-foreground"
								: isAdd
									? "bg-diff-add-gutter text-diff-add-gutter"
									: isDel
										? "bg-diff-del-gutter text-diff-del-gutter"
										: "text-muted-foreground/30",
					)}
				>
					{canComment &&
						line &&
						lineNum !== undefined &&
						line.type !== "header" && (
							<button
								onMouseDown={(e) => {
									e.preventDefault();
									onLineMouseDown(
										lineNum,
										side,
									);
								}}
								onClick={(e) =>
									onLineClick(
										lineNum,
										side,
										e.shiftKey,
									)
								}
								className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center opacity-0 group-hover/splitline:opacity-100 transition-opacity text-foreground/50 hover:text-foreground/70 cursor-pointer"
								title="Add review comment"
							>
								<Plus className="w-3 h-3" />
							</button>
						)}
					{lineNum ?? ""}
				</td>
				{/* Content */}
				<td
					className={cn(
						"py-0 font-mono text-[12.5px] leading-[20px]",
						wordWrap
							? "whitespace-pre-wrap break-words"
							: "whitespace-pre",
						isEmpty
							? "diff-split-empty"
							: isAdd
								? "bg-diff-add-bg"
								: isDel
									? "bg-diff-del-bg"
									: "",
						isSelected &&
							!isEmpty &&
							"!bg-muted-foreground/[0.08]",
						!isFirst &&
							"border-l border-border/30 diff-split-divider",
					)}
				>
					{renderCellContent(line, tokens)}
				</td>
			</>
		);
	};

	return (
		<div ref={splitContainerRef} className="relative">
			<table className={cn("w-full border-collapse", wordWrap && "table-fixed")}>
				<colgroup>
					<col className="w-[3px]" />
					<col className="w-10" />
					<col style={{ width: leftContentWidth }} />
					<col className="w-[3px]" />
					<col className="w-10" />
					<col style={{ width: rightContentWidth }} />
				</colgroup>
				<tbody>
					{splitRows.map((row, i) => {
						if (row.type === "header") {
							const funcMatch =
								row.headerContent?.match(
									/@@ .+? @@\s*(.*)/,
								);
							const funcName = funcMatch?.[1];
							const expandedContent =
								row.hunkIndex !== undefined
									? expandedLines.get(
											row.hunkIndex,
										)
									: undefined;
							const hunkIdx = row.hunkIndex;

							// Compute expandStartLine for expanded context
							let expandStartLine = 1;
							if (
								expandedContent &&
								hunkIdx !== undefined
							) {
								const currentHunk = hunkInfos.find(
									(h) => h.index === hunkIdx,
								);
								if (currentHunk) {
									const prevHunk = hunkInfos
										.filter(
											(h) =>
												h.index <
												hunkIdx,
										)
										.pop();
									expandStartLine = prevHunk
										? prevHunk.endNewLine +
											1
										: 1;
								}
							}

							return (
								<React.Fragment key={`h-${i}`}>
									{expandedContent &&
										expandedContent.length >
											0 &&
										expandedContent.map(
											(
												text,
												ei,
											) => (
												<tr
													key={`exp-${i}-${ei}`}
													className="diff-expanded-context"
												>
													<td
														colSpan={
															6
														}
														className={cn(
															"py-0 font-mono text-[12.5px] leading-[20px]",
															wordWrap
																? "whitespace-pre-wrap break-words"
																: "whitespace-pre",
														)}
													>
														<div className="flex">
															<span className="inline-block w-10 text-right pr-2 shrink-0 text-[11px] text-muted-foreground/25 select-none">
																{expandStartLine +
																	ei}
															</span>
															<span className="pl-1 text-muted-foreground/60">
																{
																	text
																}
															</span>
														</div>
													</td>
												</tr>
											),
										)}
									<tr className="diff-hunk-header">
										<td
											colSpan={6}
											className="py-1.5 px-3 text-[11px] font-mono bg-info/[0.04] dark:bg-info/[0.06]"
										>
											<div className="flex items-center gap-2">
												{hunkIdx !==
													undefined &&
													!expandedContent && (
														<button
															onClick={() =>
																onExpandHunk(
																	hunkIdx,
																)
															}
															disabled={
																isLoadingExpand ===
																hunkIdx
															}
															className="flex items-center justify-center cursor-pointer text-info/40 hover:text-info/70 transition-colors disabled:opacity-40"
															title="Expand context"
														>
															{isLoadingExpand ===
															hunkIdx ? (
																<Loader2 className="w-3.5 h-3.5 animate-spin" />
															) : (
																<UnfoldVertical className="w-3.5 h-3.5" />
															)}
														</button>
													)}
												<span className="text-info/60 dark:text-info/50">
													{
														row.headerContent?.match(
															/@@ .+? @@/,
														)?.[0]
													}
												</span>
												{funcName && (
													<span className="text-muted-foreground/50">
														{
															funcName
														}
													</span>
												)}
											</div>
										</td>
									</tr>
								</React.Fragment>
							);
						}

						// Pair row
						const leftTokens = getSyntaxTokens(row.left);
						const rightTokens = getSyntaxTokens(row.right);
						const leftSelected = isLineSelected(
							row.left,
							"LEFT",
						);
						const rightSelected = isLineSelected(
							row.right,
							"RIGHT",
						);
						const leftLineNum = row.left
							? getLineNum(row.left)
							: undefined;
						const rightLineNum = row.right
							? getLineNum(row.right)
							: undefined;

						// For context lines shown on both sides, LEFT side uses the context line's line number for display
						const leftSide: "LEFT" | "RIGHT" =
							row.left?.type === "remove"
								? "LEFT"
								: row.left?.type === "context"
									? "LEFT"
									: "RIGHT";
						const rightSide: "LEFT" | "RIGHT" = "RIGHT";

						// Check for inline comments on each side
						const leftComments = row.left
							? getInlineComments(row.left, leftSide)
							: [];
						const rightComments = row.right
							? getInlineComments(row.right, rightSide)
							: [];

						const leftIsCommentForm = row.left
							? isCommentFormLine(row.left, leftSide)
							: false;
						const rightIsCommentForm = row.right
							? isCommentFormLine(row.right, rightSide)
							: false;

						return (
							<React.Fragment key={`p-${i}`}>
								<tr
									data-line={
										rightLineNum ??
										leftLineNum
									}
									className={cn(
										"group/splitline hover:brightness-95 dark:hover:brightness-110 transition-[filter] duration-75",
									)}
									onMouseEnter={() => {
										if (
											leftLineNum !==
											undefined
										)
											onLineHover(
												leftLineNum,
											);
										if (
											rightLineNum !==
											undefined
										)
											onLineHover(
												rightLineNum,
											);
									}}
								>
									{renderHalf(
										row.left,
										leftSide,
										leftTokens,
										leftSelected,
										true,
									)}
									{renderHalf(
										row.right,
										rightSide,
										rightTokens,
										rightSelected,
										false,
									)}
								</tr>

								{/* Inline review comments - left side */}
								{leftComments.map((comment) => (
									<tr
										key={`lrc-${comment.id}`}
									>
										<td
											colSpan={6}
											className="p-0"
										>
											<InlineCommentDisplay
												comment={
													comment
												}
												owner={
													owner
												}
												repo={
													repo
												}
												pullNumber={
													pullNumber
												}
												headBranch={
													headBranch
												}
												filename={
													filename
												}
												canWrite={
													canWrite
												}
											/>
										</td>
									</tr>
								))}

								{/* Inline review comments - right side */}
								{rightComments.map((comment) => (
									<tr
										key={`rrc-${comment.id}`}
									>
										<td
											colSpan={6}
											className="p-0"
										>
											<InlineCommentDisplay
												comment={
													comment
												}
												owner={
													owner
												}
												repo={
													repo
												}
												pullNumber={
													pullNumber
												}
												headBranch={
													headBranch
												}
												filename={
													filename
												}
												canWrite={
													canWrite
												}
											/>
										</td>
									</tr>
								))}

								{/* Comment form */}
								{(leftIsCommentForm ||
									rightIsCommentForm) &&
									commentRange && (
										<tr>
											<td
												colSpan={
													6
												}
												className="p-0"
											>
												<InlineCommentForm
													owner={
														owner!
													}
													repo={
														repo!
													}
													pullNumber={
														pullNumber!
													}
													headSha={
														headSha!
													}
													headBranch={
														headBranch
													}
													filename={
														filename
													}
													line={
														commentRange.endLine
													}
													side={
														commentRange.side
													}
													startLine={
														commentStartLine
													}
													selectedLinesContent={
														selectedLinesContent
													}
													selectedCodeForAI={
														selectedCodeForAI
													}
													onClose={
														onCloseComment
													}
													onAddContext={
														onAddContext
													}
													participants={
														participants
													}
												/>
											</td>
										</tr>
									)}
							</React.Fragment>
						);
					})}
				</tbody>
			</table>

			{/* Resize handle overlay */}
			<div
				className="absolute top-0 bottom-0 z-10"
				style={{
					left: `${splitRatio}%`,
					transform: "translateX(-50%)",
				}}
			>
				<ResizeHandle
					onResize={handleSplitResize}
					onDragStart={() => setIsDraggingSplit(true)}
					onDragEnd={() => setIsDraggingSplit(false)}
					onDoubleClick={() => setSplitRatio(50)}
				/>
			</div>
		</div>
	);
}

function SegmentedContent({
	segments,
	type,
}: {
	segments: DiffSegment[];
	type: "add" | "remove" | "context" | "header";
}) {
	return (
		<>
			{segments.map((seg, i) => (
				<span
					key={i}
					className={cn(
						type === "add" && "text-diff-add-text",
						type === "remove" && "text-diff-del-text",
						seg.highlight &&
							type === "add" &&
							"bg-diff-word-add rounded-[2px] px-[1px] -mx-[1px]",
						seg.highlight &&
							type === "remove" &&
							"bg-diff-word-del rounded-[2px] px-[1px] -mx-[1px]",
					)}
				>
					{seg.text}
				</span>
			))}
		</>
	);
}

/** Merges syntax highlighting tokens with word-diff segments.
 *  Segments provide the background highlight (changed words), tokens provide text color. */
function SyntaxSegmentedContent({
	segments,
	tokens,
	type,
}: {
	segments: DiffSegment[];
	tokens: SyntaxToken[];
	type: "add" | "remove" | "context" | "header";
}) {
	// Flatten segments and tokens by character position to merge them.
	// Walk through both simultaneously, splitting tokens at segment boundaries.
	const result: {
		text: string;
		highlight: boolean;
		lightColor: string;
		darkColor: string;
	}[] = [];

	let segIdx = 0;
	let segCharOffset = 0; // chars consumed in current segment
	let tokIdx = 0;
	let tokCharOffset = 0; // chars consumed in current token

	while (segIdx < segments.length && tokIdx < tokens.length) {
		const seg = segments[segIdx];
		const tok = tokens[tokIdx];
		const segRemaining = seg.text.length - segCharOffset;
		const tokRemaining = tok.text.length - tokCharOffset;
		const take = Math.min(segRemaining, tokRemaining);

		if (take > 0) {
			result.push({
				text: tok.text.slice(tokCharOffset, tokCharOffset + take),
				highlight: seg.highlight,
				lightColor: tok.lightColor,
				darkColor: tok.darkColor,
			});
		}

		segCharOffset += take;
		tokCharOffset += take;
		if (segCharOffset >= seg.text.length) {
			segIdx++;
			segCharOffset = 0;
		}
		if (tokCharOffset >= tok.text.length) {
			tokIdx++;
			tokCharOffset = 0;
		}
	}

	// Any remaining tokens (if segments ran out)
	while (tokIdx < tokens.length) {
		const tok = tokens[tokIdx];
		const text = tok.text.slice(tokCharOffset);
		if (text) {
			result.push({
				text,
				highlight: false,
				lightColor: tok.lightColor,
				darkColor: tok.darkColor,
			});
		}
		tokIdx++;
		tokCharOffset = 0;
	}

	return (
		<span className="diff-syntax">
			{result.map((r, i) => (
				<span
					key={i}
					className={cn(
						r.highlight &&
							type === "add" &&
							"bg-diff-word-add rounded-[2px] px-[1px] -mx-[1px]",
						r.highlight &&
							type === "remove" &&
							"bg-diff-word-del rounded-[2px] px-[1px] -mx-[1px]",
					)}
					style={{
						color: `light-dark(${r.lightColor}, ${r.darkColor})`,
					}}
				>
					{r.text}
				</span>
			))}
		</span>
	);
}

/** Full file view: shows entire file with diff changes highlighted inline */
function FullFileView({
	fileContent,
	lines,
	hunkInfos,
	wordWrap,
	fileHighlightData,
	fullFileTokens,
}: {
	fileContent: string[];
	lines: DiffLine[];
	hunkInfos: { index: number; newStart: number; newCount: number; endNewLine: number }[];
	wordWrap: boolean;
	fileHighlightData?: Record<string, SyntaxToken[]>;
	fullFileTokens?: SyntaxToken[][] | null;
}) {
	// Build a merged view: walk through the file content line by line,
	// inserting diff add/remove lines where they belong.

	// Collect changed line info from the diff
	const addedNewLines = new Set<number>(); // new-file line numbers that are additions
	const removedByNewLine = new Map<number, DiffLine[]>(); // removed lines keyed by the new-file line they precede
	const contextHighlight = new Map<
		number,
		{ tokens?: SyntaxToken[]; segments?: DiffSegment[] }
	>();

	// Walk hunks to map removed lines to their position in the new file
	for (let hi = 0; hi < hunkInfos.length; hi++) {
		const hunk = hunkInfos[hi];
		// Find diff lines belonging to this hunk
		const hunkDiffStart = hunk.index + 1; // skip the header
		const hunkDiffEnd =
			hi + 1 < hunkInfos.length ? hunkInfos[hi + 1].index : lines.length;

		let newLineTracker = hunk.newStart;
		const pendingRemoves: DiffLine[] = [];

		for (let li = hunkDiffStart; li < hunkDiffEnd; li++) {
			const dl = lines[li];
			if (dl.type === "remove") {
				pendingRemoves.push(dl);
			} else if (dl.type === "add") {
				addedNewLines.add(newLineTracker);
				// Attach pending removes to this add line
				if (pendingRemoves.length > 0) {
					const existing = removedByNewLine.get(newLineTracker) || [];
					existing.push(...pendingRemoves);
					removedByNewLine.set(newLineTracker, existing);
					pendingRemoves.length = 0;
				}
				// Store syntax tokens for add lines
				if (fileHighlightData) {
					contextHighlight.set(newLineTracker, {
						tokens: fileHighlightData[`A-${newLineTracker}`],
						segments: dl.segments,
					});
				}
				newLineTracker++;
			} else if (dl.type === "context") {
				// Flush pending removes before this context line
				if (pendingRemoves.length > 0) {
					const existing = removedByNewLine.get(newLineTracker) || [];
					existing.push(...pendingRemoves);
					removedByNewLine.set(newLineTracker, existing);
					pendingRemoves.length = 0;
				}
				// Store syntax tokens for context lines
				if (fileHighlightData) {
					contextHighlight.set(newLineTracker, {
						tokens: fileHighlightData[`C-${newLineTracker}`],
					});
				}
				newLineTracker++;
			}
		}
		// Remaining removes at end of hunk — attach to the line after the hunk
		if (pendingRemoves.length > 0) {
			const afterLine = newLineTracker;
			const existing = removedByNewLine.get(afterLine) || [];
			existing.push(...pendingRemoves);
			removedByNewLine.set(afterLine, existing);
		}
	}

	// Build merged rows
	type MergedRow =
		| {
				kind: "normal";
				lineNum: number;
				content: string;
				isAdd: boolean;
				tokens?: SyntaxToken[];
				segments?: DiffSegment[];
		  }
		| {
				kind: "removed";
				oldLineNum: number;
				content: string;
				tokens?: SyntaxToken[];
				segments?: DiffSegment[];
		  };

	const mergedRows: MergedRow[] = [];

	for (let i = 0; i < fileContent.length; i++) {
		const lineNum = i + 1;

		// Insert removed lines that precede this new-file line
		const removes = removedByNewLine.get(lineNum);
		if (removes) {
			for (const rm of removes) {
				mergedRows.push({
					kind: "removed",
					oldLineNum: rm.oldLineNumber ?? 0,
					content: rm.content,
					tokens: fileHighlightData?.[`R-${rm.oldLineNumber}`],
					segments: rm.segments,
				});
			}
		}

		const isAdd = addedNewLines.has(lineNum);
		const highlight = contextHighlight.get(lineNum);

		mergedRows.push({
			kind: "normal",
			lineNum,
			content: fileContent[i],
			isAdd,
			tokens: highlight?.tokens ?? fullFileTokens?.[i] ?? undefined,
			segments: highlight?.segments,
		});
	}

	// Handle removes that come after the last line
	const afterEnd = fileContent.length + 1;
	const trailingRemoves = removedByNewLine.get(afterEnd);
	if (trailingRemoves) {
		for (const rm of trailingRemoves) {
			mergedRows.push({
				kind: "removed",
				oldLineNum: rm.oldLineNumber ?? 0,
				content: rm.content,
				tokens: fileHighlightData?.[`R-${rm.oldLineNumber}`],
				segments: rm.segments,
			});
		}
	}

	return (
		<table className={cn("w-full border-collapse", wordWrap && "table-fixed")}>
			{wordWrap && (
				<colgroup>
					<col className="w-[3px]" />
					<col className="w-10" />
					<col />
				</colgroup>
			)}
			<tbody>
				{mergedRows.map((row, i) => {
					if (row.kind === "removed") {
						return (
							<tr
								key={`rm-${i}`}
								className="diff-del-row"
							>
								<td className="w-[3px] p-0 sticky left-0 z-[1] bg-destructive" />
								<td className="w-10 py-0 pr-2 text-right text-[11px] font-mono text-diff-del-gutter select-none border-r border-border/40 sticky left-[3px] z-[1] bg-diff-del-gutter" />
								<td
									className={cn(
										"py-0 font-mono text-[12.5px] leading-[20px] bg-diff-del-bg",
										wordWrap
											? "whitespace-pre-wrap break-words"
											: "whitespace-pre",
									)}
								>
									<div className="flex">
										<span className="inline-block w-5 text-center shrink-0 select-none text-destructive/50">
											-
										</span>
										<span className="pl-1">
											{row.tokens ? (
												row.segments ? (
													<SyntaxSegmentedContent
														segments={
															row.segments
														}
														tokens={
															row.tokens
														}
														type="remove"
													/>
												) : (
													<span className="diff-syntax">
														{row.tokens.map(
															(
																t,
																ti,
															) => (
																<span
																	key={
																		ti
																	}
																	style={{
																		color: `light-dark(${t.lightColor}, ${t.darkColor})`,
																	}}
																>
																	{
																		t.text
																	}
																</span>
															),
														)}
													</span>
												)
											) : (
												<span className="text-diff-del-text">
													{
														row.content
													}
												</span>
											)}
										</span>
									</div>
								</td>
							</tr>
						);
					}

					const isAdd = row.isAdd;
					return (
						<tr
							key={`ln-${i}`}
							className={
								isAdd ? "diff-add-row" : undefined
							}
						>
							<td
								className={cn(
									"w-[3px] p-0 sticky left-0 z-[1]",
									isAdd && "bg-success",
								)}
							/>
							<td
								className={cn(
									"w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-border/40 sticky left-[3px] z-[1]",
									isAdd
										? "bg-diff-add-gutter text-diff-add-gutter"
										: "text-muted-foreground/30",
								)}
							>
								{row.lineNum}
							</td>
							<td
								className={cn(
									"py-0 font-mono text-[12.5px] leading-[20px]",
									wordWrap
										? "whitespace-pre-wrap break-words"
										: "whitespace-pre",
									isAdd && "bg-diff-add-bg",
								)}
							>
								<div className="flex">
									<span
										className={cn(
											"inline-block w-5 text-center shrink-0 select-none",
											isAdd
												? "text-success/50"
												: "text-transparent",
										)}
									>
										{isAdd ? "+" : " "}
									</span>
									<span className="pl-1">
										{row.tokens ? (
											row.segments ? (
												<SyntaxSegmentedContent
													segments={
														row.segments
													}
													tokens={
														row.tokens
													}
													type={
														isAdd
															? "add"
															: "context"
													}
												/>
											) : (
												<span className="diff-syntax">
													{row.tokens.map(
														(
															t,
															ti,
														) => (
															<span
																key={
																	ti
																}
																style={{
																	color: `light-dark(${t.lightColor}, ${t.darkColor})`,
																}}
															>
																{
																	t.text
																}
															</span>
														),
													)}
												</span>
											)
										) : (
											<span
												className={
													isAdd
														? "text-diff-add-text"
														: ""
												}
											>
												{
													row.content
												}
											</span>
										)}
									</span>
								</div>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

function SidebarCommits({
	commits,
	owner,
	repo,
	checkStatus,
}: {
	commits: PRCommit[];
	owner?: string;
	repo?: string;
	checkStatus?: CheckStatus;
}) {
	const [commitStatuses, setCommitStatuses] = useState<Map<string, CheckStatus>>(new Map());
	const [loadingStatuses, setLoadingStatuses] = useState(false);

	// Fetch check status for all commits when the component mounts
	useEffect(() => {
		if (!owner || !repo || commits.length === 0) return;

		let cancelled = false;
		setLoadingStatuses(true);

		async function fetchAll() {
			const results = new Map<string, CheckStatus>();
			// Fetch in parallel, but limit concurrency
			const batch = commits.map(async (c) => {
				try {
					const res = await fetch(
						`/api/check-status?owner=${encodeURIComponent(owner!)}&repo=${encodeURIComponent(repo!)}&ref=${encodeURIComponent(c.sha)}`,
					);
					if (res.ok) {
						const data = await res.json();
						if (data && data.state) {
							results.set(c.sha, data as CheckStatus);
						}
					}
				} catch {
					// ignore individual failures
				}
			});
			await Promise.all(batch);
			if (!cancelled) {
				setCommitStatuses(results);
				setLoadingStatuses(false);
			}
		}

		fetchAll();
		return () => {
			cancelled = true;
		};
	}, [owner, repo, commits]);

	if (commits.length === 0) {
		return (
			<div className="px-3 py-8 text-center">
				<GitCommitHorizontal className="w-4 h-4 mx-auto mb-2 text-muted-foreground/30" />
				<p className="text-[11px] text-muted-foreground/50 font-mono">
					No commits
				</p>
			</div>
		);
	}

	return (
		<div>
			{/* Head commit CI status summary */}
			{checkStatus && (
				<div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
					<span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">
						CI / CD
					</span>
					<div className="ml-auto">
						<CheckStatusBadge
							checkStatus={checkStatus}
							align="right"
							owner={owner}
							repo={repo}
						/>
					</div>
				</div>
			)}

			{loadingStatuses && (
				<div className="px-3 py-1.5 flex items-center gap-1.5">
					<Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground" />
					<span className="text-[9px] font-mono text-muted-foreground">
						Loading check statuses...
					</span>
				</div>
			)}

			<div className="space-y-0.5">
				{commits.map((c) => {
					const shortSha = c.sha.slice(0, 7);
					const message = c.commit.message.split("\n")[0];
					const date = c.commit.author?.date;
					const commitUrl =
						owner && repo
							? `/${owner}/${repo}/commits/${c.sha}`
							: undefined;
					const commitCheck = commitStatuses.get(c.sha);

					return (
						<div
							key={c.sha}
							className="px-3 py-1.5 hover:bg-muted/50 transition-colors"
						>
							<div className="flex items-start gap-1.5">
								{c.author && (
									<Image
										src={
											c.author
												.avatar_url
										}
										alt={c.author.login}
										width={16}
										height={16}
										className="rounded-full mt-0.5 shrink-0"
									/>
								)}
								<div className="flex-1 min-w-0">
									{commitUrl ? (
										<Link
											href={
												commitUrl
											}
											className="text-[11px] font-mono text-foreground/80 hover:text-foreground hover:underline line-clamp-2 break-words block"
										>
											{message}
										</Link>
									) : (
										<span className="text-[11px] font-mono text-foreground/80 line-clamp-2 break-words block">
											{message}
										</span>
									)}
									<div className="flex items-center gap-1.5 mt-0.5">
										<span className="text-[9px] font-mono text-info/70">
											{shortSha}
										</span>
										{c.author && (
											<span className="text-[9px] text-muted-foreground/50 truncate">
												{
													c
														.author
														.login
												}
											</span>
										)}
										{commitCheck && (
											<span className="shrink-0">
												<CheckStatusBadge
													checkStatus={
														commitCheck
													}
													align="right"
													owner={
														owner
													}
													repo={
														repo
													}
												/>
											</span>
										)}
										{date && (
											<span className="text-[9px] text-muted-foreground ml-auto shrink-0">
												<TimeAgo
													date={
														date
													}
												/>
											</span>
										)}
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function SidebarReviews({
	files,
	threadsByFile,
	reviewSummaries,
	onNavigateToFile,
	owner,
	repo,
	pullNumber,
}: {
	files: DiffFile[];
	threadsByFile: Map<string, ReviewThread[]>;
	reviewSummaries: ReviewSummary[];
	onNavigateToFile: (index: number, line?: number | null) => void;
	owner?: string;
	repo?: string;
	pullNumber?: number;
}) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
		() => new Set(threadsByFile.keys()),
	);
	const [isPending, startTransition] = useTransition();

	const toggleFile = (path: string) => {
		setExpandedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const handleResolve = (threadId: string, resolve: boolean) => {
		if (!owner || !repo || !pullNumber) return;
		startTransition(async () => {
			if (resolve) {
				await resolveReviewThread(threadId, owner, repo, pullNumber);
			} else {
				await unresolveReviewThread(threadId, owner, repo, pullNumber);
			}
			emit({
				type: resolve ? "pr:thread-resolved" : "pr:thread-unresolved",
				owner,
				repo,
				number: pullNumber,
			});
			router.refresh();
		});
	};

	// Files that have threads
	const filesWithThreads = files
		.map((f, i) => ({
			file: f,
			index: i,
			threads: threadsByFile.get(f.filename) || [],
		}))
		.filter((f) => f.threads.length > 0);

	if (filesWithThreads.length === 0) {
		return (
			<div className="px-3 py-8 text-center">
				<MessageSquare className="w-4 h-4 mx-auto mb-2 text-muted-foreground/30" />
				<p className="text-[11px] text-muted-foreground/50 font-mono">
					No review threads
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-0.5">
			{/* Review summaries */}
			{reviewSummaries.length > 0 && (
				<div className="px-3 py-1.5 space-y-1">
					{reviewSummaries.map((r) => (
						<div
							key={r.id}
							className="flex items-center gap-1.5"
						>
							{r.user && (
								<Image
									src={r.user.avatar_url}
									alt={r.user.login}
									width={14}
									height={14}
									className="rounded-full"
								/>
							)}
							<span className="text-[10px] text-muted-foreground/70 truncate">
								{r.user?.login || "ghost"}
							</span>
							<ReviewStateBadge state={r.state} />
						</div>
					))}
				</div>
			)}

			{/* Per-file threads */}
			{filesWithThreads.map(({ file, index, threads }) => {
				const name = file.filename.split("/").pop() || file.filename;
				const isExpanded = expandedFiles.has(file.filename);
				const unresolvedCount = threads.filter((t) => !t.isResolved).length;

				return (
					<div key={file.filename}>
						<button
							onClick={() => {
								toggleFile(file.filename);
								onNavigateToFile(index, null);
							}}
							className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors cursor-pointer"
						>
							<ChevronDown
								className={cn(
									"w-3 h-3 shrink-0 text-muted-foreground/50 transition-transform",
									!isExpanded && "-rotate-90",
								)}
							/>
							<span className="text-[11px] font-mono text-foreground/80 truncate flex-1 min-w-0">
								{name}
							</span>
							{unresolvedCount > 0 && (
								<span className="text-[9px] px-1 py-px rounded-full bg-warning/15 text-warning tabular-nums shrink-0">
									{unresolvedCount}
								</span>
							)}
							<span className="text-[9px] text-muted-foreground/50 tabular-nums shrink-0">
								{threads.length}
							</span>
						</button>

						{isExpanded && (
							<div className="pl-3 pr-2 pb-1 space-y-1">
								{threads.map((thread) => {
									const firstComment =
										thread.comments[0];
									if (!firstComment)
										return null;

									return (
										<div
											key={
												thread.id
											}
											onClick={() =>
												onNavigateToFile(
													index,
													thread.line,
												)
											}
											className={cn(
												"rounded-md border text-left transition-colors cursor-pointer hover:bg-muted/50",
												thread.isResolved
													? "border-border/40 opacity-50"
													: "border-border",
											)}
										>
											{/* Thread header */}
											<div className="flex items-center gap-1 px-2 py-1">
												{thread.isResolved ? (
													<CheckCircle2 className="w-3 h-3 shrink-0 text-success/60" />
												) : (
													<Circle className="w-3 h-3 shrink-0 text-warning/60" />
												)}
												{firstComment.author && (
													<span className="text-[10px] font-medium text-foreground/60 truncate">
														{
															firstComment
																.author
																.login
														}
													</span>
												)}
												{thread.line && (
													<span className="text-[9px] font-mono text-muted-foreground ml-auto shrink-0">
														L
														{
															thread.line
														}
													</span>
												)}
											</div>
											{/* Comment body preview */}
											<div className="px-2 pb-1.5">
												<p className="text-[10px] text-muted-foreground/70 line-clamp-2 whitespace-pre-wrap break-words">
													{
														firstComment.body
													}
												</p>
												{thread
													.comments
													.length >
													1 && (
													<span className="text-[9px] text-muted-foreground/50 mt-0.5 block">
														+
														{thread
															.comments
															.length -
															1}{" "}
														more
													</span>
												)}
											</div>
											{/* Resolve/unresolve toggle */}
											{owner &&
												repo &&
												pullNumber && (
													<div className="px-2 pb-1.5">
														<button
															onClick={(
																e,
															) => {
																e.stopPropagation();
																handleResolve(
																	thread.id,
																	!thread.isResolved,
																);
															}}
															disabled={
																isPending
															}
															className={cn(
																"text-[9px] font-mono transition-colors cursor-pointer disabled:opacity-40",
																thread.isResolved
																	? "text-muted-foreground/50 hover:text-warning"
																	: "text-muted-foreground/50 hover:text-success",
															)}
														>
															{thread.isResolved
																? "Unresolve"
																: "Resolve"}
														</button>
													</div>
												)}
										</div>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

function ReviewStateBadge({ state }: { state: string }) {
	switch (state) {
		case "APPROVED":
			return (
				<span className="text-[9px] px-1.5 py-px rounded-full bg-success/10 text-success font-medium">
					Approved
				</span>
			);
		case "CHANGES_REQUESTED":
			return (
				<span className="text-[9px] px-1.5 py-px rounded-full bg-warning/10 text-warning font-medium">
					Changes
				</span>
			);
		case "COMMENTED":
			return (
				<span className="text-[9px] px-1.5 py-px rounded-full bg-info/10 text-info font-medium">
					Commented
				</span>
			);
		case "DISMISSED":
			return (
				<span className="text-[9px] px-1.5 py-px rounded-full bg-muted-foreground/10 text-muted-foreground/60 font-medium">
					Dismissed
				</span>
			);
		default:
			return null;
	}
}

function getFileIcon(status: string) {
	switch (status) {
		case "added":
			return FilePlus2;
		case "removed":
			return FileX2;
		case "modified":
			return FileEdit;
		case "renamed":
		case "copied":
			return ArrowRight;
		default:
			return FileText;
	}
}

function getFileIconColor(status: string) {
	switch (status) {
		case "added":
			return "text-success";
		case "removed":
			return "text-destructive";
		case "modified":
			return "text-warning";
		case "renamed":
		case "copied":
			return "text-info";
		default:
			return "text-muted-foreground/60";
	}
}

interface LineDiffEntry {
	type: "context" | "add" | "remove";
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

function computeLineDiff(oldText: string, newText: string): LineDiffEntry[] {
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const n = oldLines.length;
	const m = newLines.length;

	// LCS via DP
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			dp[i][j] =
				oldLines[i - 1] === newLines[j - 1]
					? dp[i - 1][j - 1] + 1
					: Math.max(dp[i - 1][j], dp[i][j - 1]);
		}
	}

	// Backtrack to get diff ops
	const ops: LineDiffEntry[] = [];
	let i = n,
		j = m;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			ops.push({
				type: "context",
				content: oldLines[i - 1],
				oldLineNumber: i,
				newLineNumber: j,
			});
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			ops.push({ type: "add", content: newLines[j - 1], newLineNumber: j });
			j--;
		} else {
			ops.push({ type: "remove", content: oldLines[i - 1], oldLineNumber: i });
			i--;
		}
	}
	ops.reverse();

	// Collapse into hunks with 3 lines of context
	const CONTEXT = 3;
	const changeIndices: number[] = [];
	for (let k = 0; k < ops.length; k++) {
		if (ops[k].type !== "context") changeIndices.push(k);
	}
	if (changeIndices.length === 0) return [];

	const includeSet = new Set<number>();
	for (const ci of changeIndices) {
		for (
			let k = Math.max(0, ci - CONTEXT);
			k <= Math.min(ops.length - 1, ci + CONTEXT);
			k++
		) {
			includeSet.add(k);
		}
	}

	const result: LineDiffEntry[] = [];
	const sortedIndices = Array.from(includeSet).sort((a, b) => a - b);
	for (let k = 0; k < sortedIndices.length; k++) {
		if (k > 0 && sortedIndices[k] - sortedIndices[k - 1] > 1) {
			// Gap separator
			result.push({ type: "context", content: "···" });
		}
		result.push(ops[sortedIndices[k]]);
	}

	return result;
}
