"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { List, Search, X, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeadingNode {
	id: string;
	text: string;
	level: number;
	children: HeadingNode[];
}

interface DocumentOutlineProps {
	/** Ref to the container element that holds the rendered markdown (.ghmd) */
	contentRef: React.RefObject<HTMLDivElement | null>;
	/** Whether the outline should be visible (only in preview mode) */
	visible: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_KEY = "doc-outline-expanded";
const SCROLL_OFFSET = 80; // px offset from top when scrolling to heading

// ---------------------------------------------------------------------------
// Heading extraction
// ---------------------------------------------------------------------------

function extractHeadings(container: HTMLElement): HeadingNode[] {
	const elements = container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
	const flat: { id: string; text: string; level: number }[] = [];

	elements.forEach((el, index) => {
		const level = parseInt(el.tagName[1], 10);
		const text = el.textContent?.trim().replace(/\s+/g, " ") ?? "";
		let id = el.id;
		if (!id) {
			id = `heading-${index}`;
			el.id = id;
		}
		if (text) flat.push({ id, text, level });
	});

	return buildTree(flat);
}

function buildTree(flat: { id: string; text: string; level: number }[]): HeadingNode[] {
	const root: HeadingNode[] = [];
	const stack: { node: HeadingNode; level: number }[] = [];

	for (const item of flat) {
		const node: HeadingNode = {
			id: item.id,
			text: item.text,
			level: item.level,
			children: [],
		};

		while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
			stack.pop();
		}

		if (stack.length === 0) {
			root.push(node);
		} else {
			stack[stack.length - 1].node.children.push(node);
		}

		stack.push({ node, level: item.level });
	}

	return root;
}

// ---------------------------------------------------------------------------
// Flatten for rendering / filtering
// ---------------------------------------------------------------------------

function flattenTree(nodes: HeadingNode[]): HeadingNode[] {
	const result: HeadingNode[] = [];
	function walk(list: HeadingNode[]) {
		for (const n of list) {
			result.push(n);
			walk(n.children);
		}
	}
	walk(nodes);
	return result;
}

function filterTree(nodes: HeadingNode[], query: string): HeadingNode[] {
	const q = query.toLowerCase();

	function matches(node: HeadingNode): boolean {
		if (node.text.toLowerCase().includes(q)) return true;
		return node.children.some(matches);
	}

	function prune(list: HeadingNode[]): HeadingNode[] {
		const result: HeadingNode[] = [];
		for (const node of list) {
			if (matches(node)) {
				result.push({
					...node,
					children: prune(node.children),
				});
			}
		}
		return result;
	}

	return prune(nodes);
}

// ---------------------------------------------------------------------------
// Outline item
// ---------------------------------------------------------------------------

function FlatOutlineItem({
	node,
	activeId,
	onNavigate,
	isFocused,
	itemRef,
}: {
	node: HeadingNode;
	activeId: string | null;
	onNavigate: (id: string) => void;
	isFocused: boolean;
	itemRef: (el: HTMLButtonElement | null) => void;
}) {
	const isActive = activeId === node.id;

	return (
		<button
			ref={itemRef}
			type="button"
			role="treeitem"
			tabIndex={isFocused ? 0 : -1}
			aria-current={isActive ? "true" : undefined}
			onClick={() => onNavigate(node.id)}
			className={cn(
				"w-full text-left py-1 pr-2 text-[11px] leading-snug truncate transition-colors cursor-pointer rounded-sm",
				"hover:text-foreground hover:bg-muted/50",
				"focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
				isActive
					? "text-foreground font-medium bg-muted/40 border-l-[3px] border-foreground"
					: "text-muted-foreground/70 border-l-[3px] border-transparent",
			)}
			style={{
				paddingLeft: `${(node.level - 1) * 12 + 8}px`,
			}}
			title={node.text}
		>
			{node.text}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DocumentOutline({ contentRef, visible }: DocumentOutlineProps) {
	const [headings, setHeadings] = useState<HeadingNode[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isExpanded, setIsExpanded] = useState(() => {
		if (typeof window === "undefined") return true;
		const stored = sessionStorage.getItem(SESSION_KEY);
		return stored !== null ? stored === "true" : true;
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const [mobileOpen, setMobileOpen] = useState(false);

	const outlineRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

	// Persist expanded state
	useEffect(() => {
		if (typeof window !== "undefined") {
			sessionStorage.setItem(SESSION_KEY, String(isExpanded));
		}
	}, [isExpanded]);

	// Extract headings from rendered content
	useEffect(() => {
		if (!visible) return;
		const container = contentRef.current;
		if (!container) return;

		// Wait for next frame to ensure markdown is rendered
		const raf = requestAnimationFrame(() => {
			const ghmd = container.querySelector<HTMLElement>(".ghmd");
			if (ghmd) {
				setHeadings(extractHeadings(ghmd));
			}
		});

		return () => cancelAnimationFrame(raf);
	}, [contentRef, visible]);

	// Deep-link: scroll to hash on mount
	useEffect(() => {
		if (!visible || headings.length === 0) return;
		const hash = window.location.hash.slice(1);
		if (hash) {
			const el = document.getElementById(hash);
			if (el) {
				setTimeout(() => {
					el.scrollIntoView({ behavior: "smooth", block: "start" });
				}, 100);
				setActiveId(hash);
			}
		}
	}, [visible, headings]);

	// Scroll tracking with IntersectionObserver
	useEffect(() => {
		if (!visible || headings.length === 0) return;
		const container = contentRef.current;
		if (!container) return;

		const flat = flattenTree(headings);
		const ids = flat.map((h) => h.id);
		const elements = ids
			.map((id) => document.getElementById(id))
			.filter(Boolean) as HTMLElement[];

		if (elements.length === 0) return;

		// Find the scroll parent
		const scrollParent =
			container.closest<HTMLElement>("[class*='overflow-y-auto']") ?? window;

		if ("IntersectionObserver" in window) {
			const rootEl = scrollParent instanceof HTMLElement ? scrollParent : null;

			const observer = new IntersectionObserver(
				(entries) => {
					// Collect all headings and their positions
					const visible: { id: string; top: number }[] = [];
					for (const entry of entries) {
						if (
							entry.isIntersecting ||
							entry.boundingClientRect.top < 0
						) {
							visible.push({
								id: entry.target.id,
								top: entry.boundingClientRect.top,
							});
						}
					}

					// Find the heading nearest above the viewport midpoint
					const scrollTop = rootEl
						? rootEl.scrollTop
						: window.scrollY;
					let best: string | null = null;
					let bestDist = Infinity;

					for (const el of elements) {
						const elTop = rootEl
							? el.offsetTop - rootEl.offsetTop
							: el.offsetTop;
						const dist = scrollTop + SCROLL_OFFSET - elTop;
						if (dist >= 0 && dist < bestDist) {
							bestDist = dist;
							best = el.id;
						}
					}

					if (best) setActiveId(best);
				},
				{
					root: rootEl,
					rootMargin: `-${SCROLL_OFFSET}px 0px -60% 0px`,
					threshold: [0, 0.5, 1],
				},
			);

			for (const el of elements) observer.observe(el);

			// Also use a scroll listener for more accurate tracking
			let ticking = false;
			const handleScroll = () => {
				if (ticking) return;
				ticking = true;
				requestAnimationFrame(() => {
					const scrollTop = rootEl
						? rootEl.scrollTop
						: window.scrollY;
					let best: string | null = null;
					let bestDist = Infinity;

					for (const el of elements) {
						const elTop = rootEl
							? el.offsetTop - rootEl.offsetTop
							: el.offsetTop;
						const dist = scrollTop + SCROLL_OFFSET - elTop;
						if (dist >= 0 && dist < bestDist) {
							bestDist = dist;
							best = el.id;
						}
					}

					if (best) setActiveId(best);
					ticking = false;
				});
			};

			const scrollTarget = rootEl ?? window;
			scrollTarget.addEventListener("scroll", handleScroll, {
				passive: true,
			});

			return () => {
				observer.disconnect();
				scrollTarget.removeEventListener("scroll", handleScroll);
			};
		}

		// Fallback: debounced scroll listener
		let timer: ReturnType<typeof setTimeout>;
		const handleScroll = () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				const scrollTop =
					scrollParent instanceof HTMLElement
						? scrollParent.scrollTop
						: window.scrollY;
				let best: string | null = null;
				let bestDist = Infinity;

				for (const el of elements) {
					const rootEl =
						scrollParent instanceof HTMLElement
							? scrollParent
							: null;
					const elTop = rootEl
						? el.offsetTop - rootEl.offsetTop
						: el.offsetTop;
					const dist = scrollTop + SCROLL_OFFSET - elTop;
					if (dist >= 0 && dist < bestDist) {
						bestDist = dist;
						best = el.id;
					}
				}

				if (best) setActiveId(best);
			}, 200);
		};

		const target = scrollParent instanceof HTMLElement ? scrollParent : window;
		target.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			clearTimeout(timer);
			target.removeEventListener("scroll", handleScroll);
		};
	}, [visible, headings, contentRef]);

	// Auto-scroll outline to keep active item visible
	useEffect(() => {
		if (!activeId || !listRef.current) return;
		const activeEl =
			listRef.current.querySelector<HTMLElement>(`[aria-current="true"]`);
		if (activeEl) {
			activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}, [activeId]);

	// Filtered headings
	const displayTree = useMemo(
		() => (searchQuery ? filterTree(headings, searchQuery) : headings),
		[headings, searchQuery],
	);

	const flatList = useMemo(() => flattenTree(displayTree), [displayTree]);

	// Navigate to heading
	const navigateTo = useCallback((id: string) => {
		const el = document.getElementById(id);
		if (!el) return;

		setActiveId(id);
		setMobileOpen(false);

		// Update hash without full reload
		history.replaceState(null, "", `#${id}`);

		// Smooth scroll
		el.scrollIntoView({ behavior: "smooth", block: "start" });
	}, []);

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (flatList.length === 0) return;

			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					setFocusedIndex((prev) =>
						Math.min(prev + 1, flatList.length - 1),
					);
					break;
				}
				case "ArrowUp": {
					e.preventDefault();
					setFocusedIndex((prev) => Math.max(prev - 1, 0));
					break;
				}
				case "Enter":
				case " ": {
					e.preventDefault();
					if (focusedIndex >= 0 && focusedIndex < flatList.length) {
						navigateTo(flatList[focusedIndex].id);
					}
					break;
				}
				case "Escape": {
					e.preventDefault();
					if (searchQuery) {
						setSearchQuery("");
						searchInputRef.current?.focus();
					} else if (mobileOpen) {
						setMobileOpen(false);
					}
					break;
				}
				case "Home": {
					e.preventDefault();
					setFocusedIndex(0);
					break;
				}
				case "End": {
					e.preventDefault();
					setFocusedIndex(flatList.length - 1);
					break;
				}
			}
		},
		[flatList, focusedIndex, navigateTo, searchQuery, mobileOpen],
	);

	// Focus management for keyboard nav
	useEffect(() => {
		if (focusedIndex < 0 || focusedIndex >= flatList.length) return;
		const el = itemRefs.current.get(focusedIndex);
		if (el) el.focus({ preventScroll: true });
	}, [focusedIndex, flatList.length]);

	// Don't render if no headings
	if (!visible || headings.length === 0) return null;

	const outlineContent = (
		<div className="flex flex-col h-full min-h-0">
			{/* Search */}
			{isExpanded && (
				<div className="px-2 pb-2 shrink-0">
					<div className="relative">
						<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={(e) => {
								setSearchQuery(e.target.value);
								setFocusedIndex(-1);
							}}
							onKeyDown={(e) => {
								if (
									e.key === "Escape" &&
									searchQuery
								) {
									e.preventDefault();
									e.stopPropagation();
									setSearchQuery("");
								}
							}}
							placeholder="Filter..."
							className="w-full pl-6 pr-6 py-1 text-[11px] bg-muted/40 border border-border/50 rounded text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-border"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => {
									setSearchQuery("");
									searchInputRef.current?.focus();
								}}
								className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
							>
								<X className="w-3 h-3" />
							</button>
						)}
					</div>
				</div>
			)}

			{/* Tree */}
			<div
				ref={listRef}
				role="tree"
				aria-label="Document outline"
				className="flex-1 min-h-0 overflow-y-auto px-1"
				onKeyDown={handleKeyDown}
			>
				{flatList.length === 0 && searchQuery ? (
					<p className="px-2 py-3 text-[11px] text-muted-foreground/50 font-mono">
						No headings match &ldquo;{searchQuery}&rdquo;
					</p>
				) : (
					flatList.map((node, i) => (
						<FlatOutlineItem
							key={node.id}
							node={node}
							activeId={activeId}
							onNavigate={navigateTo}
							isFocused={focusedIndex === i}
							itemRef={(el) => {
								if (el) itemRefs.current.set(i, el);
								else itemRefs.current.delete(i);
							}}
						/>
					))
				)}
			</div>
		</div>
	);

	return (
		<>
			{/* Desktop: right-side pane */}
			<div className="hidden lg:block shrink-0">
				<nav
					ref={outlineRef}
					role="navigation"
					aria-label="Document outline"
					className={cn(
						"sticky top-0 h-[calc(100dvh-8rem)] flex flex-col transition-all duration-200",
						isExpanded ? "w-[260px]" : "w-10",
					)}
				>
					{/* Header */}
					<div
						className={cn(
							"flex items-center shrink-0 mb-1",
							isExpanded
								? "px-2 pt-2 pb-1 justify-between"
								: "justify-center pt-2",
						)}
					>
						{isExpanded && (
							<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">
								Outline
							</span>
						)}
						<button
							type="button"
							onClick={() => setIsExpanded((v) => !v)}
							className={cn(
								"p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer",
								!isExpanded && "mx-auto",
							)}
							title={
								isExpanded
									? "Collapse outline"
									: "Expand outline"
							}
						>
							{isExpanded ? (
								<ChevronRight className="w-3.5 h-3.5" />
							) : (
								<List className="w-3.5 h-3.5" />
							)}
						</button>
					</div>

					{/* Collapsed: icon rail with dots */}
					{!isExpanded && (
						<div className="flex flex-col items-center gap-[3px] mt-2 px-1">
							{flattenTree(headings)
								.slice(0, 40)
								.map((node) => (
									<button
										key={node.id}
										type="button"
										onClick={() => {
											navigateTo(
												node.id,
											);
										}}
										className={cn(
											"rounded-full transition-colors cursor-pointer",
											node.level <=
												2
												? "w-2.5 h-[3px]"
												: "w-1.5 h-[3px]",
											activeId ===
												node.id
												? "bg-foreground"
												: "bg-muted-foreground/20 hover:bg-muted-foreground/50",
										)}
										title={node.text}
									/>
								))}
						</div>
					)}

					{/* Expanded: full outline */}
					{isExpanded && outlineContent}
				</nav>
			</div>

			{/* Tablet: same as desktop but narrower */}
			{/* Handled by the responsive width classes above */}

			{/* Mobile: floating button + drawer */}
			<div className="lg:hidden">
				{/* Floating button */}
				{!mobileOpen && (
					<button
						type="button"
						onClick={() => setMobileOpen(true)}
						className="fixed bottom-4 right-4 z-40 p-2.5 rounded-full bg-background border border-border shadow-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
						title="Document outline"
					>
						<List className="w-4 h-4" />
					</button>
				)}

				{/* Drawer overlay */}
				{mobileOpen && (
					<div
						className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
						onClick={() => setMobileOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape")
								setMobileOpen(false);
						}}
					>
						<nav
							role="navigation"
							aria-label="Document outline"
							className="absolute right-0 top-0 bottom-0 w-[280px] bg-background border-l border-border shadow-xl flex flex-col"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 shrink-0">
								<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
									Outline
								</span>
								<button
									type="button"
									onClick={() =>
										setMobileOpen(false)
									}
									className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
								>
									<X className="w-4 h-4" />
								</button>
							</div>
							<div className="flex-1 min-h-0 pt-2">
								{outlineContent}
							</div>
						</nav>
					</div>
				)}
			</div>
		</>
	);
}
