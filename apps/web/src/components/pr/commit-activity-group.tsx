"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRight, GitCommitHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommitActivityGroupProps {
	count: number;
	avatars: string[];
	children: React.ReactNode;
}

export function CommitActivityGroup({ count, avatars, children }: CommitActivityGroupProps) {
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
				<GitCommitHorizontal className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
				<span className="text-[11px] text-muted-foreground/50">
					{count} {count === 1 ? "commit" : "commits"}
				</span>
				{avatars.length > 0 && (
					<div className="flex items-center -space-x-1.5 ml-auto">
						{avatars.slice(0, 3).map((url, i) => (
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
			</button>

			{expanded && <div className="p-2">{children}</div>}
		</div>
	);
}
