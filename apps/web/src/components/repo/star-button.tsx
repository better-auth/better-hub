"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { starRepo, unstarRepo } from "@/app/(app)/repos/actions";
import { cn, formatNumber } from "@/lib/utils";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface StarButtonProps {
	owner: string;
	repo: string;
	starred: boolean;
	starCount: number;
}

export function StarButton({ owner, repo, starred, starCount }: StarButtonProps) {
	const [isStarred, setIsStarred] = useState(starred);
	const [count, setCount] = useState(starCount);
	const [isPending, startTransition] = useTransition();
	const { emit } = useMutationEvents();

	const toggle = () => {
		const next = !isStarred;
		setIsStarred(next);
		setCount((c) => c + (next ? 1 : -1));
		emit({ type: next ? "repo:starred" : "repo:unstarred", owner, repo });
		startTransition(async () => {
			const res = next
				? await starRepo(owner, repo)
				: await unstarRepo(owner, repo);
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
				"flex items-center justify-center gap-1.5 text-[11px] font-mono py-1.5 border rounded-md transition-colors cursor-pointer",
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
