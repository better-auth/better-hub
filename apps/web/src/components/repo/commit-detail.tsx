"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { parseDiffPatch, type DiffLine, type DiffSegment } from "@/lib/github-utils";
import type { SyntaxToken } from "@/lib/shiki";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { parseCoAuthors, getCommitBody, getInitials } from "@/lib/commit-utils";
import {
	File,
	FilePlus2,
	FileX2,
	FileEdit,
	ArrowRight,
	FileText,
	ChevronLeft,
	ChevronRight,
	WrapText,
	Copy,
	Check,
	GitCommitHorizontal,
	Link2,
} from "lucide-react";
import { ResizeHandle } from "@/components/ui/resize-handle";

interface CommitFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

interface CommitAuthor {
	login: string;
	avatar_url: string;
	html_url: string;
}

interface CommitData {
	sha: string;
	html_url: string;
	commit: {
		message: string;
		author: {
			name?: string | null;
			date?: string | null;
		} | null;
		committer: {
			name?: string | null;
			date?: string | null;
		} | null;
	};
	author: CommitAuthor | null;
	committer: CommitAuthor | null;
	parents: { sha: string; html_url: string }[];
	stats?: {
		total: number;
		additions: number;
		deletions: number;
	};
	files: CommitFile[];
}

interface CommitDetailProps {
	owner: string;
	repo: string;
	commit: CommitData;
	highlightData: Record<string, Record<string, SyntaxToken[]>>;
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

const SIDEBAR_WIDTH_COOKIE = "commit_detail_sidebar_width";
const DEFAULT_SIDEBAR_WIDTH = 300;
const MIN_SIDEBAR_WIDTH = 140;
const MAX_SIDEBAR_WIDTH = 1000;

export function CommitDetail({ owner, repo, commit, highlightData }: CommitDetailProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const [wordWrap, setWordWrap] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
	const [isDragging, setIsDragging] = useState(false);
	const [copiedSha, setCopiedSha] = useState(false);
	const [copiedLink, setCopiedLink] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const match = document.cookie.match(
			new RegExp(`(?:^|; )${SIDEBAR_WIDTH_COOKIE}=([^;]*)`),
		);
		if (match) {
			const savedWidth = parseInt(match[1], 10);
			if (
				!isNaN(savedWidth) &&
				savedWidth >= MIN_SIDEBAR_WIDTH &&
				savedWidth <= MAX_SIDEBAR_WIDTH
			) {
				setSidebarWidth(savedWidth);
			}
		}
	}, []);

	const saveSidebarWidthCookie = useCallback((width: number | null) => {
		if (width === null) {
			document.cookie = `${SIDEBAR_WIDTH_COOKIE}=;path=/;max-age=0`;
		} else {
			document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${width};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
		}
	}, []);

	const files = commit.files;
	const totalAdditions =
		commit.stats?.additions ?? files.reduce((s, f) => s + f.additions, 0);
	const totalDeletions =
		commit.stats?.deletions ?? files.reduce((s, f) => s + f.deletions, 0);
	const currentFile = files[activeIndex];

	const handleSidebarResize = useCallback((clientX: number) => {
		if (!containerRef.current) return;
		const rect = containerRef.current.getBoundingClientRect();
		const x = clientX - rect.left;
		setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, x)));
	}, []);

	const handleSidebarResizeEnd = useCallback(() => {
		setIsDragging(false);
		saveSidebarWidthCookie(sidebarWidth);
	}, [sidebarWidth, saveSidebarWidthCookie]);

	const resetSidebarWidth = useCallback(() => {
		setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
		saveSidebarWidthCookie(null);
	}, [saveSidebarWidthCookie]);

	const copySha = () => {
		navigator.clipboard.writeText(commit.sha);
		setCopiedSha(true);
		setTimeout(() => setCopiedSha(false), 2000);
	};

	const copyLink = () => {
		const url = `${window.location.origin}/${owner}/${repo}/commits/${commit.sha}`;
		navigator.clipboard.writeText(url);
		setCopiedLink(true);
		setTimeout(() => setCopiedLink(false), 2000);
	};

	// Parse the commit message: first line is title, rest is body (excluding co-author trailers)
	const title = commit.commit.message.split("\n")[0];
	const body = getCommitBody(commit.commit.message);
	const coAuthors = parseCoAuthors(commit.commit.message);

	const authorDate = commit.commit.author?.date;
	const authorName = commit.author?.login ?? commit.commit.author?.name ?? "Unknown";

	return (
		<div className="flex flex-col h-full">
			{/* Commit header */}
			<div className="shrink-0 border-b border-border px-4 py-3 space-y-2">
				<div className="flex items-start gap-3">
					<GitCommitHorizontal className="w-5 h-5 text-muted-foreground/50 mt-0.5 shrink-0" />
					<div className="min-w-0 flex-1">
						<h1 className="text-sm font-semibold text-foreground leading-snug">
							{title}
						</h1>
						{body && (
							<pre className="mt-1.5 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
								{body}
							</pre>
						)}
					</div>
				</div>

				<div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
					{/* Author */}
					<div className="flex items-center gap-1.5">
						{commit.author?.login ? (
							<Link
								href={`/users/${commit.author.login}`}
								className="flex items-center gap-1.5 font-medium text-foreground hover:underline"
							>
								<Image
									src={
										commit.author
											.avatar_url
									}
									alt={authorName}
									width={18}
									height={18}
									className="rounded-full"
								/>
								{commit.author.login}
							</Link>
						) : (
							<>
								{commit.author?.avatar_url ? (
									<Image
										src={
											commit
												.author
												.avatar_url
										}
										alt={authorName}
										width={18}
										height={18}
										className="rounded-full"
									/>
								) : (
									<div className="h-[18px] w-[18px] rounded-full bg-muted" />
								)}
								<span className="font-medium text-foreground">
									{authorName}
								</span>
							</>
						)}
						{authorDate && (
							<span>
								committed{" "}
								<TimeAgo date={authorDate} />
							</span>
						)}
					</div>

					{/* Co-authors */}
					{coAuthors.length > 0 && (
						<>
							<span className="text-muted-foreground/30">
								|
							</span>
							<div className="flex items-center gap-1.5">
								{coAuthors.map((ca) => (
									<div
										key={ca.email}
										className="flex items-center gap-1"
										title={`${ca.name} <${ca.email}>`}
									>
										<div className="rounded-full bg-muted flex items-center justify-center shrink-0 h-[18px] w-[18px]">
											<span className="text-[7px] font-medium text-muted-foreground leading-none">
												{getInitials(
													ca.name,
												)}
											</span>
										</div>
										<span className="text-xs text-foreground/70">
											{ca.name}
										</span>
									</div>
								))}
							</div>
						</>
					)}

					<span className="text-muted-foreground/30">|</span>

					{/* SHA */}
					<button
						onClick={copySha}
						title="Copy full SHA"
						className="flex items-center gap-1 font-mono text-[11px] text-info hover:underline cursor-pointer"
					>
						{copiedSha ? (
							<Check className="w-3 h-3" />
						) : (
							<Copy className="w-3 h-3" />
						)}
						{commit.sha.slice(0, 7)}
					</button>
					<button
						onClick={copyLink}
						title="Copy commit link"
						className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-info cursor-pointer transition-colors"
					>
						{copiedLink ? (
							<Check className="w-3 h-3 text-info" />
						) : (
							<Link2 className="w-3 h-3" />
						)}
						{copiedLink ? "Copied!" : "Link"}
					</button>

					{/* Parents */}
					{commit.parents.length > 0 && (
						<>
							<span className="text-muted-foreground/30">
								|
							</span>
							<span className="text-muted-foreground/70">
								{commit.parents.length === 1
									? "Parent:"
									: "Parents:"}
							</span>
							{commit.parents.map((p) => (
								<Link
									key={p.sha}
									href={`/${owner}/${repo}/commits/${p.sha}`}
									className="font-mono text-[11px] text-info hover:underline"
								>
									{p.sha.slice(0, 7)}
								</Link>
							))}
						</>
					)}

					<span className="text-muted-foreground/30">|</span>

					{/* Stats */}
					<span className="font-mono text-[11px]">
						{files.length} file{files.length !== 1 ? "s" : ""}
					</span>
					<span className="font-mono text-[11px] text-success">
						+{totalAdditions}
					</span>
					<span className="font-mono text-[11px] text-destructive">
						-{totalDeletions}
					</span>
				</div>
			</div>

			{/* Diff viewer */}
			<div ref={containerRef} className="flex flex-1 min-h-0 min-w-0">
				{/* File sidebar */}
				<div
					className="hidden lg:flex flex-col shrink-0 border-r border-border"
					style={{
						width: sidebarWidth,
						transition: isDragging
							? "none"
							: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
					}}
				>
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
					</div>

					<div className="flex-1 overflow-y-auto">
						{files.map((file, i) => {
							const name =
								file.filename.split("/").pop() ||
								file.filename;
							const dir = file.filename.includes("/")
								? file.filename.slice(
										0,
										file.filename.lastIndexOf(
											"/",
										),
									)
								: "";
							const Icon = getFileIcon(file.status);

							return (
								<button
									key={file.filename}
									onClick={() =>
										setActiveIndex(i)
									}
									className={cn(
										"w-full flex items-center gap-1.5 px-3 py-1 text-left transition-colors cursor-pointer",
										activeIndex === i
											? "bg-muted/60"
											: "hover:bg-muted/50",
									)}
								>
									<Icon
										className={cn(
											"w-3 h-3 shrink-0",
											getFileIconColor(
												file.status,
											),
										)}
									/>
									{dir && (
										<span className="text-[9px] font-mono text-muted-foreground/50 truncate min-w-0">
											{dir}/
										</span>
									)}
									<span
										className={cn(
											"text-[11px] font-mono shrink-0",
											activeIndex ===
												i
												? "text-foreground"
												: "text-foreground/80",
										)}
									>
										{name}
									</span>
									<div className="flex items-center gap-1 shrink-0 ml-auto">
										{file.additions >
											0 && (
											<span className="text-[10px] font-mono text-success">
												+
												{
													file.additions
												}
											</span>
										)}
										{file.deletions >
											0 && (
											<span className="text-[10px] font-mono text-destructive">
												-
												{
													file.deletions
												}
											</span>
										)}
									</div>
								</button>
							);
						})}
					</div>
				</div>

				{/* Resize handle */}
				<ResizeHandle
					onResize={handleSidebarResize}
					onDragStart={() => setIsDragging(true)}
					onDragEnd={handleSidebarResizeEnd}
					onDoubleClick={resetSidebarWidth}
					className="hidden lg:block"
				/>

				{/* Main diff area */}
				<div className="flex-1 min-w-0 flex flex-col">
					{/* File header bar */}
					{currentFile && (
						<FileHeader
							file={currentFile}
							index={activeIndex}
							total={files.length}
							wordWrap={wordWrap}
							onToggleWrap={() => setWordWrap(!wordWrap)}
							onPrev={() =>
								setActiveIndex(
									Math.max(
										0,
										activeIndex - 1,
									),
								)
							}
							onNext={() =>
								setActiveIndex(
									Math.min(
										files.length - 1,
										activeIndex + 1,
									),
								)
							}
						/>
					)}

					{/* Diff content */}
					<div className="flex-1 overflow-auto">
						{currentFile ? (
							<DiffContent
								file={currentFile}
								wordWrap={wordWrap}
								fileHighlightData={
									highlightData[
										currentFile.filename
									]
								}
							/>
						) : (
							<div className="px-4 py-16 text-center">
								<File className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
								<p className="text-[11px] text-muted-foreground/50 font-mono">
									No files changed
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function FileHeader({
	file,
	index,
	total,
	wordWrap,
	onToggleWrap,
	onPrev,
	onNext,
}: {
	file: CommitFile;
	index: number;
	total: number;
	wordWrap: boolean;
	onToggleWrap: () => void;
	onPrev: () => void;
	onNext: () => void;
}) {
	const Icon = getFileIcon(file.status);

	return (
		<div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50">
			<Icon
				className={cn(
					"w-3.5 h-3.5 shrink-0",
					getFileIconColor(file.status),
				)}
			/>
			<span className="text-[12px] font-mono text-foreground truncate">
				{file.filename}
			</span>
			{file.previous_filename && (
				<span className="text-[10px] font-mono text-muted-foreground/50 truncate">
					(from {file.previous_filename})
				</span>
			)}

			<div className="flex items-center gap-1 ml-auto shrink-0">
				<span className="text-[10px] font-mono text-success">
					+{file.additions}
				</span>
				<span className="text-[10px] font-mono text-destructive">
					-{file.deletions}
				</span>

				<button
					onClick={onToggleWrap}
					title="Toggle word wrap"
					className={cn(
						"p-1 rounded transition-colors cursor-pointer",
						wordWrap
							? "text-foreground/60 bg-accent"
							: "text-muted-foreground hover:text-foreground/60",
					)}
				>
					<WrapText className="w-3.5 h-3.5" />
				</button>

				<div className="flex items-center gap-0.5 ml-1">
					<button
						onClick={onPrev}
						disabled={index === 0}
						className="p-0.5 rounded transition-colors cursor-pointer disabled:opacity-30 text-muted-foreground/50 hover:text-foreground/60"
					>
						<ChevronLeft className="w-3.5 h-3.5" />
					</button>
					<span className="text-[10px] font-mono text-muted-foreground/50 min-w-[2.5rem] text-center">
						{index + 1}/{total}
					</span>
					<button
						onClick={onNext}
						disabled={index === total - 1}
						className="p-0.5 rounded transition-colors cursor-pointer disabled:opacity-30 text-muted-foreground/50 hover:text-foreground/60"
					>
						<ChevronRight className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>
		</div>
	);
}

function DiffContent({
	file,
	wordWrap,
	fileHighlightData,
}: {
	file: CommitFile;
	wordWrap: boolean;
	fileHighlightData?: Record<string, SyntaxToken[]>;
}) {
	if (!file.patch) {
		return (
			<div className="px-4 py-16 text-center">
				<File className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
				<p className="text-[11px] text-muted-foreground/50 font-mono">
					{file.status === "renamed"
						? "File renamed without changes"
						: "Binary file or no diff available"}
				</p>
			</div>
		);
	}

	const lines = parseDiffPatch(file.patch);

	return (
		<table className="w-full border-collapse text-[12.5px]">
			<tbody>
				{lines.map((line, i) => {
					let syntaxTokens: SyntaxToken[] | undefined;
					if (fileHighlightData) {
						if (line.type === "remove") {
							syntaxTokens =
								fileHighlightData[
									`R-${line.oldLineNumber}`
								];
						} else if (line.type === "add") {
							syntaxTokens =
								fileHighlightData[
									`A-${line.newLineNumber}`
								];
						} else if (line.type === "context") {
							syntaxTokens =
								fileHighlightData[
									`C-${line.newLineNumber}`
								];
						}
					}

					return (
						<CommitDiffLineRow
							key={i}
							line={line}
							wordWrap={wordWrap}
							syntaxTokens={syntaxTokens}
						/>
					);
				})}
			</tbody>
		</table>
	);
}

function CommitDiffLineRow({
	line,
	wordWrap,
	syntaxTokens,
}: {
	line: DiffLine;
	wordWrap: boolean;
	syntaxTokens?: SyntaxToken[];
}) {
	if (line.type === "header") {
		const funcMatch = line.content.match(/@@ .+? @@\s*(.*)/);
		const funcName = funcMatch?.[1];
		return (
			<tr className="diff-hunk-header">
				<td className="w-[3px] p-0 sticky left-0 z-[1]" />
				<td className="w-10 py-1.5 pr-2 text-right text-[11px] font-mono text-info/40 select-none bg-info/[0.04] dark:bg-info/[0.06] border-r border-border/60 sticky left-[3px] z-[1]">
					...
				</td>
				<td className="w-10 py-1.5 pr-2 text-right text-[11px] font-mono text-info/40 select-none bg-info/[0.04] dark:bg-info/[0.06] border-r border-border/60"></td>
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
		);
	}

	const isAdd = line.type === "add";
	const isDel = line.type === "remove";

	return (
		<tr
			className={cn(
				"group/line hover:brightness-95 dark:hover:brightness-110 transition-[filter] duration-75",
				isAdd && "diff-add-row",
				isDel && "diff-del-row",
			)}
		>
			{/* Gutter bar */}
			<td
				className={cn(
					"w-[3px] p-0 sticky left-0 z-[1]",
					isAdd ? "bg-success" : isDel ? "bg-destructive" : "",
				)}
			/>

			{/* Old line number */}
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
				{isDel ? line.oldLineNumber : ""}
			</td>

			{/* New line number */}
			<td
				className={cn(
					"w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-border/40",
					isAdd
						? "bg-diff-add-gutter text-diff-add-gutter"
						: isDel
							? "bg-diff-del-gutter text-diff-del-gutter"
							: "text-muted-foreground/30",
				)}
			>
				{isAdd || line.type === "context" ? line.newLineNumber : ""}
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
									segments={line.segments}
									tokens={syntaxTokens}
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
												style={
													{
														"--shiki-light":
															t.lightColor,
														"--shiki-dark":
															t.darkColor,
													} as React.CSSProperties
												}
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

function SyntaxSegmentedContent({
	segments,
	tokens,
	type,
}: {
	segments: DiffSegment[];
	tokens: SyntaxToken[];
	type: "add" | "remove" | "context" | "header";
}) {
	const result: {
		text: string;
		highlight: boolean;
		lightColor: string;
		darkColor: string;
	}[] = [];

	let segIdx = 0;
	let segCharOffset = 0;
	let tokIdx = 0;
	let tokCharOffset = 0;

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
					style={
						{
							"--shiki-light": r.lightColor,
							"--shiki-dark": r.darkColor,
						} as React.CSSProperties
					}
				>
					{r.text}
				</span>
			))}
		</span>
	);
}
