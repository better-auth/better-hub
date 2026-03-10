"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import {
	Check,
	Loader2,
	Sparkles,
	FileCode2,
	ChevronDown,
	RefreshCw,
	AlertCircle,
	TextSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverviewActive } from "./pr-detail-layout";
import { parseDiffPatch } from "@/lib/github-utils";
import type { SyntaxToken } from "@/lib/shiki";
import { highlightDiffLinesClient } from "@/lib/shiki-client";
import { useColorTheme } from "@/components/theme/theme-provider";
import { DiffSnippetTable } from "./diff-snippet-table";
import { ClientMarkdown } from "../shared/client-markdown";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** Turn single newlines into paragraph breaks, preserving fenced code blocks. */
function ensureParagraphBreaks(md: string): string {
	return md
		.split(/(```[\s\S]*?```)/g)
		.map((segment, i) =>
			i % 2 === 1 ? segment : segment.replace(/(?<!\n)\n(?!\n)/g, "\n\n"),
		)
		.join("");
}

interface DiffFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

interface FileAnalysis {
	filename: string;
	snippet: string;
	explanation: string;
	startLine?: number;
	endLine?: number;
}

interface ChangeGroup {
	id: string;
	title: string;
	summary: string;
	reviewOrder: number;
	files: FileAnalysis[];
}

interface PROverviewPanelProps {
	owner: string;
	repo: string;
	pullNumber: number;
	headSha: string;
	files: DiffFile[];
	prTitle: string;
	prBody: string;
	participants?: Array<{ login: string; avatar_url: string }>;
}

function isSnippetNewFile(snippet: string, startLine?: number): boolean {
	const patch = buildSnippetPatch(snippet, startLine);
	const headerMatch = patch.match(/^@@\s+(-\d+(?:,\d+)?)\s/);
	if (headerMatch) return headerMatch[1] === "-0,0";
	return false;
}

function buildSnippetPatch(snippet: string, startLine?: number): string {
	if (snippet.includes("@@")) return snippet;

	// Fallback for legacy cached data without a hunk header
	const lines = snippet.split("\n").filter((l) => l.length > 0);
	if (lines.length === 0) return "";

	const hasPrefixes = lines.some((l) => l.startsWith("+") || l.startsWith("-"));
	const normalized = hasPrefixes ? lines : lines.map((l) => `+${l}`);

	let oldCount = 0;
	let newCount = 0;
	for (const line of normalized) {
		if (line.startsWith("+")) newCount++;
		else if (line.startsWith("-")) oldCount++;
		else {
			oldCount++;
			newCount++;
		}
	}
	const start = startLine ?? 1;
	const oldStart = oldCount > 0 ? start : 0;
	return `@@ -${oldStart},${oldCount} +${start},${newCount} @@\n${normalized.join("\n")}`;
}

const DiffSnippet = memo(function DiffSnippet({
	snippet,
	filename,
	startLine,
	canComment,
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
	hideNewBadge,
}: {
	snippet: string;
	filename: string;
	startLine?: number;
	canComment?: boolean;
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headSha?: string;
	headBranch?: string;
	hideNewBadge?: boolean;
}) {
	const { themeId } = useColorTheme();
	const patch = useMemo(() => buildSnippetPatch(snippet, startLine), [snippet, startLine]);
	const lines = useMemo(() => parseDiffPatch(patch), [patch]);
	const [highlightData, setHighlightData] = useState<
		Record<string, SyntaxToken[]> | undefined
	>();

	useEffect(() => {
		let cancelled = false;
		highlightDiffLinesClient(patch, filename, themeId)
			.then((tokens) => {
				if (!cancelled) setHighlightData(tokens);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [patch, filename, themeId]);

	return (
		<DiffSnippetTable
			key={highlightData ? 1 : 0}
			wordWrap={false}
			lines={lines}
			filename={filename}
			fileHighlightData={highlightData}
			canComment={canComment}
			owner={owner}
			repo={repo}
			pullNumber={pullNumber}
			headSha={headSha}
			headBranch={headBranch}
			hideNewBadge={hideNewBadge}
		/>
	);
});

function ChangeGroupCard({
	group,
	isViewed,
	isExpanded,
	onToggleViewed,
	onToggleExpanded,
	additions,
	deletions,
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
}: {
	group: ChangeGroup;
	isViewed: boolean;
	isExpanded: boolean;
	onToggleViewed: () => void;
	onToggleExpanded: () => void;
	additions: number;
	deletions: number;
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headSha?: string;
	headBranch?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-md bg-card overflow-hidden transition-opacity",
				isViewed && "opacity-50",
				isExpanded ? "shadow-sm" : "shadow-xs",
			)}
		>
			<div
				className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
				onClick={onToggleExpanded}
			>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onToggleViewed();
					}}
					className="shrink-0"
					title={isViewed ? "Mark as unviewed" : "Mark as viewed"}
				>
					<span
						className={cn(
							"w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer",
							isViewed
								? "bg-primary border-primary"
								: "border-muted-foreground/30 hover:border-muted-foreground/50",
						)}
					>
						{isViewed && (
							<Check className="w-3 h-3 text-primary-foreground" />
						)}
					</span>
				</button>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2.5 min-w-0">
						<span
							className={cn(
								"text-xs font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0",
								isViewed && "line-through",
							)}
						>
							#{group.reviewOrder}
						</span>
						<h3
							className={cn(
								"font-semibold text-sm truncate min-w-0",
								isViewed &&
									"line-through text-muted-foreground",
							)}
						>
							{group.title}
						</h3>
						<span className="text-xs text-muted-foreground shrink-0">
							{group.files.length} section
							{group.files.length !== 1 ? "s" : ""}
						</span>
					</div>
				</div>

				{(additions > 0 || deletions > 0) && (
					<span className="text-[11px] font-mono text-muted-foreground/60 shrink-0 tabular-nums">
						{additions > 0 && (
							<span className="text-success/70">
								+{additions}
							</span>
						)}
						{additions > 0 && deletions > 0 && (
							<span className="text-muted-foreground/30 mx-1">
								/
							</span>
						)}
						{deletions > 0 && (
							<span className="text-red-400/70">
								-{deletions}
							</span>
						)}
					</span>
				)}

				<ChevronDown
					className={cn(
						"w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-300",
						isExpanded && "rotate-180",
					)}
				/>
			</div>

			<div
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-300 ease-out",
					isExpanded
						? "grid-rows-[1fr] opacity-100"
						: "grid-rows-[0fr] opacity-0",
				)}
			>
				<div className="overflow-hidden">
					<div className="border-t border-border/50! px-3 py-4 space-y-6 bg-muted/5">
						<div className="text-sm text-muted-foreground brightness-120 leading-relaxed px-2">
							<ClientMarkdown
								content={ensureParagraphBreaks(
									group.summary,
								)}
								className="ghmd-md [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
							/>
						</div>
						<div className="mt-3 mb-6 h-px w-full bg-border/40"></div>
						{group.files.map((file, i) => (
							<div key={i} className="mt-3">
								<div className="flex gap-3 my-3 pl-2">
									<h3 className="text-sm font-medium shrink-0">
										{i + 1}.
									</h3>
									<div className="text-sm text-muted-foreground leading-relaxed min-w-0">
										<ClientMarkdown
											content={ensureParagraphBreaks(
												file.explanation,
											)}
											className="ghmd-md [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
										/>
									</div>
								</div>

								{file.snippet && (
									<div className="px-2">
										<div className="flex items-center gap-2.5 border-t border-x border-foreground/20! px-3 pt-2 bg-[var(--code-bg)] pb-4 -mb-2 rounded-t-md">
											<FileCode2 className="w-4 h-4 text-muted-foreground shrink-0" />
											<span className="font-mono flex items-center flex-1 min-w-0 overflow-hidden">
												<span
													className="truncate cursor-pointer hover:underline decoration-border underline-offset-4"
													onClick={(
														e,
													) => {
														e.stopPropagation();
														window.dispatchEvent(
															new CustomEvent(
																"ghost:navigate-to-file",
																{
																	detail: {
																		filename: file.filename,
																		line: file.startLine,
																	},
																},
															),
														);
													}}
												>
													{file.filename.includes(
														"/",
													) && (
														<span className="text-xs text-muted-foreground">
															{file.filename.substring(
																0,
																file.filename.lastIndexOf(
																	"/",
																) +
																	1,
															)}
														</span>
													)}
													<span className="text-sm text-foreground/90">
														{file.filename.includes(
															"/",
														)
															? file.filename.substring(
																	file.filename.lastIndexOf(
																		"/",
																	) +
																		1,
																)
															: file.filename}
													</span>
												</span>
												{isSnippetNewFile(
													file.snippet,
													file.startLine,
												) && (
													<Badge
														variant="outline"
														className="text-[10px] px-1.5 py-0 ml-2 shrink-0 text-success border-success/30 bg-success/10"
													>
														New
													</Badge>
												)}
											</span>
											<Tooltip>
												<TooltipTrigger
													asChild
												>
													<button
														onClick={(
															e,
														) => {
															e.stopPropagation();
															window.dispatchEvent(
																new CustomEvent(
																	"ghost:navigate-to-file",
																	{
																		detail: {
																			filename: file.filename,
																			line: file.startLine,
																		},
																	},
																),
															);
														}}
														className="shrink-0 p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
													>
														<TextSearch className="w-4 h-4" />
													</button>
												</TooltipTrigger>
												<TooltipContent className="text-xs z-[10]">
													Go
													to
													code
												</TooltipContent>
											</Tooltip>
										</div>
										<DiffSnippet
											snippet={
												file.snippet
											}
											filename={
												file.filename
											}
											startLine={
												file.startLine
											}
											canComment={
												!!(
													owner &&
													repo &&
													pullNumber &&
													headSha
												)
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
											hideNewBadge
										/>
									</div>
								)}
								{i !== group.files.length - 1 && (
									<div className="mb-8 mt-10 h-px w-full bg-border/40"></div>
								)}
							</div>
						))}
						<div className="flex justify-end">
							<Button
								variant="outline"
								onClick={(e) => {
									e.stopPropagation();
									onToggleViewed();
								}}
								size={"sm"}
							>
								<Check className="w-4 h-4" />
								{isViewed
									? "Unmark reviewed"
									: "Mark reviewed"}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

const LOADING_PHRASES = [
	"Analyzing code changes",
	"Categorizing modifications",
	"Understanding the diff",
	"Grouping related changes",
	"Preparing review order",
];

export function PROverviewPanel({
	owner,
	repo,
	pullNumber,
	headSha,
	files,
	prTitle,
	prBody,
	participants,
}: PROverviewPanelProps) {
	const isActive = useOverviewActive();
	const [groups, setGroups] = useState<ChangeGroup[]>([]);
	const [viewedGroups, setViewedGroups] = useState<Set<string>>(new Set());
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
	const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);
	const [hasLoaded, setHasLoaded] = useState(false);

	useEffect(() => {
		if (!isLoading) return;
		let i = 0;
		const interval = setInterval(() => {
			i = (i + 1) % LOADING_PHRASES.length;
			setLoadingPhrase(LOADING_PHRASES[i]);
		}, 2500);
		return () => clearInterval(interval);
	}, [isLoading]);

	const fetchAnalysis = useCallback(
		async (forceRefresh = false) => {
			if (files.length === 0) return;

			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch("/api/ai/pr-overview", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						owner,
						repo,
						pullNumber,
						headSha,
						prTitle,
						prBody,
						refresh: forceRefresh,
						files: files.map((f) => ({
							filename: f.filename,
							status: f.status,
							additions: f.additions,
							deletions: f.deletions,
							patch: f.patch,
						})),
					}),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || "Failed to analyze PR");
				}

				const data = await response.json();
				setGroups(data.groups || []);
				setHasLoaded(true);

				setExpandedGroups(new Set());
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to analyze PR",
				);
			} finally {
				setIsLoading(false);
			}
		},
		[owner, repo, pullNumber, headSha, prTitle, prBody, files],
	);

	useEffect(() => {
		if (isActive && !hasLoaded && files.length > 0) {
			fetchAnalysis();
		}
	}, [isActive, hasLoaded, files.length, fetchAnalysis]);

	const toggleViewed = useCallback(
		(groupId: string) => {
			setViewedGroups((prev) => {
				const next = new Set(prev);
				const wasViewed = next.has(groupId);

				if (wasViewed) {
					next.delete(groupId);
				} else {
					next.add(groupId);

					// When marking as viewed, collapse current and expand next unviewed
					const sortedGroups = [...groups].sort(
						(a, b) => a.reviewOrder - b.reviewOrder,
					);
					const currentIndex = sortedGroups.findIndex(
						(g) => g.id === groupId,
					);

					// Find next unviewed group
					let nextGroup: ChangeGroup | undefined;
					for (
						let i = currentIndex + 1;
						i < sortedGroups.length;
						i++
					) {
						if (!next.has(sortedGroups[i].id)) {
							nextGroup = sortedGroups[i];
							break;
						}
					}

					// Collapse current, expand next
					setExpandedGroups((prevExpanded) => {
						const nextExpanded = new Set(prevExpanded);
						nextExpanded.delete(groupId);
						if (nextGroup) {
							nextExpanded.add(nextGroup.id);
						}
						return nextExpanded;
					});

					const scrollToId = groupId;
					setTimeout(() => {
						const el = cardRefs.current.get(scrollToId);
						if (!el) return;
						let container = el.parentElement;
						while (
							container &&
							container !== document.documentElement
						) {
							const { overflowY } =
								getComputedStyle(container);
							if (
								overflowY === "auto" ||
								overflowY === "scroll"
							)
								break;
							container = container.parentElement;
						}
						const target =
							container ?? document.documentElement;
						const elTop = el.getBoundingClientRect().top;
						const containerTop =
							target === document.documentElement
								? 0
								: target.getBoundingClientRect()
										.top;
						target.scrollBy({
							top: elTop - containerTop - 64,
							behavior: "smooth",
						});
					}, 100);
				}

				return next;
			});
		},
		[groups],
	);

	const toggleExpanded = useCallback((groupId: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) {
				next.delete(groupId);
			} else {
				next.add(groupId);
			}
			return next;
		});
	}, []);

	const fileStatsMap = useMemo(() => {
		const m = new Map<string, { additions: number; deletions: number }>();
		for (const f of files) {
			m.set(f.filename, { additions: f.additions, deletions: f.deletions });
		}
		return m;
	}, [files]);

	const viewedCount = viewedGroups.size;
	const totalCount = groups.length;
	const progressPercent = totalCount > 0 ? Math.round((viewedCount / totalCount) * 100) : 0;

	const showReviewForm = !isLoading && !error && groups.length > 0;

	if (files.length === 0) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<p className="text-base">No files to analyze</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			<div
				className="flex-1 overflow-y-auto overscroll-contain min-h-0 pb-12 pr-3 -mr-3"
				style={{
					maskImage: "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
				}}
			>
				<div className="max-w-[1000px] mx-auto pl-4 pr-1 py-6">
					<div className="flex items-center justify-between mb-6">
						<div>
							<div className="flex items-center gap-3 text-sm text-muted-foreground">
								<div className="w-28 h-2 bg-muted rounded-full overflow-hidden border border-border/50! shadow-xs">
									<div
										className="h-full bg-primary transition-all duration-300"
										style={{
											width: `${progressPercent}%`,
										}}
									/>
								</div>
								<span className="font-mono tabular-nums">
									{viewedCount}/{totalCount}{" "}
									sections reviewed
								</span>
							</div>
						</div>

						{hasLoaded && !isLoading && (
							<div className="flex items-center gap-5">
								<button
									onClick={() =>
										fetchAnalysis(true)
									}
									className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
									title="Refresh analysis"
								>
									<RefreshCw className="w-4 h-4" />
									Regenerate Overview
								</button>
							</div>
						)}
					</div>

					{isLoading && (
						<div className="flex flex-col items-center justify-center py-20 gap-5">
							<Loader2 className="w-10 h-10 text-primary animate-spin" />
							<div className="text-center">
								<p className="text-base text-foreground font-medium">
									{loadingPhrase}...
								</p>
								<p className="text-sm text-muted-foreground mt-2">
									This may take a moment for
									large PRs
								</p>
							</div>
						</div>
					)}

					{error && (
						<div className="flex flex-col items-center justify-center py-20 gap-5">
							<AlertCircle className="w-10 h-10 text-destructive" />
							<div className="text-center">
								<p className="text-base text-destructive font-medium">
									Analysis failed
								</p>
								<p className="text-sm text-muted-foreground mt-2">
									{error}
								</p>
							</div>
							<button
								onClick={() => fetchAnalysis(true)}
								className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors cursor-pointer mt-2"
							>
								<RefreshCw className="w-4 h-4" />
								Try again
							</button>
						</div>
					)}

					{showReviewForm && (
						<div className="space-y-6">
							{groups
								.sort(
									(a, b) =>
										a.reviewOrder -
										b.reviewOrder,
								)
								.map((group) => (
									<div
										key={group.id}
										ref={(el) => {
											if (el) {
												cardRefs.current.set(
													group.id,
													el,
												);
											} else {
												cardRefs.current.delete(
													group.id,
												);
											}
										}}
									>
										<ChangeGroupCard
											group={
												group
											}
											isViewed={viewedGroups.has(
												group.id,
											)}
											isExpanded={expandedGroups.has(
												group.id,
											)}
											onToggleViewed={() =>
												toggleViewed(
													group.id,
												)
											}
											onToggleExpanded={() =>
												toggleExpanded(
													group.id,
												)
											}
											additions={group.files.reduce(
												(
													sum,
													f,
												) =>
													sum +
													(fileStatsMap.get(
														f.filename,
													)
														?.additions ??
														0),
												0,
											)}
											deletions={group.files.reduce(
												(
													sum,
													f,
												) =>
													sum +
													(fileStatsMap.get(
														f.filename,
													)
														?.deletions ??
														0),
												0,
											)}
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
										/>
									</div>
								))}
						</div>
					)}

					{!isLoading &&
						!error &&
						hasLoaded &&
						groups.length === 0 && (
							<div className="flex flex-col items-center justify-center py-20 gap-5">
								<Sparkles className="w-10 h-10 text-muted-foreground" />
								<div className="text-center">
									<p className="text-base text-muted-foreground">
										No analysis
										available
									</p>
									<p className="text-sm text-muted-foreground mt-2">
										Try refreshing to
										generate an analysis
									</p>
								</div>
							</div>
						)}
				</div>
			</div>
		</div>
	);
}
