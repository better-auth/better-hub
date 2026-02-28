"use client";

import { RepoBreadcrumb } from "@/components/repo/repo-breadcrumb";
import { useState, useCallback, useRef, useTransition, useEffect } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { setRepoSidebarState } from "./repo-sidebar-actions";

interface RepoLayoutWrapperProps {
	sidebar: React.ReactNode;
	children: React.ReactNode;
	owner: string;
	repo: string;
	ownerType: string;
	initialCollapsed?: boolean;
	initialWidth?: number;
}

const DEFAULT_WIDTH = 260;
const SNAP_THRESHOLD = 120;
const SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };

export function RepoLayoutWrapper({
	sidebar,
	children,
	owner,
	repo,
	initialCollapsed = false,
	initialWidth = DEFAULT_WIDTH,
	ownerType,
}: RepoLayoutWrapperProps) {
	const pathname = usePathname();
	const isPrPage = pathname.includes("/pulls/");
	const effectiveInitialCollapsed = isPrPage ? true : initialCollapsed;

	const [sidebarWidth, setSidebarWidth] = useState(
		effectiveInitialCollapsed ? 0 : initialWidth,
	);
	const lastOpenWidthRef = useRef(initialWidth);
	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
	const isDraggingRef = useRef(false);
	const [isDragging, setIsDragging] = useState(false);
	const [, startTransition] = useTransition();
	const collapsed = sidebarWidth === 0;
	const prevIsPrPageRef = useRef(isPrPage);

	useEffect(() => {
		const wasOnPrPage = prevIsPrPageRef.current;
		prevIsPrPageRef.current = isPrPage;

		if (isPrPage && !wasOnPrPage && sidebarWidth > 0) {
			lastOpenWidthRef.current = sidebarWidth;
			setSidebarWidth(0);
		}
	}, [isPrPage, sidebarWidth]);

	const persistState = useCallback((isCollapsed: boolean, width: number) => {
		startTransition(() => {
			setRepoSidebarState(isCollapsed, width);
		});
	}, []);

	const handleExpand = useCallback(() => {
		const width = lastOpenWidthRef.current || DEFAULT_WIDTH;
		setSidebarWidth(width);
		persistState(false, width);
	}, [persistState]);

	const handleCollapse = useCallback(() => {
		if (sidebarWidth > 0) lastOpenWidthRef.current = sidebarWidth;
		setSidebarWidth(0);
		persistState(true, lastOpenWidthRef.current);
	}, [sidebarWidth, persistState]);

	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragRef.current = {
				startX: e.clientX,
				startWidth: sidebarWidth || lastOpenWidthRef.current,
			};
			isDraggingRef.current = false;
			setIsDragging(true);
			const onMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				const delta = ev.clientX - dragRef.current.startX;
				if (!isDraggingRef.current && Math.abs(delta) > 3) {
					isDraggingRef.current = true;
				}
				if (!isDraggingRef.current) return;
				const raw = dragRef.current.startWidth + delta;
				if (raw < SNAP_THRESHOLD) {
					setSidebarWidth(0);
				} else {
					const clamped = Math.max(180, Math.min(DEFAULT_WIDTH, raw));
					setSidebarWidth(clamped);
					lastOpenWidthRef.current = clamped;
				}
			};
			const onUp = () => {
				const didDrag = isDraggingRef.current;
				const finalWidth = sidebarWidth;
				const finalCollapsed = finalWidth === 0;
				dragRef.current = null;
				isDraggingRef.current = false;
				setIsDragging(false);
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				if (!didDrag) {
					handleCollapse();
				} else {
					persistState(
						finalCollapsed,
						finalCollapsed
							? lastOpenWidthRef.current
							: finalWidth,
					);
				}
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
		},
		[sidebarWidth, handleCollapse, persistState],
	);

	return (
		<div className="flex flex-col lg:flex-row flex-1 min-h-0">
			{/* Sidebar */}
			<motion.div
				className="hidden lg:flex shrink-0 overflow-hidden min-h-0"
				animate={{ width: sidebarWidth }}
				transition={isDragging ? { duration: 0 } : SPRING}
			>
				<AnimatePresence>
					{!collapsed && (
						<motion.div
							className="overflow-y-auto min-h-0"
							style={{
								width:
									lastOpenWidthRef.current ||
									DEFAULT_WIDTH,
								minWidth:
									lastOpenWidthRef.current ||
									DEFAULT_WIDTH,
							}}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.15 }}
						>
							{sidebar}
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>

			{/* Floating expand button (collapsed state) */}
			<AnimatePresence>
				{collapsed && !isDragging && (
					<motion.div
						className="hidden lg:block fixed left-0 top-0 bottom-0 w-8 z-50 group/expand"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2, delay: 0.1 }}
					>
						<button
							type="button"
							onClick={handleExpand}
							className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md border bg-background shadow-sm cursor-pointer opacity-0 group-hover/expand:opacity-100 text-muted-foreground/60 hover:!text-foreground hover:!bg-muted transition-all duration-200"
							title="Show sidebar"
						>
							<PanelLeft className="w-3.5 h-3.5" />
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Resize handle + collapse button (expanded state) */}
			<AnimatePresence>
				{!collapsed && (
					<motion.div
						className="hidden lg:flex shrink-0 flex-col items-center"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
					>
						<div
							onMouseDown={handleDragStart}
							className="flex-1 w-1 cursor-col-resize flex items-center justify-center hover:bg-foreground/10 active:bg-foreground/15 transition-colors group/resize"
						>
							<div className="w-[2px] h-8 rounded-full bg-border group-hover/resize:bg-foreground/20 group-active/resize:bg-foreground/30 transition-colors" />
						</div>
						<button
							type="button"
							onClick={handleCollapse}
							className="flex items-center justify-center w-5 h-5 shrink-0 mb-1 rounded text-muted-foreground/0 hover:text-muted-foreground hover:bg-muted/50 cursor-pointer transition-all duration-150"
							title="Hide sidebar"
						>
							<PanelLeft className="w-3.5 h-3.5" />
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Main content */}
			<div
				className="flex-1 min-w-0 flex flex-col min-h-0"
				style={
					{
						"--repo-pr": collapsed
							? "calc(var(--spacing) * 4)"
							: "1rem",
					} as React.CSSProperties
				}
			>
				<div
					className={`hidden lg:flex pl-7 pr-2 pt-3 pb-1 ${collapsed ? "visible" : "invisible"}`}
				>
					<RepoBreadcrumb
						owner={owner}
						repoName={repo}
						ownerType={ownerType}
					/>
				</div>
				{children}
			</div>
		</div>
	);
}
