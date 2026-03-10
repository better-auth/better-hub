"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiffLine } from "@/lib/github-utils";
import type { SyntaxToken } from "@/lib/shiki";
import {
	InlineCommentForm,
	SegmentedContent,
	SyntaxSegmentedContent,
	type AddContextCallback,
} from "./pr-diff-viewer";

interface DiffSnippetTableProps {
	lines: DiffLine[];
	filename: string;
	wordWrap?: boolean;
	fileHighlightData?: Record<string, SyntaxToken[]>;
	canComment?: boolean;
	owner?: string;
	repo?: string;
	pullNumber?: number;
	headSha?: string;
	headBranch?: string;
	onAddContext?: AddContextCallback;
	participants?: Array<{ login: string; avatar_url: string }>;
}

export function DiffSnippetTable({
	lines,
	filename,
	wordWrap = true,
	fileHighlightData,
	canComment: canCommentProp = false,
	owner,
	repo,
	pullNumber,
	headSha,
	headBranch,
	onAddContext,
	participants,
}: DiffSnippetTableProps) {
	const [commentRange, setCommentRange] = useState<{
		startLine: number;
		endLine: number;
		side: "LEFT" | "RIGHT";
	} | null>(null);
	const [selectingFrom, setSelectingFrom] = useState<{
		line: number;
		side: "LEFT" | "RIGHT";
	} | null>(null);
	const [hoverLine, setHoverLine] = useState<number | null>(null);
	const hoverLineRef = useRef<number | null>(null);
	const selectingFromRef = useRef<{
		line: number;
		side: "LEFT" | "RIGHT";
	} | null>(null);

	const canComment = canCommentProp && !!(owner && repo && pullNumber && headSha);

	const getSyntaxTokens = useCallback(
		(line: DiffLine) => {
			if (!fileHighlightData) return undefined;
			if (line.type === "remove")
				return fileHighlightData[`R-${line.oldLineNumber}`];
			if (line.type === "add")
				return fileHighlightData[`A-${line.newLineNumber}`];
			if (line.type === "context")
				return fileHighlightData[`C-${line.newLineNumber}`];
			return undefined;
		},
		[fileHighlightData],
	);

	const handleLineClick = useCallback(
		(lineNum: number, side: "LEFT" | "RIGHT", shiftKey: boolean) => {
			if (selectingFromRef.current) return;
			if (shiftKey && commentRange) {
				const allLines = [
					commentRange.startLine,
					commentRange.endLine,
					lineNum,
				];
				setCommentRange({
					startLine: Math.min(...allLines),
					endLine: Math.max(...allLines),
					side: commentRange.side,
				});
			} else {
				setCommentRange({ startLine: lineNum, endLine: lineNum, side });
			}
		},
		[commentRange],
	);

	const handleLineMouseDown = useCallback((lineNum: number, side: "LEFT" | "RIGHT") => {
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
	}, []);

	const handleLineHover = useCallback((lineNum: number) => {
		if (selectingFromRef.current) {
			hoverLineRef.current = lineNum;
			setHoverLine(lineNum);
		}
	}, []);

	const selectionRange = useMemo(
		() =>
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
					: null,
		[selectingFrom, hoverLine, commentRange],
	);

	const selectedLinesContent = useMemo(() => {
		if (!commentRange) return "";
		return lines
			.filter((l) => {
				if (l.type === "header") return false;
				if (commentRange.side === "LEFT") {
					if (l.type !== "remove") return false;
					const ln = l.oldLineNumber;
					return (
						ln !== undefined &&
						ln >= commentRange.startLine &&
						ln <= commentRange.endLine
					);
				}
				if (l.type === "remove") return false;
				const ln = l.newLineNumber;
				return (
					ln !== undefined &&
					ln >= commentRange.startLine &&
					ln <= commentRange.endLine
				);
			})
			.map((l) => l.content)
			.join("\n");
	}, [commentRange, lines]);

	const selectedCodeForAI = useMemo(() => {
		if (!commentRange) return "";
		const startLine = Math.min(commentRange.startLine, commentRange.endLine);
		const endLine = Math.max(commentRange.startLine, commentRange.endLine);
		const isLeft = commentRange.side === "LEFT";
		return lines
			.filter((l) => {
				if (l.type === "header") return false;
				if (isLeft) {
					if (l.type !== "remove") return false;
					const ln = l.oldLineNumber;
					return ln !== undefined && ln >= startLine && ln <= endLine;
				}
				if (l.type === "remove") return false;
				const ln = l.newLineNumber;
				return ln !== undefined && ln >= startLine && ln <= endLine;
			})
			.map((l) => {
				const prefix =
					l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
				return `${prefix} ${l.content}`;
			})
			.join("\n");
	}, [commentRange, lines]);

	const commentStartLine =
		commentRange && commentRange.startLine !== commentRange.endLine
			? commentRange.startLine
			: undefined;

	return (
		<div className="overflow-hidden rounded-b-md border pb-3 bg-[var(--code-bg)]">
			<table className="w-full border-collapse bg-[var(--code-bg)]">
				<tbody>
					{lines.map((line, i) => {
						if (line.type === "header") {
							return (
								<tr key={i}>
									<td
										colSpan={3}
										className="py-0.5 px-3  text-muted-foreground text-[11px] font-mono select-none"
									>
										{line.content}
									</td>
								</tr>
							);
						}

						const isAdd = line.type === "add";
						const isDel = line.type === "remove";
						const lineNum = isAdd
							? line.newLineNumber
							: line.oldLineNumber;
						const side: "LEFT" | "RIGHT" = isDel
							? "LEFT"
							: "RIGHT";
						const tokens = getSyntaxTokens(line);

						const isSelected =
							selectionRange !== null &&
							lineNum !== undefined &&
							lineNum >= selectionRange.start &&
							lineNum <= selectionRange.end &&
							side === selectionRange.side;

						const isCommentEnd =
							commentRange !== null &&
							lineNum !== undefined &&
							lineNum === commentRange.endLine &&
							side === commentRange.side;

						return (
							<React.Fragment key={i}>
								<tr
									data-line={lineNum}
									onMouseEnter={() =>
										lineNum !==
											undefined &&
										handleLineHover(
											lineNum,
										)
									}
									className={cn(
										"group/line hover:brightness-95 dark:hover:brightness-110 transition-[filter] duration-75",
										isAdd &&
											"diff-add-row",
										isDel &&
											"diff-del-row",
										isSelected &&
											"!bg-muted-foreground/[0.08]",
									)}
								>
									{/* Gutter bar */}
									<td
										className={cn(
											"w-[3px] p-0",
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
											"w-10 py-0 pr-2 text-right text-[11px] font-mono select-none border-r border-border/40 relative text-[var(--code-foreground)]",
											isSelected
												? "bg-muted-foreground/[0.06] text-muted-foreground"
												: isAdd
													? "bg-diff-add-gutter"
													: isDel
														? "bg-diff-del-gutter"
														: "",
										)}
									>
										{canComment &&
											lineNum !==
												undefined && (
												<button
													onMouseDown={(
														e,
													) => {
														e.preventDefault();
														handleLineMouseDown(
															lineNum,
															side,
														);
													}}
													onClick={(
														e,
													) =>
														handleLineClick(
															lineNum,
															side,
															e.shiftKey,
														)
													}
													className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center opacity-0 group-hover/line:opacity-100 transition-opacity text-primary/50 hover:text-primary/70 cursor-pointer"
													title="Add review comment (shift+click for range)"
												>
													<Plus className="w-3 h-3" />
												</button>
											)}
										<span className="opacity-40">
											{lineNum ??
												""}
										</span>
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
												{tokens ? (
													line.segments ? (
														<SyntaxSegmentedContent
															segments={
																line.segments
															}
															tokens={
																tokens
															}
															type={
																line.type
															}
														/>
													) : (
														<span className="diff-syntax">
															{tokens.map(
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
												) : line.segments ? (
													<SegmentedContent
														segments={
															line.segments
														}
														type={
															line.type
														}
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
														{
															line.content
														}
													</span>
												)}
											</span>
										</div>
									</td>
								</tr>
								{canComment && isCommentEnd && (
									<tr>
										<td
											colSpan={3}
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
													commentRange!
														.endLine
												}
												side={
													commentRange!
														.side
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
												onClose={() =>
													setCommentRange(
														null,
													)
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
		</div>
	);
}
