"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRight, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeletedCommentsProvider, useDeletedComments } from "./deleted-comments-context";

interface BotActivityGroupProps {
	count: number;
	botNames: string[];
	avatars: string[];
	children: React.ReactNode;
}

export function BotActivityGroup({ count, botNames, avatars, children }: BotActivityGroupProps) {
	return (
		<DeletedCommentsProvider>
			<BotActivityGroupInner count={count} botNames={botNames} avatars={avatars}>
				{children}
			</BotActivityGroupInner>
		</DeletedCommentsProvider>
	);
}

function BotActivityGroupInner({ count, botNames, avatars, children }: BotActivityGroupProps) {
	const [expanded, setExpanded] = useState(false);
	const deletedContext = useDeletedComments();
	const displayCount = count - (deletedContext?.deletedCount ?? 0);

	if (displayCount <= 0) {
		return null;
	}

	const label =
		botNames.length === 1
			? botNames[0].replace("[bot]", "")
			: `${botNames.length} bots`;

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
						"w-3 h-3 text-muted-foreground/40 transition-transform duration-150 shrink-0",
						expanded && "rotate-90",
					)}
				/>
				<div className="flex items-center -space-x-1.5">
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
				<Bot className="w-3 h-3 text-muted-foreground/30 shrink-0" />
				<span className="text-[11px] text-muted-foreground/50">
					{label}
				</span>
				<span className="text-[10px] text-muted-foreground/30">
					{displayCount} {displayCount === 1 ? "comment" : "comments"}
				</span>
			</button>

			{expanded && <div className="p-2">{children}</div>}
		</div>
	);
}
