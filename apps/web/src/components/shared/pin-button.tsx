"use client";

import { useState } from "react";
import { Pin, PinOff } from "lucide-react";
import { pinToOverview, unpinFromOverview } from "@/app/(app)/repos/[owner]/[repo]/pin-actions";
import { cn } from "@/lib/utils";
import { useMutation } from "@/hooks/use-mutation";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import type { MutationEvent } from "@/lib/mutation-events";
import { isRepoEvent } from "@/lib/mutation-events";

interface PinButtonProps {
	owner: string;
	repo: string;
	url: string;
	title: string;
	itemType: string;
	isPinned: boolean;
}

export function PinButton({
	owner,
	repo,
	url,
	title,
	itemType,
	isPinned: initialPinned,
}: PinButtonProps) {
	const [pinned, setPinned] = useState(initialPinned);
	const { mutate, isPending } = useMutation();

	useMutationSubscription(["pin:added", "pin:removed"], (event: MutationEvent) => {
		if (!isRepoEvent(event, owner, repo)) return;
		if (event.type === "pin:added" && event.url === url) {
			setPinned(true);
		} else if (event.type === "pin:removed" && event.url === url) {
			setPinned(false);
		}
	});

	function handleClick(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		const wasPinned = pinned;
		setPinned(!wasPinned);

		mutate({
			action: async () => {
				const result = wasPinned
					? await unpinFromOverview(owner, repo, url)
					: await pinToOverview(owner, repo, url, title, itemType);
				if (result.error) throw new Error(result.error);
				return result;
			},
			event: wasPinned
				? { type: "pin:removed", owner, repo, url }
				: { type: "pin:added", owner, repo, url, title, itemType },
			onError: () => setPinned(wasPinned),
			refresh: false,
		});
	}

	return (
		<button
			onClick={handleClick}
			disabled={isPending}
			className={cn(
				"inline-flex items-center gap-1 text-[11px] transition-colors cursor-pointer shrink-0",
				pinned
					? "text-foreground/70 hover:text-foreground"
					: "text-muted-foreground/50 hover:text-foreground",
			)}
			title={pinned ? "Unpin from overview" : "Pin to overview"}
		>
			{pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
		</button>
	);
}
