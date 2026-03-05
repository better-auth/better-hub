"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { ArrowBigUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	toggleDiscussionUpvoteAction,
	getCurrentUser,
} from "@/app/(app)/repos/[owner]/[repo]/discussions/discussion-actions";

interface DiscussionUpvoteButtonProps {
	discussionId: string;
	upvoteCount: number;
	viewerHasUpvoted: boolean;
	className?: string;
}

export function DiscussionUpvoteButton({
	discussionId,
	upvoteCount,
	viewerHasUpvoted,
	className,
}: DiscussionUpvoteButtonProps) {
	const [optimisticUpvoteCount, setOptimisticUpvoteCount] = useState(upvoteCount);
	const [optimisticHasUpvoted, setOptimisticHasUpvoted] = useState(viewerHasUpvoted);
	const [currentUser, setCurrentUser] = useState<{ login: string } | null>(null);
	const [, startTransition] = useTransition();

	useEffect(() => {
		setOptimisticUpvoteCount(upvoteCount);
		setOptimisticHasUpvoted(viewerHasUpvoted);
	}, [upvoteCount, viewerHasUpvoted]);

	useEffect(() => {
		let cancelled = false;
		getCurrentUser().then((user) => {
			if (!cancelled) setCurrentUser(user);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleToggleUpvote = useCallback(async () => {
		if (!currentUser) return;

		const wasUpvoted = optimisticHasUpvoted;
		setOptimisticHasUpvoted(!wasUpvoted);
		setOptimisticUpvoteCount((prev) => prev + (wasUpvoted ? -1 : 1));

		startTransition(async () => {
			const result = await toggleDiscussionUpvoteAction(discussionId, wasUpvoted);
			if (!result.success) {
				setOptimisticHasUpvoted(wasUpvoted);
				setOptimisticUpvoteCount((prev) => prev + (wasUpvoted ? 1 : -1));
			} else if (result.upvoteCount !== undefined) {
				setOptimisticUpvoteCount(result.upvoteCount);
				setOptimisticHasUpvoted(result.viewerHasUpvoted ?? !wasUpvoted);
			}
		});
	}, [currentUser, optimisticHasUpvoted, discussionId]);

	const canInteract = !!currentUser;

	return (
		<button
			type="button"
			onClick={handleToggleUpvote}
			disabled={!canInteract}
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors",
				canInteract ? "cursor-pointer hover:bg-muted/60" : "cursor-default",
				optimisticHasUpvoted
					? "bg-primary/10 text-primary"
					: "text-muted-foreground/60 hover:text-muted-foreground",
				className,
			)}
			title={optimisticHasUpvoted ? "Remove upvote" : "Upvote this discussion"}
		>
			<ArrowBigUp
				className={cn(
					"w-4 h-4",
					optimisticHasUpvoted ? "fill-primary" : "",
				)}
			/>
			{optimisticUpvoteCount > 0 && <span>{optimisticUpvoteCount}</span>}
		</button>
	);
}
