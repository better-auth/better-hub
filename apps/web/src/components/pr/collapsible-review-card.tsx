"use client";

import { useState, useCallback, useEffect, useMemo, memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, FileCode2 } from "lucide-react";
import type { Highlighter, BundledLanguage } from "shiki";
import { cn } from "@/lib/utils";
import { getLanguageFromFilename } from "@/lib/github-utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";
import { UserTooltip } from "@/components/shared/user-tooltip";

const reviewStateBadge: Record<string, { label: string; className: string }> = {
	APPROVED: {
		label: "approved",
		className: "text-success border-success/20 bg-success/5",
	},
	CHANGES_REQUESTED: {
		label: "changes requested",
		className: "text-warning border-warning/20 bg-warning/5",
	},
	COMMENTED: {
		label: "reviewed",
		className: "text-info border-info/20 bg-info/5",
	},
	DISMISSED: {
		label: "dismissed",
		className: "text-muted-foreground border-muted-foreground/20 bg-muted-foreground/5",
	},
};

interface ReviewComment {
	id: number;
	body: string;
	path: string;
	line: number | null;
	diff_hunk: string | null;
	reactions?: Reactions;
}

interface CollapsibleReviewCardProps {
	user: { login: string; avatar_url: string } | null;
	state: string;
	timestamp: string;
	comments: ReviewComment[];
	bodyContent: React.ReactNode;
	owner: string;
	repo: string;
}

// ── Client-side Shiki singleton (shared with highlighted-code-block) ──

let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

function getClientHighlighter(): Promise<Highlighter> {
	if (highlighterInstance) return Promise.resolve(highlighterInstance);
	if (!highlighterPromise) {
		highlighterPromise = import("shiki")
			.then(({ createHighlighter }) =>
				createHighlighter({
					themes: ["vitesse-light", "vitesse-black"],
					langs: [],
				}),
			)
			.then((h) => {
				highlighterInstance = h;
				return h;
			});
	}
	return highlighterPromise;
}

interface SyntaxToken {
	text: string;
	lightColor: string;
	darkColor: string;
}

interface ParsedDiffLine {
	type: "add" | "remove" | "context" | "header";
	content: string; // line content without the prefix character
	raw: string;
}

function parseDiffHunkLines(diffHunk: string): ParsedDiffLine[] {
	const lines = diffHunk.split("\n");
	// Show at most the last 8 lines closest to the comment
	const displayLines = lines.length > 8 ? lines.slice(-8) : lines;
	return displayLines.map((raw) => {
		if (raw.startsWith("@@")) return { type: "header", content: raw, raw };
		if (raw.startsWith("+")) return { type: "add", content: raw.slice(1), raw };
		if (raw.startsWith("-")) return { type: "remove", content: raw.slice(1), raw };
		// Context lines start with a space
		return { type: "context", content: raw.startsWith(" ") ? raw.slice(1) : raw, raw };
	});
}

const DiffHunkSnippet = memo(function DiffHunkSnippet({
	diffHunk,
	filename,
}: {
	diffHunk: string;
	filename: string;
}) {
	const parsed = useMemo(() => parseDiffHunkLines(diffHunk), [diffHunk]);
	const [tokensByLine, setTokensByLine] = useState<(SyntaxToken[] | null)[]>(() =>
		parsed.map(() => null),
	);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const highlighter = await getClientHighlighter();
				const lang = getLanguageFromFilename(filename);
				const loaded = highlighter.getLoadedLanguages();
				let effectiveLang = lang;
				if (!loaded.includes(lang)) {
					try {
						await highlighter.loadLanguage(
							lang as BundledLanguage,
						);
					} catch {
						effectiveLang = "text";
						if (!loaded.includes("text")) {
							try {
								await highlighter.loadLanguage(
									"text" as BundledLanguage,
								);
							} catch {}
						}
					}
				}

				// Tokenize code lines (excluding headers) as a single block for
				// accurate cross-line token context
				const codeLines = parsed.filter((l) => l.type !== "header");
				if (codeLines.length === 0 || cancelled) return;

				const codeBlock = codeLines.map((l) => l.content).join("\n");
				const tokenResult = highlighter.codeToTokens(codeBlock, {
					lang: effectiveLang as BundledLanguage,
					themes: { light: "vitesse-light", dark: "vitesse-black" },
				});

				if (cancelled) return;

				// Map tokenized lines back to our parsed array
				const result: (SyntaxToken[] | null)[] = parsed.map(() => null);
				let codeIdx = 0;
				for (let i = 0; i < parsed.length; i++) {
					if (parsed[i].type === "header") continue;
					const lineTokens = tokenResult.tokens[codeIdx];
					if (lineTokens) {
						result[i] = lineTokens.map((t) => ({
							text: t.content,
							lightColor: t.htmlStyle?.color || "",
							darkColor:
								t.htmlStyle?.["--shiki-dark"] || "",
						}));
					}
					codeIdx++;
				}
				setTokensByLine(result);
			} catch {
				// silently fall back to plain text
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [diffHunk, filename, parsed]);

	return (
		<div className="rounded border border-border/40 overflow-hidden text-[10px] font-mono leading-relaxed mb-1.5">
			{parsed.map((line, i) => {
				const tokens = tokensByLine[i];
				return (
					<div
						key={i}
						className={cn(
							"px-2 py-px whitespace-pre overflow-x-auto flex",
							line.type === "header" &&
								"text-info/60 bg-info/5",
							line.type === "add" && "bg-success/5",
							line.type === "remove" &&
								"bg-destructive/5",
							line.type === "context" && "bg-transparent",
						)}
					>
						{line.type === "header" ? (
							<span>{line.raw}</span>
						) : (
							<>
								<span
									className={cn(
										"inline-block w-3 shrink-0 select-none text-center",
										line.type ===
											"add" &&
											"text-success/50",
										line.type ===
											"remove" &&
											"text-destructive/50",
										line.type ===
											"context" &&
											"text-transparent",
									)}
								>
									{line.type === "add"
										? "+"
										: line.type ===
											  "remove"
											? "-"
											: " "}
								</span>
								<span className="pl-0.5">
									{tokens ? (
										tokens.map(
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
										)
									) : (
										<span
											className={cn(
												line.type ===
													"add" &&
													"text-success/80",
												line.type ===
													"remove" &&
													"text-destructive/80",
												line.type ===
													"context" &&
													"text-muted-foreground/60",
											)}
										>
											{
												line.content
											}
										</span>
									)}
								</span>
							</>
						)}
					</div>
				);
			})}
		</div>
	);
});

export function CollapsibleReviewCard({
	user,
	state,
	timestamp,
	comments,
	bodyContent,
	owner,
	repo,
}: CollapsibleReviewCardProps) {
	const [expanded, setExpanded] = useState(true);
	const badge = reviewStateBadge[state] || reviewStateBadge.COMMENTED;
	const hasContent = bodyContent || comments.length > 0;

	const navigateToFile = useCallback((filename: string, line?: number | null) => {
		window.dispatchEvent(
			new CustomEvent("ghost:navigate-to-file", {
				detail: { filename, line: line ?? undefined },
			}),
		);
	}, []);

	return (
		<div className="group">
			<div className="border border-border/60 rounded-lg overflow-hidden">
				{/* Review header — clickable to collapse */}
				<button
					onClick={() => hasContent && setExpanded((e) => !e)}
					className={cn(
						"w-full flex items-center gap-2 px-3 py-1.5 bg-card/50 text-left",
						hasContent &&
							"cursor-pointer hover:bg-card/80 transition-colors",
					)}
				>
					{hasContent && (
						<ChevronDown
							className={cn(
								"w-3 h-3 text-muted-foreground transition-transform duration-200 shrink-0",
								!expanded && "-rotate-90",
							)}
						/>
					)}
					{user ? (
						<UserTooltip username={user.login}>
							<Link
								href={`/users/${user.login}`}
								onClick={(e) => e.stopPropagation()}
								className="flex items-center gap-2 text-xs font-medium text-foreground/80 hover:text-foreground transition-colors"
							>
								<Image
									src={user.avatar_url}
									alt={user.login}
									width={16}
									height={16}
									className="rounded-full shrink-0"
								/>
								<span className="hover:underline">
									{user.login}
								</span>
							</Link>
						</UserTooltip>
					) : (
						<>
							<div className="w-4 h-4 rounded-full bg-muted-foreground shrink-0" />
							<span className="text-xs font-medium text-foreground/80">
								ghost
							</span>
						</>
					)}
					<span
						className={cn(
							"text-[9px] px-1.5 py-px border rounded",
							badge.className,
						)}
					>
						{badge.label}
					</span>
					{!expanded && comments.length > 0 && (
						<span className="text-[10px] text-muted-foreground">
							{comments.length} comment
							{comments.length !== 1 ? "s" : ""}
						</span>
					)}
					<span className="text-[10px] text-muted-foreground ml-auto shrink-0">
						<TimeAgo date={timestamp} />
					</span>
				</button>

				{/* Collapsible body */}
				<div
					className={cn(
						"transition-all duration-200 ease-out overflow-hidden border-t border-border/60",
						expanded
							? "max-h-[2000px] opacity-100"
							: "max-h-0 opacity-0 border-t-transparent",
					)}
				>
					{/* Server-rendered markdown body */}
					{bodyContent}

					{/* Nested review comments */}
					{comments.length > 0 && (
						<div
							className={cn(
								bodyContent &&
									"border-t border-border/40",
							)}
						>
							{comments.map((comment) => (
								<div
									key={comment.id}
									className="px-3 py-2 border-b border-border/30 last:border-b-0"
								>
									<div className="flex items-center gap-1.5 mb-1">
										<button
											onClick={() =>
												navigateToFile(
													comment.path,
													comment.line,
												)
											}
											className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-info transition-colors truncate font-mono cursor-pointer"
											title={`Go to ${comment.path}${comment.line !== null ? `:${comment.line}` : ""} in diff`}
										>
											<FileCode2 className="w-3 h-3 shrink-0" />
											{
												comment.path
											}
											{comment.line !==
												null &&
												`:${comment.line}`}
										</button>
									</div>
									{comment.diff_hunk && (
										<DiffHunkSnippet
											diffHunk={
												comment.diff_hunk
											}
											filename={
												comment.path
											}
										/>
									)}
									<div className="text-xs text-foreground/70">
										<ClientMarkdown
											content={
												comment.body
											}
										/>
									</div>
									<div className="mt-1">
										<ReactionDisplay
											reactions={
												comment.reactions ??
												{}
											}
											owner={
												owner
											}
											repo={repo}
											contentType="pullRequestReviewComment"
											contentId={
												comment.id
											}
										/>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
