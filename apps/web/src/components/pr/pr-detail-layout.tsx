"use client";

import { useState, useRef, useCallback, useEffect, createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
import { Code2, MessageCircle, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResizeHandle } from "@/components/ui/resize-handle";
import {
	PROptimisticCommentsProvider,
	PROptimisticCommentsDisplay,
} from "./pr-optimistic-comments-provider";
import { useNavVisibility } from "@/components/shared/nav-visibility-provider";

const OverviewActiveContext = createContext(false);
export const useOverviewActive = () => useContext(OverviewActiveContext);

type MobileTab = "diff" | "chat";
type SidePanelTab = "conversation" | "overview";

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
}: PRDetailLayoutProps) {
	const searchParams = useSearchParams();

	const [mobileTab, setMobileTab] = useState<MobileTab>("diff");
	const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>(() => {
		const tabParam = searchParams.get("tab");
		if (tabParam === "overview") return "overview";
		return "conversation";
	});
	const [isDragging, setIsDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const sidePanelTabRef = useRef<HTMLDivElement>(null);
	const userAdjustedRef = useRef(false);
	const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0 });
	const [hasTabAnimated, setHasTabAnimated] = useState(false);
	const [isScrolled, setIsScrolled] = useState(false);
	const conversationScrollRef = useRef<HTMLDivElement>(null);
	const overviewWrapperRef = useRef<HTMLDivElement>(null);

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
		return 65;
	});

	useEffect(() => {
		const stored = sessionStorage.getItem(SK);
		if (stored !== null) {
			const v = Number(stored);
			if (Number.isFinite(v) && v >= 25 && v <= 100) {
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

	// When navigating to a file from overview, ensure the code panel is visible
	useEffect(() => {
		const handler = () => {
			if (codeCollapsed) persistSplit(65);
			if (window.innerWidth < 1024) setMobileTab("diff");
		};
		window.addEventListener("ghost:navigate-to-file", handler);
		return () => window.removeEventListener("ghost:navigate-to-file", handler);
	}, [codeCollapsed, persistSplit]);

	// Update side-panel tab indicator position
	const updateTabIndicator = useCallback(() => {
		if (!sidePanelTabRef.current) return;
		const activeEl = sidePanelTabRef.current.querySelector<HTMLElement>(
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
	}, [sidePanelTab, updateTabIndicator]);

	const handleSidePanelTabChange = useCallback(
		(tab: SidePanelTab) => {
			if (tab === sidePanelTab) return;
			setSidePanelTab(tab);
			setIsScrolled(false);

			const url = new URL(window.location.href);
			if (tab === "conversation") {
				url.searchParams.delete("tab");
			} else {
				url.searchParams.set("tab", tab);
			}
			window.history.replaceState(null, "", url.toString());
		},
		[sidePanelTab],
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

				{/* Desktop split panels — always visible */}
				<div
					ref={containerRef}
					className="flex-1 min-h-0 border-t hidden lg:flex"
				>
					{/* Left panel (files + reviews) */}
					<div
						className="min-h-0 min-w-0 flex overflow-hidden border-r border-border/40"
						style={{
							width: `${splitRatio}%`,
							transition: isDragging
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
								title="Show side panel"
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

					{/* Right panel — side panel with conversation/overview tabs */}
					<div
						className="relative min-h-0 flex flex-col"
						style={{
							width: `${100 - splitRatio}%`,
							transition: isDragging
								? "none"
								: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
						}}
					>
						{!chatCollapsed && (
							<>
								{/* Side-panel header with tabs + collapse button */}
								<div
									className="shrink-0 flex items-center gap-1 pl-3 pr-2 pt-2 relative z-[1]"
									style={{
										boxShadow: isScrolled
											? "0 1px 0 rgba(0,0,0,0.06), 0 3px 8px -2px rgba(0,0,0,0.1)"
											: "0 0 0 transparent",
										transition: "box-shadow 0.2s ease",
									}}
								>
									<div
										ref={
											sidePanelTabRef
										}
										className="relative flex items-center gap-0.5"
									>
										{[
											{
												key: "conversation" as const,
												label: "Conversation",
												icon: MessageCircle,
											},
											{
												key: "overview" as const,
												label: "AI Overview",
												icon: Sparkles,
											},
										].map(
											({
												key,
												label,
												icon: Icon,
											}) => (
												<button
													key={
														key
													}
													data-tab-active={
														sidePanelTab ===
														key
													}
													onClick={() =>
														handleSidePanelTabChange(
															key,
														)
													}
													className={cn(
														"relative flex items-center gap-1.5 px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors cursor-pointer rounded-md",
														sidePanelTab ===
															key
															? "text-foreground font-medium"
															: "text-muted-foreground/60 hover:text-muted-foreground",
													)}
												>
													<Icon className="w-3 h-3" />
													{
														label
													}
													{key ===
														"conversation" &&
														commentCount >
															0 && (
															<span
																className={cn(
																	"text-[10px] font-mono px-1 py-0.5 rounded-full",
																	sidePanelTab ===
																		key
																		? "bg-muted text-foreground/70"
																		: "bg-muted/50 text-muted-foreground/60",
																)}
															>
																{
																	commentCount
																}
															</span>
														)}
												</button>
											),
										)}
										<div
											className={cn(
												"absolute bottom-0 h-0.5 bg-foreground/50 rounded-full",
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
									<button
										onClick={() =>
											persistSplit(
												100,
											)
										}
										className="ml-auto flex items-center justify-center w-6 h-6 rounded-full border border-border bg-background text-muted-foreground hover:text-muted-foreground hover:border-border/80 transition-all cursor-pointer"
										title="Hide panel"
									>
										<ChevronRight className="w-3 h-3" />
									</button>
								</div>

								{/* Conversation content */}
								<div
									ref={conversationScrollRef}
									className={cn(
										"flex-1 overflow-y-auto overscroll-contain min-h-0 pb-12",
										sidePanelTab !==
											"conversation" &&
											"hidden",
									)}
									onScroll={(e) =>
										setIsScrolled(
											e
												.currentTarget
												.scrollTop >
												0,
										)
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

								{/* AI Overview content */}
								<div
									ref={overviewWrapperRef}
									className={cn(
										"flex-1 min-h-0 flex flex-col",
										sidePanelTab !==
											"overview" &&
											"hidden",
									)}
									onScrollCapture={(e) =>
										setIsScrolled(
											(
												e.target as HTMLElement
											)
												.scrollTop >
												0,
										)
									}
								>
									<OverviewActiveContext.Provider
										value={
											sidePanelTab ===
											"overview"
										}
									>
										{overviewPanel}
									</OverviewActiveContext.Provider>
								</div>

								{sidePanelTab === "conversation" &&
									commentForm && (
										<div className="shrink-0 max-w-[1000px] mx-auto w-full px-3 pb-6">
											{
												commentForm
											}
										</div>
									)}
							</>
						)}
					</div>
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
