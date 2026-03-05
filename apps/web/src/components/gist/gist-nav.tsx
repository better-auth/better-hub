"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface GistNavProps {
	owner: string;
	gistId: string;
	fileCount: number;
	revisionCount: number;
	commentCount: number;
}

export function GistNav({ owner, gistId, fileCount, revisionCount, commentCount }: GistNavProps) {
	const pathname = usePathname();
	const base = `/${owner}/gist/${gistId}`;
	const containerRef = useRef<HTMLDivElement>(null);
	const [indicator, setIndicator] = useState({ left: 0, width: 0 });
	const [hasAnimated, setHasAnimated] = useState(false);

	const tabs = [
		{
			label: "Files",
			href: base,
			active: pathname === base,
			count: fileCount,
		},
		{
			label: "Revisions",
			href: `${base}/revisions`,
			active: pathname.startsWith(`${base}/revisions`),
			count: revisionCount,
		},
		{
			label: "Comments",
			href: `${base}/comments`,
			active: pathname.startsWith(`${base}/comments`),
			count: commentCount,
		},
	];

	const updateIndicator = useCallback(() => {
		if (!containerRef.current) return;
		const activeEl =
			containerRef.current.querySelector<HTMLElement>("[data-active='true']");
		if (activeEl) {
			setIndicator({
				left: activeEl.offsetLeft,
				width: activeEl.offsetWidth,
			});
			activeEl.scrollIntoView({
				block: "nearest",
				inline: "center",
				behavior: "smooth",
			});
			if (!hasAnimated) setHasAnimated(true);
		}
	}, [hasAnimated]);

	useEffect(() => {
		updateIndicator();
	}, [pathname, updateIndicator]);

	return (
		<div
			ref={containerRef}
			className="relative flex items-center gap-1 pt-2 pb-0 overflow-x-auto no-scrollbar"
		>
			{tabs.map((tab) => (
				<Link
					key={tab.label}
					href={tab.href}
					data-active={tab.active}
					className={cn(
						"relative flex items-center gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap shrink-0 transition-colors",
						tab.active
							? "text-foreground font-medium"
							: "text-muted-foreground/70 hover:text-muted-foreground",
					)}
				>
					{tab.label}
					{tab.count > 0 && (
						<span
							className={cn(
								"text-[10px] font-mono px-1.5 py-0.5 rounded-full",
								tab.active
									? "bg-muted text-foreground/70"
									: "bg-muted/50 text-muted-foreground/60",
							)}
						>
							{tab.count}
						</span>
					)}
				</Link>
			))}
			<div
				className={cn(
					"absolute bottom-0 h-0.5 bg-foreground/50",
					hasAnimated ? "transition-all duration-200 ease-out" : "",
				)}
				style={{ left: indicator.left, width: indicator.width }}
			/>
		</div>
	);
}
