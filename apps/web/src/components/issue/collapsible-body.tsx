"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const COLLAPSED_HEIGHT = 500; // px — generous since issue layout has conversation sidebar

export function CollapsibleBody({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [needsCollapse, setNeedsCollapse] = useState(false);
	const [expanded, setExpanded] = useState(true);

	useEffect(() => {
		if (ref.current && ref.current.scrollHeight > COLLAPSED_HEIGHT + 40) {
			setNeedsCollapse(true);
		}
	}, []);

	if (!needsCollapse) {
		return <div ref={ref}>{children}</div>;
	}

	return (
		<div className="relative">
			<div
				ref={ref}
				className={cn(
					"overflow-hidden transition-[max-height] duration-200",
				)}
				style={{
					maxHeight: expanded
						? ref.current?.scrollHeight
						: COLLAPSED_HEIGHT,
				}}
			>
				{children}
			</div>
			{!expanded && (
				<div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
			)}
			<button
				onClick={() => setExpanded((e) => !e)}
				className="relative z-10 w-full text-center py-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer border-t border-border/30"
			>
				{expanded ? "Show less" : "Show more"}
			</button>
		</div>
	);
}
