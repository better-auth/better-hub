"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, ArrowRight, FilePlus2, FileX2, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseDiffPatch, type DiffLine } from "@/lib/github-utils";
import type { SyntaxToken } from "@/lib/shiki";

interface DiffFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

function FileStatusIcon({ status }: { status: string }) {
	switch (status) {
		case "added":
			return <FilePlus2 className="w-3.5 h-3.5 text-green-500" />;
		case "removed":
			return <FileX2 className="w-3.5 h-3.5 text-red-500" />;
		case "renamed":
			return <ArrowRight className="w-3.5 h-3.5 text-yellow-500" />;
		default:
			return <FileEdit className="w-3.5 h-3.5 text-blue-500" />;
	}
}

function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
	const total = additions + deletions;
	const maxBlocks = 5;
	const addBlocks = total > 0 ? Math.round((additions / total) * maxBlocks) : 0;
	const delBlocks = total > 0 ? maxBlocks - addBlocks : 0;

	return (
		<span className="flex items-center gap-1 text-[11px] font-mono shrink-0">
			{additions > 0 && (
				<span className="text-green-600 dark:text-green-400">
					+{additions}
				</span>
			)}
			{deletions > 0 && (
				<span className="text-red-600 dark:text-red-400">-{deletions}</span>
			)}
			<span className="flex gap-px ml-1">
				{Array.from({ length: addBlocks }).map((_, i) => (
					<span
						key={`a${i}`}
						className="w-1.5 h-1.5 rounded-[1px] bg-green-500"
					/>
				))}
				{Array.from({ length: delBlocks }).map((_, i) => (
					<span
						key={`d${i}`}
						className="w-1.5 h-1.5 rounded-[1px] bg-red-500"
					/>
				))}
			</span>
		</span>
	);
}

function FileDiffView({
	file,
	fileHighlightData,
}: {
	file: DiffFile;
	fileHighlightData?: Record<string, SyntaxToken[]>;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const lines = useMemo(() => (file.patch ? parseDiffPatch(file.patch) : []), [file.patch]);

	return (
		<div className="border border-border/50 dark:border-white/8 rounded-lg overflow-hidden">
			<button
				type="button"
				onClick={() => setCollapsed((v) => !v)}
				className="flex items-center gap-2 w-full px-3 py-2 text-left bg-muted/30 dark:bg-white/[0.02] hover:bg-muted/50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer border-b border-border/30 dark:border-white/5"
			>
				{collapsed ? (
					<ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
				) : (
					<ChevronUp className="w-3 h-3 text-muted-foreground/40 shrink-0" />
				)}
				<FileStatusIcon status={file.status} />
				<span className="text-[12px] font-mono truncate flex-1">
					{file.previous_filename ? (
						<>
							<span className="text-muted-foreground/50">
								{file.previous_filename}
							</span>
							<ArrowRight className="w-3 h-3 inline mx-1 text-muted-foreground/30" />
							{file.filename}
						</>
					) : (
						file.filename
					)}
				</span>
				<DiffStats additions={file.additions} deletions={file.deletions} />
			</button>

			{!collapsed && (
				<div className="overflow-x-auto">
					{lines.length > 0 ? (
						<table className="w-full text-[12.5px] font-mono border-collapse leading-[20px]">
							<tbody>
								{lines.map((line, i) => {
									let tokens:
										| SyntaxToken[]
										| undefined;
									if (fileHighlightData) {
										if (
											line.type ===
												"remove" &&
											line.oldLineNumber !==
												undefined
										) {
											tokens =
												fileHighlightData[
													`R-${line.oldLineNumber}`
												];
										} else if (
											line.type ===
												"add" &&
											line.newLineNumber !==
												undefined
										) {
											tokens =
												fileHighlightData[
													`A-${line.newLineNumber}`
												];
										} else if (
											line.type ===
												"context" &&
											line.newLineNumber !==
												undefined
										) {
											tokens =
												fileHighlightData[
													`C-${line.newLineNumber}`
												];
										}
									}
									return (
										<DiffLineRow
											key={i}
											line={line}
											syntaxTokens={
												tokens
											}
										/>
									);
								})}
							</tbody>
						</table>
					) : (
						<div className="px-4 py-6 text-center text-[11px] text-muted-foreground/40">
							{file.status === "renamed"
								? "File renamed without changes"
								: "Binary file or no diff available"}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function DiffLineRow({ line, syntaxTokens }: { line: DiffLine; syntaxTokens?: SyntaxToken[] }) {
	const isHeader = line.type === "header";
	const isAdd = line.type === "add";
	const isDel = line.type === "remove";
	const lineNum = isAdd ? line.newLineNumber : line.oldLineNumber;

	if (isHeader) {
		return (
			<tr className="bg-blue-500/5 dark:bg-blue-500/8">
				<td className="w-[1px] px-2 py-0.5 text-right text-muted-foreground/20 select-none border-r border-border/20 dark:border-white/5">
					···
				</td>
				<td className="px-3 py-0.5 text-blue-600/60 dark:text-blue-400/50 whitespace-pre">
					{line.content}
				</td>
			</tr>
		);
	}

	return (
		<tr className={cn(isAdd && "bg-diff-add-bg", isDel && "bg-diff-del-bg")}>
			<td
				className={cn(
					"w-[1px] px-2 py-0 text-right select-none border-r border-border/20 dark:border-white/5",
					isDel
						? "text-destructive/50"
						: isAdd
							? "text-success/50"
							: "text-muted-foreground/20",
				)}
			>
				{lineNum ?? ""}
			</td>
			<td className="px-3 py-0 whitespace-pre">
				{syntaxTokens ? (
					<span className="diff-syntax">
						{syntaxTokens.map((t, ti) => (
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
			</td>
		</tr>
	);
}

export function PRDiffList({
	files,
	highlightData,
}: {
	files: DiffFile[];
	highlightData?: Record<string, Record<string, SyntaxToken[]>>;
}) {
	return (
		<div className="space-y-3">
			{files.map((file) => (
				<FileDiffView
					key={file.filename}
					file={file}
					fileHighlightData={highlightData?.[file.filename]}
				/>
			))}
		</div>
	);
}
