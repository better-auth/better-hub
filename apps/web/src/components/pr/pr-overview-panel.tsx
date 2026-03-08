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
	ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLanguageFromFilename, parseHunkHeader } from "@/lib/github-utils";
import { useColorTheme } from "@/components/theme/theme-provider";
import { highlightCodeClient } from "@/lib/shiki-client";

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
}

interface ParsedDiffLine {
	type: "add" | "remove" | "context" | "header";
	content: string;
	raw: string;
	lineNumber?: number;
}

function parseDiffSnippet(snippet: string, startLine?: number): ParsedDiffLine[] {
	const rawLines = snippet.split("\n");
	const result: ParsedDiffLine[] = [];
	let newLine: number | undefined = startLine;

	for (const raw of rawLines) {
		if (raw.startsWith("@@")) {
			if (newLine === undefined) {
				const hunk = parseHunkHeader(raw);
				newLine = hunk?.newStart;
			}
			result.push({ type: "header", content: raw, raw });
		} else if (raw.startsWith("+")) {
			result.push({
				type: "add",
				content: raw.slice(1),
				raw,
				lineNumber: newLine,
			});
			if (newLine !== undefined) newLine++;
		} else if (raw.startsWith("-")) {
			result.push({ type: "remove", content: raw.slice(1), raw });
		} else {
			result.push({
				type: "context",
				content: raw.startsWith(" ") ? raw.slice(1) : raw,
				raw,
				lineNumber: newLine,
			});
			if (newLine !== undefined) newLine++;
		}
	}

	return result;
}

function extractLineHtml(html: string): string {
	if (typeof window === "undefined") return "";
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	const shiki = doc.querySelector(".shiki");
	if (!shiki) return html;

	const lineSpan = shiki.querySelector(".line");
	if (lineSpan) {
		return lineSpan.innerHTML;
	}
	return shiki.innerHTML;
}

const DiffSnippet = memo(function DiffSnippet({
	snippet,
	filename,
	startLine,
}: {
	snippet: string;
	filename: string;
	startLine?: number;
}) {
	const { themeId } = useColorTheme();
	const parsed = useMemo(() => parseDiffSnippet(snippet, startLine), [snippet, startLine]);
	const [highlightedLines, setHighlightedLines] = useState<(string | null)[]>(() =>
		parsed.map(() => null),
	);

	useEffect(() => {
		let cancelled = false;
		const lang = getLanguageFromFilename(filename);

		(async () => {
			const results = await Promise.all(
				parsed.map(async (line) => {
					if (line.type === "header") return null;
					if (!line.content.trim()) return "";
					try {
						const html = await highlightCodeClient(
							line.content,
							lang,
							themeId,
						);
						return extractLineHtml(html);
					} catch {
						return null;
					}
				}),
			);

			if (!cancelled) {
				setHighlightedLines(results);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [parsed, filename, themeId]);

	return (
		<div className="rounded-b-md border overflow-hidden text-xs font-mono bg-[var(--code-bg)]">
			{parsed.map((line, i) => {
				const highlightedHtml = highlightedLines[i];
				return (
					<div
						key={i}
						className={cn(
							"pr-4 flex items-start relative",
							line.type === "add" && "bg-success/10",
							line.type === "remove" &&
								"bg-destructive/10",
							line.type === "header" &&
								"bg-muted/50 text-muted-foreground text-[11px]",
						)}
					>
						<span className="w-8 shrink-0 select-none text-right bg-diff-add-gutter text-diff-add-gutter pr-3 border-r border-border/40 tabular-nums py-1">
							{line.lineNumber ?? ""}
						</span>
						<span
							className={cn(
								"w-4 shrink-0 select-none",
								line.type === "add" &&
									"text-success",
								line.type === "remove" &&
									"text-destructive",
								line.type === "header" &&
									"text-muted-foreground",
							)}
						>
							{line.type === "add"
								? "+"
								: line.type === "remove"
									? "-"
									: ""}
						</span>
						<span className="flex-1 whitespace-pre-wrap break-all">
							{highlightedHtml !== null ? (
								<span
									dangerouslySetInnerHTML={{
										__html: highlightedHtml,
									}}
								/>
							) : (
								<span>{line.content}</span>
							)}
						</span>
					</div>
				);
			})}
		</div>
	);
});

function ChangeGroupCard({
	group,
	isViewed,
	isExpanded,
	onToggleViewed,
	onToggleExpanded,
}: {
	group: ChangeGroup;
	isViewed: boolean;
	isExpanded: boolean;
	onToggleViewed: () => void;
	onToggleExpanded: () => void;
}) {
	return (
		<div
			className={cn(
				"border border-border/50 rounded-xl bg-card overflow-hidden transition-opacity",
				isViewed && "opacity-50",
			)}
		>
			<div
				className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors select-none"
				onClick={onToggleExpanded}
			>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onToggleViewed();
					}}
					className="mt-1 shrink-0"
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
					<div className="flex items-center gap-2.5 flex-wrap">
						<span
							className={cn(
								"text-[11px] font-mono px-2 py-0.5 rounded-md bg-muted text-muted-foreground",
								isViewed && "line-through",
							)}
						>
							#{group.reviewOrder}
						</span>
						<h3
							className={cn(
								"font-semibold text-base",
								isViewed &&
									"line-through text-muted-foreground",
							)}
						>
							{group.title}
						</h3>
						<span className="text-xs text-muted-foreground">
							{group.files.length} file
							{group.files.length !== 1 ? "s" : ""}
						</span>
					</div>
				</div>

				<ChevronDown
					className={cn(
						"w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-300 mt-1",
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
					<div className="border-t border-border/40 px-5 py-5 space-y-6 bg-muted/5">
						<p className="text-sm text-muted-foreground leading-relaxed">
							{group.summary}
						</p>
						{group.files.map((file, i) => (
							<div key={i} className="">
								<div className="flex items-center gap-2.5 border-t border-x px-3 pt-2 bg-[var(--code-bg)] pb-4 -mb-2 rounded-t-md">
									<FileCode2 className="w-4 h-4 text-muted-foreground" />
									<span className="font-mono flex items-center flex-1 min-w-0">
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
									<button
										onClick={(e) => {
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
										title="View in code tab"
									>
										<ArrowUpRight className="w-4 h-4" />
									</button>
								</div>
								{file.snippet && (
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
									/>
								)}
								<p className="text-sm text-muted-foreground leading-relaxed mt-3">
									{file.explanation}
								</p>
							</div>
						))}
						<div className="flex justify-end pt-2">
							<button
								onClick={(e) => {
									e.stopPropagation();
									onToggleViewed();
								}}
								className={cn(
									"flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
									isViewed
										? "bg-muted text-muted-foreground hover:bg-muted/80"
										: "bg-primary text-primary-foreground hover:bg-primary/90",
								)}
							>
								<Check className="w-4 h-4" />
								{isViewed
									? "Unmark reviewed"
									: "Mark reviewed"}
							</button>
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
}: PROverviewPanelProps) {
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

				if (data.groups?.length > 0) {
					setExpandedGroups(new Set([data.groups[0].id]));
				}
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
		if (!hasLoaded && files.length > 0) {
			fetchAnalysis();
		}
	}, [hasLoaded, files.length, fetchAnalysis]);

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

	const viewedCount = viewedGroups.size;
	const totalCount = groups.length;
	const progressPercent = totalCount > 0 ? Math.round((viewedCount / totalCount) * 100) : 0;

	if (files.length === 0) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground">
				<p className="text-base">No files to analyze</p>
			</div>
		);
	}

	return (
		<div className="max-w-4xl mx-auto px-8 py-8">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h2 className="text-xl font-semibold">
						AI Review Overview
					</h2>
					<p className="text-sm text-muted-foreground mt-0.5">
						Changes grouped by feature area in suggested review
						order
					</p>
				</div>

				{hasLoaded && !isLoading && (
					<div className="flex items-center gap-5">
						<div className="flex items-center gap-3 text-sm text-muted-foreground">
							<div className="w-28 h-2 bg-muted rounded-full overflow-hidden">
								<div
									className="h-full bg-primary transition-all duration-300"
									style={{
										width: `${progressPercent}%`,
									}}
								/>
							</div>
							<span className="font-mono tabular-nums">
								{viewedCount}/{totalCount}
							</span>
						</div>
						<button
							onClick={() => fetchAnalysis(true)}
							className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
							title="Refresh analysis"
						>
							<RefreshCw className="w-4 h-4" />
							Regenerate
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
							This may take a moment for large PRs
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

			{!isLoading && !error && groups.length > 0 && (
				<>
					<div className="space-y-4">
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
										group={group}
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
									/>
								</div>
							))}
					</div>

					<div className="flex items-center justify-center py-12 mt-8">
						<div className="flex items-center gap-4 text-muted-foreground/50">
							<div className="h-px w-16 bg-border/50" />
							<div className="flex items-center gap-2 text-sm">
								<Check className="w-4 h-4" />
								<span>End of review</span>
							</div>
							<div className="h-px w-16 bg-border/50" />
						</div>
					</div>
				</>
			)}

			{!isLoading && !error && hasLoaded && groups.length === 0 && (
				<div className="flex flex-col items-center justify-center py-20 gap-5">
					<Sparkles className="w-10 h-10 text-muted-foreground" />
					<div className="text-center">
						<p className="text-base text-muted-foreground">
							No analysis available
						</p>
						<p className="text-sm text-muted-foreground mt-2">
							Try refreshing to generate an analysis
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
