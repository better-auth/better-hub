"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Code2, MessageCircle, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResizeHandle } from "@/components/ui/resize-handle";
import {
	PROptimisticCommentsProvider,
	PROptimisticCommentsDisplay,
} from "./pr-optimistic-comments-provider";
import { useNavVisibility } from "@/components/shared/nav-visibility-provider";

type MobileTab = "diff" | "chat";
type PRTab = "code" | "comments" | "overview";

interface PRDetailLayoutProps {
	infoBar: React.ReactNode;
	diffPanel: React.ReactNode;
	conversationPanel: React.ReactNode;
	/** Sticky comment form pinned to the bottom of the conversation panel */
	commentForm?: React.ReactNode;
	/** Full-width conflict resolution panel — replaces split view when provided */
	conflictPanel?: React.ReactNode;
	/** Overview panel for AI analysis */
	overviewPanel?: React.ReactNode;
	commentCount: number;
	fileCount: number;
	hasReviews?: boolean;
}

export function PRDetailLayout({
	infoBar,
	diffPanel,
	conversationPanel,
	commentForm,
	conflictPanel,
	overviewPanel,
	commentCount,
	fileCount,
	hasReviews,
}: PRDetailLayoutProps) {
	const [mobileTab, setMobileTab] = useState<MobileTab>("diff");
	const [activeTab, setActiveTab] = useState<PRTab>("code");
	const [isDragging, setIsDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const tabContainerRef = useRef<HTMLDivElement>(null);
	const userAdjustedRef = useRef(false);
	const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });
	const [hasTabAnimated, setHasTabAnimated] = useState(false);

	const { setNavHidden } = useNavVisibility();
	const lastScrollYRef = useRef(0);

	const handleScrollForNav = useCallback(
		(e: React.UIEvent<HTMLDivElement>) => {
			const scrollY = e.currentTarget.scrollTop;
			const delta = scrollY - lastScrollYRef.current;

			if (delta > 10 && scrollY > 50) {
				setNavHidden(true);
			} else if (delta < -10) {
				setNavHidden(false);
			}

			lastScrollYRef.current = scrollY;
		},
		[setNavHidden],
	);

	const SK = "pr-split-adjusted";
	const [splitRatio, setSplitRatio] = useState(() => {
		// SSR-safe: always start at 65 (conversation visible)
		return 65;
	});

	// On mount, check if user already adjusted this session — if so, restore their preference
	useEffect(() => {
		const stored = sessionStorage.getItem(SK);
		if (stored !== null) {
			const v = Number(stored);
			if (Number.isFinite(v)) {
				setSplitRatio(v);
				userAdjustedRef.current = true;
			}
		}
	}, []);

	const codeCollapsed = splitRatio <= 3;
	const chatCollapsed = splitRatio >= 97;

	const persistSplit = useCallback((v: number) => {
		setSplitRatio(v);
		userAdjustedRef.current = true;
		try {
			sessionStorage.setItem(SK, String(v));
		} catch {}
	}, []);

	const handleResize = useCallback(
		(clientX: number) => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const x = clientX - rect.left;
			const pct = Math.round((x / rect.width) * 100);
			if (pct > 95) persistSplit(100);
			else if (pct < 5) persistSplit(0);
			else persistSplit(Math.max(25, Math.min(75, pct)));
		},
		[persistSplit],
	);

	const handleDoubleClick = useCallback(() => {
		persistSplit(65);
	}, [persistSplit]);

	const handleRestoreChat = () => persistSplit(65);
	const handleRestoreCode = () => persistSplit(65);

	// When navigating to a file from conversation, ensure the code panel is visible
	useEffect(() => {
		const handler = () => {
			if (codeCollapsed) persistSplit(65);
			if (window.innerWidth < 1024) setMobileTab("diff");
		};
		window.addEventListener("ghost:navigate-to-file", handler);
		return () => window.removeEventListener("ghost:navigate-to-file", handler);
	}, [codeCollapsed, persistSplit]);

	// Keyboard shortcuts: 1/[ = files, 2/] = chat
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Skip when user is typing in an input/textarea/contenteditable
			const tag = (e.target as HTMLElement)?.tagName;
			if (
				tag === "INPUT" ||
				tag === "TEXTAREA" ||
				(e.target as HTMLElement)?.isContentEditable
			)
				return;

			const isDesktop = window.innerWidth >= 1024;

			if (e.key === "1" || e.key === "[") {
				e.preventDefault();
				if (isDesktop) {
					if (codeCollapsed) persistSplit(65);
					else persistSplit(100);
				} else {
					setMobileTab("diff");
				}
			} else if (e.key === "2" || e.key === "]") {
				e.preventDefault();
				if (isDesktop) {
					if (chatCollapsed) persistSplit(65);
					else persistSplit(0);
				} else {
					setMobileTab("chat");
				}
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [codeCollapsed, chatCollapsed, persistSplit]);

	// Update tab indicator position
	const updateTabIndicator = useCallback(() => {
		if (!tabContainerRef.current) return;
		const activeEl = tabContainerRef.current.querySelector<HTMLElement>(
			"[data-tab-active='true']",
		);
		if (activeEl) {
			setTabIndicator({
				left: activeEl.offsetLeft,
				width: activeEl.offsetWidth,
			});
			if (!hasTabAnimated) setHasTabAnimated(true);
		}
	}, [hasTabAnimated]);

	useEffect(() => {
		updateTabIndicator();
	}, [activeTab, updateTabIndicator]);

	// Store the split ratio before switching to comments tab
	const prevSplitRatioRef = useRef(65);
	const prevTabRef = useRef<PRTab>(activeTab);

	// Track if we're coming from overview (to skip animation when going to comments)
	const skipAnimationRef = useRef(false);

	// Handle side effects when activeTab changes (including initial hydration from URL)
	useEffect(() => {
		const prevTab = prevTabRef.current;
		prevTabRef.current = activeTab;

		// Skip if same tab (e.g., initial render when already on correct tab)
		if (prevTab === activeTab) return;

		if (activeTab === "comments") {
			// Save current split ratio before going full-width comments
			const currentRatio = splitRatio;
			if (currentRatio > 10) {
				prevSplitRatioRef.current = currentRatio;
			}
			// When coming from overview, skip animation by setting ratio directly
			if (prevTab === "overview") {
				skipAnimationRef.current = true;
			}
			setSplitRatio(0);
			// Persist without triggering userAdjusted flag
			try {
				sessionStorage.setItem(SK, "0");
			} catch {}
		} else if (prevTab === "comments") {
			// Restore previous split ratio when leaving comments tab
			const restoreRatio =
				prevSplitRatioRef.current > 10 ? prevSplitRatioRef.current : 65;
			persistSplit(restoreRatio);
		}

		// Reset nav visibility when switching to code tab
		if (activeTab === "code") {
			setNavHidden(false);
			lastScrollYRef.current = 0;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTab, persistSplit, setNavHidden]);

	// Reset skip animation flag after render
	useEffect(() => {
		if (skipAnimationRef.current) {
			// Reset after a frame to allow the non-animated state to render
			requestAnimationFrame(() => {
				skipAnimationRef.current = false;
			});
		}
	});

	const handleTabChange = useCallback(
		(tab: PRTab) => {
			if (tab === activeTab) return;
			setActiveTab(tab);
		},
		[activeTab],
	);

	// Full-width conflict resolver mode
	if (conflictPanel) {
		return (
			<div className="flex-1 min-h-0 flex flex-col">
				<div className="shrink-0 px-4 pt-3">{infoBar}</div>
				<div className="flex-1 min-h-0 flex flex-col">{conflictPanel}</div>
			</div>
		);
	}

	return (
		<PROptimisticCommentsProvider serverCommentCount={commentCount}>
			<div className="flex-1 min-h-0 flex flex-col">
				{/* Compact PR info bar */}
				<div className="shrink-0 px-4 pt-3">{infoBar}</div>

				{/* Desktop PR tabs (Code / Comments / Overview) */}
				<div className="hidden lg:block shrink-0 px-4 pt-2">
					<div
						ref={tabContainerRef}
						className="relative flex items-center justify-end gap-1 -mt-9"
					>
						{(
							[
								{
									key: "code",
									label: "Code",
									icon: Code2,
									count: undefined,
								},
								{
									key: "comments",
									label: "Comments",
									icon: MessageCircle,
									count: commentCount,
								},
								{
									key: "overview",
									label: "AI Overview",
									icon: Sparkles,
									count: undefined,
								},
							] as const
						).map(({ key, label, icon: Icon, count }) => (
							<button
								key={key}
								data-tab-active={activeTab === key}
								onClick={() => handleTabChange(key)}
								className={cn(
									"relative flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap transition-colors cursor-pointer",
									activeTab === key
										? "text-foreground font-medium"
										: "text-muted-foreground/70 hover:text-muted-foreground",
								)}
							>
								<Icon className="w-3.5 h-3.5" />
								{label}
								{count !== undefined &&
									count > 0 && (
										<span
											className={cn(
												"text-[10px] font-mono px-1.5 py-0.5 rounded-full",
												activeTab ===
													key
													? "bg-muted text-foreground/70"
													: "bg-muted/50 text-muted-foreground/60",
											)}
										>
											{count}
										</span>
									)}
							</button>
						))}
						<div
							className={cn(
								"absolute bottom-0 h-0.5 bg-foreground/50",
								hasTabAnimated
									? "transition-all duration-200 ease-out"
									: "",
							)}
							style={{
								left: tabIndicator.left,
								width: tabIndicator.width,
							}}
						/>
					</div>
				</div>

				{/* Mobile tabs */}
				<div className="lg:hidden shrink-0 flex border-t">
					{(
						[
							{
								key: "diff",
								icon: Code2,
								label: "Files",
								count: fileCount,
							},
							{
								key: "chat",
								icon: MessageCircle,
								label: "Chat",
								count: commentCount,
							},
						] as const
					).map(({ key, icon: Icon, label, count }) => (
						<button
							key={key}
							onClick={() => setMobileTab(key)}
							className={cn(
								"flex-1 flex items-center justify-center gap-1.5 py-2 text-xs border-b-2 -mb-px transition-colors cursor-pointer",
								mobileTab === key
									? "border-foreground/50 text-foreground font-medium"
									: "border-transparent text-muted-foreground",
							)}
						>
							<Icon className="w-3.5 h-3.5" />
							{label}
							{count > 0 && (
								<span className="text-[10px] text-muted-foreground/60">
									{count}
								</span>
							)}
						</button>
					))}
				</div>

				{/* Desktop split panels */}
				<div
					ref={containerRef}
					className={cn(
						"flex-1 min-h-0 border-t",
						activeTab === "overview"
							? "hidden"
							: "hidden lg:flex animate-in fade-in duration-200",
					)}
				>
					{/* Left panel (files + reviews) */}
					<div
						className="min-h-0 flex border-r border-border/40"
						style={{
							width: `${splitRatio}%`,
							transition:
								isDragging ||
								skipAnimationRef.current
									? "none"
									: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
						}}
					>
						{!codeCollapsed && (
							<div className="flex-1 min-w-0 min-h-0 flex">
								{diffPanel}
							</div>
						)}
					</div>

					{/* Resize handle */}
					<div className="relative shrink-0 flex items-stretch">
						<ResizeHandle
							onResize={handleResize}
							onDragStart={() => setIsDragging(true)}
							onDragEnd={() => setIsDragging(false)}
							onDoubleClick={handleDoubleClick}
						/>

						{/* Show collapsed panel toggle */}
						{chatCollapsed && (
							<button
								onClick={handleRestoreChat}
								className={cn(
									"absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full",
									"border border-border shadow-sm",
									"bg-background",
									"text-muted-foreground/60 hover:text-muted-foreground hover:border-border",
									"cursor-pointer transition-all duration-150",
								)}
								title="Show conversation"
							>
								<MessageCircle className="w-3 h-3" />
								{commentCount > 0 && (
									<span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-foreground text-background text-[8px] font-medium px-0.5">
										{commentCount > 99
											? "99+"
											: commentCount}
									</span>
								)}
							</button>
						)}
						{codeCollapsed && (
							<button
								onClick={handleRestoreCode}
								className={cn(
									"absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-6 h-6 rounded-full",
									"border border-border shadow-sm",
									"bg-background",
									"text-muted-foreground/60 hover:text-muted-foreground hover:border-border",
									"cursor-pointer transition-all duration-150",
								)}
								title="Show code"
							>
								<Code2 className="w-3 h-3" />
							</button>
						)}
					</div>

					{/* Right panel (conversation) */}
					<div
						className="relative min-h-0 flex flex-col pt-2"
						style={{
							width: `${100 - splitRatio}%`,
							transition: isDragging
								? "none"
								: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
						}}
					>
						{!chatCollapsed && (
							<>
								{/* Hide collapse button when in Comments tab (full-width mode) */}
								{activeTab !== "comments" && (
									<div className="shrink-0 absolute flex items-center px-2 pt-2 left-0 top-1 z-10">
										<button
											onClick={() =>
												persistSplit(
													100,
												)
											}
											className="flex items-center justify-center w-6 h-6 rounded-full border border-border bg-background text-muted-foreground hover:text-muted-foreground hover:border-border/80 transition-all cursor-pointer"
											title="Hide conversation"
										>
											<ChevronRight className="w-3 h-3" />
										</button>
									</div>
								)}
								<div
									className="flex-1 overflow-y-auto overscroll-contain min-h-0 pb-12"
									onScroll={
										activeTab ===
										"comments"
											? handleScrollForNav
											: undefined
									}
									style={{
										maskImage: "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
										WebkitMaskImage:
											"linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
									}}
								>
									<div className="max-w-[1000px] mx-auto pr-4 pl-6">
										{conversationPanel}
										<PROptimisticCommentsDisplay />
									</div>
								</div>
								{commentForm && (
									<div className="shrink-0 max-w-[1000px] mx-auto w-full px-3 pb-6">
										{commentForm}
									</div>
								)}
							</>
						)}
					</div>
				</div>

				{/* Desktop Overview panel */}
				<div
					className={cn(
						"flex-1 min-h-0 border-t overflow-y-auto",
						activeTab === "overview"
							? "hidden lg:block animate-in fade-in duration-200"
							: "hidden",
					)}
					onScroll={handleScrollForNav}
				>
					{overviewPanel}
				</div>

				{/* Mobile panels */}
				<div className="flex-1 min-h-0 lg:hidden flex flex-col">
					<div
						className={cn(
							"flex-1 min-w-0 min-h-0",
							mobileTab === "diff" ? "flex" : "hidden",
						)}
					>
						{diffPanel}
					</div>
					<div
						className={cn(
							"flex-1 min-h-0 flex flex-col",
							mobileTab === "chat" ? "flex" : "hidden",
						)}
					>
						<div className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-3 pb-3">
							{conversationPanel}
							<PROptimisticCommentsDisplay />
						</div>
						{commentForm && (
							<div className="shrink-0 px-3 pb-3 pt-3">
								{commentForm}
							</div>
						)}
					</div>
				</div>
			</div>
		</PROptimisticCommentsProvider>
	);
}
