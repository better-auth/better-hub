"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { starGist, unstarGist } from "@/app/(app)/repos/[owner]/gist/actions";
import { cn, formatNumber } from "@/lib/utils";

interface GistStarButtonProps {
	gistId: string;
	starred: boolean;
	starCount: number;
}

export function GistStarButton({ gistId, starred, starCount }: GistStarButtonProps) {
	const [isStarred, setIsStarred] = useState(starred);
	const [count, setCount] = useState(starCount);
	const [isPending, startTransition] = useTransition();

	const toggle = () => {
		const next = !isStarred;
		setIsStarred(next);
		setCount((c) => c + (next ? 1 : -1));
		startTransition(async () => {
			const res = next ? await starGist(gistId) : await unstarGist(gistId);
			if (res.error) {
				setIsStarred(!next);
				setCount((c) => c + (next ? -1 : 1));
			}
		});
	};

	return (
		<button
			onClick={toggle}
			disabled={isPending}
			className={cn(
				"flex items-center justify-center gap-1.5 text-[11px] font-mono py-1.5 px-3 border rounded-md transition-colors cursor-pointer",
				isStarred
					? "border-warning/30 text-warning hover:bg-warning/10"
					: "border-border text-muted-foreground hover:text-foreground hover:border-border",
				isPending && "opacity-60 pointer-events-none",
			)}
		>
			<Star className={cn("w-3 h-3", isStarred && "fill-current")} />
			{isStarred ? "Starred" : "Star"}
			<span
				className={cn(
					"text-[10px] ml-0.5",
					isStarred ? "text-warning/70" : "text-muted-foreground/60",
				)}
			>
				{formatNumber(count)}
			</span>
		</button>
	);
}
