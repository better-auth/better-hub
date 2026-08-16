"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface IssueDetailLayoutProps {
	header: React.ReactNode;
	timeline: React.ReactNode;
	commentForm?: React.ReactNode;
	sidebar?: React.ReactNode;
	contentGapClassName?: string;
	mainScrollClassName?: string;
	sidebarClassName?: string;
}

export function IssueDetailLayout({
	header,
	timeline,
	commentForm,
	sidebar,
	contentGapClassName = "gap-6",
	mainScrollClassName = "pr-4",
	sidebarClassName = "w-[240px] xl:w-[280px] 2xl:w-[320px] pl-6",
}: IssueDetailLayoutProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canScrollUp, setCanScrollUp] = useState(false);
	const [canScrollDown, setCanScrollDown] = useState(false);

	const updateScrollState = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setCanScrollUp(el.scrollTop > 0);
		setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		updateScrollState();
		el.addEventListener("scroll", updateScrollState);
		const resizeObserver = new ResizeObserver(updateScrollState);
		resizeObserver.observe(el);
		return () => {
			el.removeEventListener("scroll", updateScrollState);
			resizeObserver.disconnect();
		};
	}, [updateScrollState]);

	return (
		<div className="flex-1 min-h-0 flex flex-col">
			<div className="shrink-0 pt-3">{header}</div>

			<div className={cn("flex-1 min-h-0 flex", contentGapClassName)}>
				{/* Main thread */}
				<div className="relative flex-1 min-w-0">
					{/* Top shadow */}
					<div
						className={cn(
							"pointer-events-none absolute top-0 left-0 right-4 h-6 bg-gradient-to-b from-background to-transparent z-10 transition-opacity duration-200",
							canScrollUp ? "opacity-100" : "opacity-0",
						)}
					/>
					{/* Bottom shadow */}
					<div
						className={cn(
							"pointer-events-none absolute bottom-0 left-0 right-4 h-6 bg-gradient-to-t from-background to-transparent z-10 transition-opacity duration-200",
							canScrollDown ? "opacity-100" : "opacity-0",
						)}
					/>
					<div
						ref={scrollRef}
						className={cn(
							"h-full overflow-y-auto pb-8 pl-1",
							mainScrollClassName,
						)}
					>
						<div>
							{/* Mobile sidebar */}
							{sidebar && (
								<div className="lg:hidden space-y-5 mb-6 pb-4 border-b border-border/40">
									{sidebar}
								</div>
							)}

							<div className="space-y-3">{timeline}</div>

							{commentForm && (
								<div className="mt-6 pt-4">
									{commentForm}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Right sidebar */}
				{sidebar && (
					<div
						className={cn(
							"hidden lg:block shrink-0 border-l border-border/40 overflow-y-auto pb-8",
							sidebarClassName,
						)}
					>
						<div className="space-y-5 pt-1">{sidebar}</div>
					</div>
				)}
			</div>
		</div>
	);
}
