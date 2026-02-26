"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRight, History } from "lucide-react";
import { cn } from "@/lib/utils";

interface OlderActivityGroupProps {
	count: number;
	participantAvatars: string[];
	children: React.ReactNode;
}

export function OlderActivityGroup({
	count,
	participantAvatars,
	children,
}: OlderActivityGroupProps) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="rounded-lg border border-dashed border-border/40">
			<button
				onClick={() => setExpanded((e) => !e)}
				className={cn(
					"w-full flex items-center gap-2 px-3 py-2 text-left transition-colors cursor-pointer",
					"hover:bg-muted/30",
					expanded && "border-b border-dashed border-border/40",
				)}
			>
				<ChevronRight
					className={cn(
						"w-3 h-3 text-muted-foreground transition-transform duration-150 shrink-0",
						expanded && "rotate-90",
					)}
				/>
				<History className="w-3 h-3 text-muted-foreground/30 shrink-0" />
				{participantAvatars.length > 0 && (
					<div className="flex items-center -space-x-1.5">
						{participantAvatars.slice(0, 4).map((url, i) => (
							<Image
								key={i}
								src={url}
								alt=""
								width={16}
								height={16}
								className="rounded-full shrink-0 ring-1 ring-background"
							/>
						))}
					</div>
				)}
				<span className="text-[11px] text-muted-foreground/50">
					{count} earlier {count === 1 ? "comment" : "comments"}
				</span>
			</button>

			{expanded && <div className="p-2 space-y-2">{children}</div>}
		</div>
	);
}
