"use client";

import { useRef, useState, useCallback, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
	Ghost,
	Search,
	ChevronUp,
	ChevronDown,
	X,
	Pencil,
	Copy,
	Check,
	WrapText,
} from "lucide-react";
import { formatBytes } from "@/lib/github-utils";
import { cn } from "@/lib/utils";
import type { SyntaxToken } from "@/lib/shiki";
import { useGlobalChat, type InlineContext } from "@/components/shared/global-chat-provider";
import { CommitDialog } from "@/components/shared/commit-dialog";
import { commitFileEdit } from "@/app/(app)/repos/[owner]/[repo]/blob/blob-actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface CodeViewerClientProps {
	html: string;
	content: string;
	filename: string;
	filePath?: string;
	language: string;
	lineCount: number;
	fileSize?: number;
	gutterW: number;
	className?: string;
	hideHeader?: boolean;
	canEdit?: boolean;
	sha?: string;
	owner?: string;
	repo?: string;
	branch?: string;
}

interface SearchMatch {
	lineIdx: number;
}

function clearTextHighlights(container: Element) {
	const marks = container.querySelectorAll("mark.search-text-match");
	marks.forEach((mark) => {
		const parent = mark.parentNode;
		if (parent) {
			parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
			parent.normalize();
		}
	});
}

function highlightTextInLine(lineEl: Element, query: string, caseSensitive: boolean) {
	const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

	const q = caseSensitive ? query : query.toLowerCase();

	for (const node of textNodes) {
		const text = node.textContent || "";
		const search = caseSensitive ? text : text.toLowerCase();
		let idx = search.indexOf(q);
		if (idx === -1) continue;

		const frag = document.createDocumentFragment();
		let last = 0;
		while (idx !== -1) {
			if (idx > last)
				frag.appendChild(document.createTextNode(text.slice(last, idx)));
			const mark = document.createElement("mark");
			mark.className = "search-text-match";
			mark.textContent = text.slice(idx, idx + q.length);
			frag.appendChild(mark);
			last = idx + q.length;
			idx = search.indexOf(q, last);
		}
		if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
		node.parentNode?.replaceChild(frag, node);
	}
}

function parseLineHash(hash: string): { start: number; end: number } | null {
	const match = hash.match(/^#L(\d+)(?:-L(\d+))?$/);
	if (!match) return null;
	const start = parseInt(match[1], 10);
	const end = match[2] ? parseInt(match[2], 10) : start;
	return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function CodeViewerClient({
	html,
	content,
	filename,
	filePath,
	language,
	lineCount,
	fileSize,
	gutterW,
	className,
	hideHeader,
	canEdit,
	sha: initialSha,
	owner,
	repo,
	branch,
}: CodeViewerClientProps) {
	const { addCodeContext } = useGlobalChat();
	const codeRef = useRef<HTMLDivElement>(null);
	const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
	const [selectedRange, setSelectedRange] = useState<{
		start: number;
		end: number;
		text: string;
	} | null>(null);
	const [highlightedLines, setHighlightedLines] = useState<{
		start: number;
		end: number;
	} | null>(null);
	const lastClickedLineRef = useRef<number | null>(null);

	// Search state
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [matchCase, setMatchCase] = useState(false);
	const [matches, setMatches] = useState<SearchMatch[]>([]);
	const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const isHoveringRef = useRef(false);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const toolbarAdjustedRef = useRef(false);
	const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [copied, setCopied] = useState(false);
	const [copiedAll, setCopiedAll] = useState(false);

	const codeRouter = useRouter();
	const { emit: emitMutation } = useMutationEvents();

	const [wordWrap, setWordWrap] = useState(false);

	// Edit mode state
	const [isEditing, setIsEditing] = useState(false);
	const [editContent, setEditContent] = useState(content);
	const [commitDialogOpen, setCommitDialogOpen] = useState(false);
	const [currentSha, setCurrentSha] = useState(initialSha);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const editPreRef = useRef<HTMLPreElement>(null);
	const [editTokens, setEditTokens] = useState<SyntaxToken[][] | null>(null);

	const displayName = filePath || filename;

	const clearToolbar = useCallback(() => {
		setSelectedRange(null);
		setCopied(false);
	}, []);

	// Assign IDs to each .line element on mount
	useEffect(() => {
		if (!codeRef.current) return;
		const lines = codeRef.current.querySelectorAll(".line");
		lines.forEach((el, i) => {
			el.id = `L${i + 1}`;
		});
	}, [html]);

	// Apply highlight classes when highlightedLines changes
	useEffect(() => {
		if (!codeRef.current) return;
		const lines = codeRef.current.querySelectorAll(".line");
		lines.forEach((el, i) => {
			const lineNum = i + 1;
			if (
				highlightedLines &&
				lineNum >= highlightedLines.start &&
				lineNum <= highlightedLines.end
			) {
				el.classList.add("line-highlighted");
			} else {
				el.classList.remove("line-highlighted");
			}
		});
	}, [highlightedLines, html]);

	// Read hash on mount and scroll to line
	useEffect(() => {
		const range = parseLineHash(window.location.hash);
		if (range) {
			setHighlightedLines(range);
			lastClickedLineRef.current = range.start;
			requestAnimationFrame(() => {
				const targetEl = document.getElementById(`L${range.start}`);
				if (targetEl) {
					targetEl.scrollIntoView({
						behavior: "smooth",
						block: "center",
					});
				}
			});
		}
	}, []);

	// Listen for hashchange
	useEffect(() => {
		const handler = () => {
			const range = parseLineHash(window.location.hash);
			setHighlightedLines(range);
			if (range) {
				lastClickedLineRef.current = range.start;
				const targetEl = document.getElementById(`L${range.start}`);
				if (targetEl) {
					targetEl.scrollIntoView({
						behavior: "smooth",
						block: "center",
					});
				}
			}
		};
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	}, []);

	// Gutter click handler for line number linking
	const handleClick = useCallback((e: React.MouseEvent) => {
		if (!codeRef.current) return;
		const lineEl = (e.target as HTMLElement).closest?.(".line") as HTMLElement | null;
		if (!lineEl) return;

		const lineRect = lineEl.getBoundingClientRect();
		const paddingLeft = parseFloat(getComputedStyle(lineEl).paddingLeft);
		if (e.clientX - lineRect.left > paddingLeft) return;

		e.preventDefault();

		const allLines = Array.from(codeRef.current.querySelectorAll(".line"));
		const lineIndex = allLines.indexOf(lineEl);
		if (lineIndex === -1) return;
		const lineNum = lineIndex + 1;

		if (e.shiftKey && lastClickedLineRef.current != null) {
			const start = Math.min(lastClickedLineRef.current, lineNum);
			const end = Math.max(lastClickedLineRef.current, lineNum);
			const hash = `#L${start}-L${end}`;
			window.history.replaceState(null, "", hash);
			setHighlightedLines({ start, end });
		} else {
			const hash = `#L${lineNum}`;
			window.history.replaceState(null, "", hash);
			setHighlightedLines({ start: lineNum, end: lineNum });
			lastClickedLineRef.current = lineNum;
		}

		window.getSelection()?.removeAllRanges();
	}, []);

	// Detect text selection on mouseup inside the code block
	const handleMouseUp = useCallback(
		(e: React.MouseEvent) => {
			// Ignore if mouseup is on the toolbar itself
			if (toolbarRef.current?.contains(e.target as Node)) return;

			const mouseX = e.clientX;
			const mouseY = e.clientY;

			// Use rAF so the browser has committed the selection before we read it
			requestAnimationFrame(() => {
				const sel = window.getSelection();
				if (!sel || sel.isCollapsed || !sel.toString().trim()) {
					clearToolbar();
					return;
				}

				if (
					!codeRef.current?.contains(sel.anchorNode) ||
					!codeRef.current?.contains(sel.focusNode)
				) {
					clearToolbar();
					return;
				}

				const selectedText = sel.toString();
				const allLines = Array.from(
					codeRef.current.querySelectorAll(".line"),
				);

				const anchorLine = sel.anchorNode
					? (sel.anchorNode.nodeType === Node.ELEMENT_NODE
							? (sel.anchorNode as Element)
							: sel.anchorNode.parentElement
						)?.closest(".line")
					: null;
				const focusLine = sel.focusNode
					? (sel.focusNode.nodeType === Node.ELEMENT_NODE
							? (sel.focusNode as Element)
							: sel.focusNode.parentElement
						)?.closest(".line")
					: null;

				if (!anchorLine || !focusLine) {
					clearToolbar();
					return;
				}

				const anchorIdx = allLines.indexOf(anchorLine);
				const focusIdx = allLines.indexOf(focusLine);
				if (anchorIdx === -1 || focusIdx === -1) {
					clearToolbar();
					return;
				}

				const startLine = Math.min(anchorIdx, focusIdx) + 1;
				const endLine = Math.max(anchorIdx, focusIdx) + 1;

				// Store viewport coordinates directly (toolbar uses position:fixed)
				toolbarAdjustedRef.current = false;
				setToolbarPos({ x: mouseX, y: mouseY + 12 });
				setSelectedRange({
					start: startLine,
					end: endLine,
					text: selectedText,
				});
			});
		},
		[clearToolbar],
	);

	// Clear toolbar when selection is lost (but not when interacting with toolbar)
	useEffect(() => {
		const handleSelectionChange = () => {
			if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
			selectionTimerRef.current = setTimeout(() => {
				// Don't clear while hovering toolbar
				if (toolbarRef.current?.matches(":hover")) return;
				const sel = window.getSelection();
				if (!sel || sel.isCollapsed || !sel.toString().trim()) {
					clearToolbar();
				}
			}, 50);
		};
		document.addEventListener("selectionchange", handleSelectionChange);
		return () => {
			document.removeEventListener("selectionchange", handleSelectionChange);
			if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
		};
	}, [clearToolbar]);

	// --- Search: find matches when query changes ---
	useEffect(() => {
		if (!searchOpen || !searchQuery) {
			setMatches([]);
			setCurrentMatchIdx(-1);
			return;
		}

		const lines = content.split("\n");
		const query = matchCase ? searchQuery : searchQuery.toLowerCase();
		const found: SearchMatch[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = matchCase ? lines[i] : lines[i].toLowerCase();
			let pos = 0;
			while (true) {
				const idx = line.indexOf(query, pos);
				if (idx === -1) break;
				found.push({ lineIdx: i });
				pos = idx + query.length;
			}
		}

		setMatches(found);
		setCurrentMatchIdx(found.length > 0 ? 0 : -1);
	}, [searchQuery, matchCase, searchOpen, content]);

	// --- Search: apply highlight classes + inline text marks ---
	useEffect(() => {
		if (!codeRef.current) return;
		const container = codeRef.current;
		const allLineEls = container.querySelectorAll(".code-content .line");

		// Clear previous
		clearTextHighlights(container);
		allLineEls.forEach((el) => {
			el.classList.remove("search-match", "search-match-active");
		});

		if (matches.length === 0 || currentMatchIdx < 0) return;

		const matchedLines = new Set(matches.map((m) => m.lineIdx));
		for (const lineIdx of matchedLines) {
			if (allLineEls[lineIdx]) {
				allLineEls[lineIdx].classList.add("search-match");
				highlightTextInLine(allLineEls[lineIdx], searchQuery, matchCase);
			}
		}

		const activeLineIdx = matches[currentMatchIdx]?.lineIdx;
		if (activeLineIdx !== undefined && allLineEls[activeLineIdx]) {
			allLineEls[activeLineIdx].classList.remove("search-match");
			allLineEls[activeLineIdx].classList.add("search-match-active");
			allLineEls[activeLineIdx].scrollIntoView({
				block: "center",
				behavior: "smooth",
			});
		}
	}, [matches, currentMatchIdx, searchQuery, matchCase]);

	// --- Search: intercept Cmd+F when hovering ---
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "f" && isHoveringRef.current) {
				e.preventDefault();
				e.stopPropagation();
				setSearchOpen(true);
				setTimeout(() => searchInputRef.current?.focus(), 0);
			}
		};
		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, []);

	const closeSearch = useCallback(() => {
		setSearchOpen(false);
		setSearchQuery("");
		setMatches([]);
		setCurrentMatchIdx(-1);
		if (codeRef.current) {
			clearTextHighlights(codeRef.current);
			codeRef.current.querySelectorAll(".code-content .line").forEach((el) => {
				el.classList.remove("search-match", "search-match-active");
			});
		}
	}, []);

	const goToNextMatch = useCallback(() => {
		if (matches.length === 0) return;
		setCurrentMatchIdx((prev) => (prev + 1) % matches.length);
	}, [matches.length]);

	const goToPrevMatch = useCallback(() => {
		if (matches.length === 0) return;
		setCurrentMatchIdx((prev) => (prev - 1 + matches.length) % matches.length);
	}, [matches.length]);

	const handleSearchKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				closeSearch();
			} else if (e.key === "Enter" && e.shiftKey) {
				e.preventDefault();
				goToPrevMatch();
			} else if (e.key === "Enter") {
				e.preventDefault();
				goToNextMatch();
			}
		},
		[closeSearch, goToNextMatch, goToPrevMatch],
	);

	// Escape: close search first, then clear toolbar/highlights
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (searchOpen) {
					closeSearch();
				} else {
					clearToolbar();
					setCopied(false);
					setHighlightedLines(null);
					if (window.location.hash.startsWith("#L")) {
						window.history.replaceState(
							null,
							"",
							window.location.pathname +
								window.location.search,
						);
					}
				}
			}
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [clearToolbar, closeSearch, searchOpen]);

	const handleCopySelection = useCallback((text: string) => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, []);

	const handleAddToGhost = useCallback(
		(startLine: number, endLine: number, selectedText: string) => {
			const ctx: InlineContext = {
				filename: displayName,
				startLine,
				endLine,
				selectedCode: selectedText,
				side: "RIGHT",
			};
			addCodeContext(ctx);
			clearToolbar();
			setCopied(false);
			window.getSelection()?.removeAllRanges();
		},
		[displayName, addCodeContext, clearToolbar],
	);

	// After toolbar renders, measure and clamp to viewport edges
	useEffect(() => {
		if (!selectedRange || !toolbarPos || !toolbarRef.current) {
			toolbarAdjustedRef.current = false;
			return;
		}
		if (toolbarAdjustedRef.current) return;
		toolbarAdjustedRef.current = true;

		const rect = toolbarRef.current.getBoundingClientRect();
		let { x, y } = toolbarPos;
		let adjusted = false;

		if (rect.right > window.innerWidth - 8) {
			x = window.innerWidth - rect.width - 8;
			adjusted = true;
		}
		if (x < 8) {
			x = 8;
			adjusted = true;
		}
		if (rect.bottom > window.innerHeight - 8) {
			y = toolbarPos.y - rect.height - 24;
			adjusted = true;
		}

		if (adjusted) setToolbarPos({ x, y });
	}, [selectedRange, toolbarPos]);

	// Cmd+S while editing opens the commit dialog
	useEffect(() => {
		if (!isEditing) return;
		const handleSaveShortcut = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault();
				if (editContent !== content) {
					setCommitDialogOpen(true);
				}
			}
		};
		document.addEventListener("keydown", handleSaveShortcut);
		return () => document.removeEventListener("keydown", handleSaveShortcut);
	}, [isEditing, editContent, content]);

	// Fetch initial tokens when entering edit mode
	const prevEditContentRef = useRef<string>("");
	useEffect(() => {
		if (!isEditing) {
			setEditTokens(null);
			prevEditContentRef.current = "";
			return;
		}
		// Fetch tokens for initial content
		const fetchTokens = async () => {
			try {
				const res = await fetch("/api/highlight-code", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ code: editContent, filename }),
				});
				if (res.ok) {
					const data = await res.json();
					setEditTokens(data.tokens);
					prevEditContentRef.current = editContent;
				}
			} catch {
				// keep null tokens
			}
		};
		if (!editTokens) fetchTokens();
	}, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

	// Debounced re-tokenization on edit
	useEffect(() => {
		if (!isEditing || !editContent) return;
		if (editContent === prevEditContentRef.current) return;
		prevEditContentRef.current = editContent;
		const timer = setTimeout(async () => {
			try {
				const res = await fetch("/api/highlight-code", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ code: editContent, filename }),
				});
				if (res.ok) {
					const data = await res.json();
					setEditTokens(data.tokens);
				}
			} catch {
				// keep stale tokens
			}
		}, 500);
		return () => clearTimeout(timer);
	}, [isEditing, editContent, filename]);

	// Sync scroll between textarea and pre overlay
	const handleEditScroll = useCallback(() => {
		if (textareaRef.current && editPreRef.current) {
			editPreRef.current.scrollTop = textareaRef.current.scrollTop;
			editPreRef.current.scrollLeft = textareaRef.current.scrollLeft;
		}
	}, []);

	// Tab key inserts spaces in edit mode
	const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Tab") {
			e.preventDefault();
			const ta = e.currentTarget;
			const start = ta.selectionStart;
			const end = ta.selectionEnd;
			const val = ta.value;
			if (e.shiftKey) {
				const lineStart = val.lastIndexOf("\n", start - 1) + 1;
				const selectedText = val.slice(lineStart, end);
				const dedented = selectedText.replace(/^  /gm, "");
				const diff = selectedText.length - dedented.length;
				const newVal = val.slice(0, lineStart) + dedented + val.slice(end);
				setEditContent(newVal);
				requestAnimationFrame(() => {
					ta.selectionStart = Math.max(
						lineStart,
						start - Math.min(2, diff),
					);
					ta.selectionEnd = end - diff;
				});
			} else if (start !== end) {
				const lineStart = val.lastIndexOf("\n", start - 1) + 1;
				const selectedText = val.slice(lineStart, end);
				const indented = selectedText.replace(/^/gm, "  ");
				const lineCount = selectedText.split("\n").length;
				const newVal = val.slice(0, lineStart) + indented + val.slice(end);
				setEditContent(newVal);
				requestAnimationFrame(() => {
					ta.selectionStart = start + 2;
					ta.selectionEnd = end + lineCount * 2;
				});
			} else {
				const newVal = val.slice(0, start) + "  " + val.slice(end);
				setEditContent(newVal);
				requestAnimationFrame(() => {
					ta.selectionStart = ta.selectionEnd = start + 2;
				});
			}
		}
	}, []);

	const handleCommit = useCallback(
		async (message: string) => {
			if (!owner || !repo || !branch || !currentSha || !filePath) return;
			const result = await commitFileEdit(
				owner,
				repo,
				filePath,
				branch,
				editContent,
				currentSha,
				message,
			);
			if (result.error) throw new Error(result.error);
			if (result.newSha) setCurrentSha(result.newSha);
			setIsEditing(false);
			if (owner && repo)
				emitMutation({ type: "repo:file-committed", owner, repo });
			codeRouter.refresh();
		},
		[owner, repo, branch, currentSha, filePath, editContent, codeRouter],
	);

	return (
		<div>
			{/* Code block wrapper */}
			<div
				className="relative"
				onMouseEnter={() => {
					isHoveringRef.current = true;
				}}
				onMouseLeave={() => {
					isHoveringRef.current = false;
				}}
			>
				{/* Sticky header — file info + search bar together */}
				<div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
					{!hideHeader && (
						<div className="flex items-center gap-3 px-1 py-1.5">
							{fileSize != null && (
								<span className="text-[11px] font-mono text-muted-foreground/60">
									{formatBytes(fileSize)}
								</span>
							)}
							<span className="text-[11px] font-mono text-muted-foreground/60">
								{lineCount} lines
							</span>
							<span className="text-[11px] font-mono text-muted-foreground/60">
								{language}
							</span>
							<div className="flex-1" />
							<div className="flex items-center gap-0.5">
								<button
									onClick={() =>
										setWordWrap(
											(w) => !w,
										)
									}
									className={cn(
										"flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono transition-colors cursor-pointer rounded-md",
										wordWrap
											? "text-foreground bg-muted/80"
											: "text-muted-foreground/50 hover:text-foreground hover:bg-muted/60",
									)}
									title="Toggle word wrap"
								>
									<WrapText className="w-3.5 h-3.5" />
								</button>
								{canEdit && !isEditing && (
									<button
										onClick={() => {
											setEditContent(
												content,
											);
											setIsEditing(
												true,
											);
										}}
										className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-muted/60"
										title="Edit file"
									>
										<Pencil className="w-3.5 h-3.5" />
									</button>
								)}
							</div>
							{isEditing && (
								<>
									<button
										onClick={() => {
											setIsEditing(
												false,
											);
											setEditContent(
												content,
											);
										}}
										className="px-2 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-muted/60"
									>
										Cancel
									</button>
									<button
										onClick={() =>
											setCommitDialogOpen(
												true,
											)
										}
										disabled={
											editContent ===
											content
										}
										className="px-2 py-1 text-[11px] font-mono bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-40 cursor-pointer"
									>
										Save
									</button>
								</>
							)}
						</div>
					)}

					{searchOpen && (
						<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-md border border-b-0 border-border shadow-sm bg-background/95">
							<Search className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
							<input
								ref={searchInputRef}
								type="text"
								value={searchQuery}
								onChange={(e) =>
									setSearchQuery(
										e.target.value,
									)
								}
								onKeyDown={handleSearchKeyDown}
								placeholder="Find in file..."
								className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
								autoFocus
							/>
							{searchQuery && (
								<span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0">
									{matches.length > 0
										? `${currentMatchIdx + 1} of ${matches.length}`
										: "No results"}
								</span>
							)}
							<div className="flex items-center gap-0.5 shrink-0">
								<button
									onClick={goToPrevMatch}
									disabled={
										matches.length === 0
									}
									className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
									title="Previous match (Shift+Enter)"
								>
									<ChevronUp className="w-3.5 h-3.5" />
								</button>
								<button
									onClick={goToNextMatch}
									disabled={
										matches.length === 0
									}
									className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
									title="Next match (Enter)"
								>
									<ChevronDown className="w-3.5 h-3.5" />
								</button>
								<button
									onClick={() =>
										setMatchCase(
											!matchCase,
										)
									}
									className={cn(
										"px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer",
										matchCase
											? "text-foreground bg-muted"
											: "text-muted-foreground/40 hover:text-foreground",
									)}
									title="Match case"
								>
									Aa
								</button>
								<button
									onClick={closeSearch}
									className="p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
									title="Close (Escape)"
								>
									<X className="w-3.5 h-3.5" />
								</button>
							</div>
						</div>
					)}
				</div>

				{isEditing ? (
					<div
						className={cn(
							"border border-border overflow-auto",
							searchOpen ? "rounded-b-md" : "rounded-md",
							className,
						)}
					>
						<div className="flex min-h-[400px]">
							{/* Line numbers gutter */}
							<div className="shrink-0 select-none text-right border-r border-border/50 py-3 sticky left-0 bg-code-bg z-[1]">
								{editContent
									.split("\n")
									.map((_, i) => (
										<div
											key={i}
											className="text-[13px] leading-relaxed font-mono text-muted-foreground/40 px-3"
											style={{
												height: "1lh",
											}}
										>
											{i + 1}
										</div>
									))}
							</div>
							{/* Code area: pre overlay + transparent textarea */}
							<div className="flex-1 relative">
								<pre
									ref={editPreRef}
									className="pointer-events-none font-mono text-[13px] leading-relaxed px-4 py-3 overflow-hidden m-0 diff-syntax whitespace-pre-wrap break-words"
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
															<Fragment
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
															</Fragment>
														);
													},
												)
										: editContent}
								</pre>
								<textarea
									ref={textareaRef}
									value={editContent}
									onChange={(e) =>
										setEditContent(
											e.target
												.value,
										)
									}
									onScroll={handleEditScroll}
									onKeyDown={
										handleEditKeyDown
									}
									className="absolute inset-0 w-full h-full bg-transparent font-mono text-[13px] leading-relaxed px-4 py-3 outline-none resize-none border-none m-0 whitespace-pre-wrap break-words"
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
					</div>
				) : (
					<div
						ref={codeRef}
						className={cn(
							"code-viewer border border-border relative group/code",
							wordWrap
								? "overflow-x-hidden word-wrap"
								: "overflow-x-auto",
							searchOpen ? "rounded-b-md" : "rounded-md",
							className,
						)}
						style={
							{
								"--cv-gutter-w": `${gutterW + 1}ch`,
							} as React.CSSProperties
						}
						onClick={handleClick}
						onMouseUp={handleMouseUp}
					>
						<div
							className="code-content"
							dangerouslySetInnerHTML={{ __html: html }}
						/>
						<button
							onClick={() => {
								navigator.clipboard.writeText(
									content,
								);
								setCopiedAll(true);
								setTimeout(
									() => setCopiedAll(false),
									1500,
								);
							}}
							className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-all opacity-0 group-hover/code:opacity-100 cursor-pointer z-20"
							title="Copy file contents"
						>
							{copiedAll ? (
								<Check className="w-3.5 h-3.5 text-green-500" />
							) : (
								<Copy className="w-3.5 h-3.5" />
							)}
						</button>
					</div>
				)}
			</div>

			{/* Commit dialog */}
			{commitDialogOpen && filePath && branch && (
				<CommitDialog
					open={commitDialogOpen}
					onOpenChange={setCommitDialogOpen}
					filename={filePath}
					branch={branch}
					originalContent={content}
					newContent={editContent}
					onCommit={handleCommit}
				/>
			)}
		</div>
	);
}
