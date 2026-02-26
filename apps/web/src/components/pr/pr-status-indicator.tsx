"use client";

import { useState, useEffect } from "react";
import { GitPullRequest, GitMerge, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";

type PRStatus = "open" | "merged" | "closed" | "draft";

interface PRStatusIndicatorProps {
	owner: string;
	repo: string;
	number: number;
	initialState: string;
	initialMerged: boolean;
	initialDraft: boolean;
}

export function PRStatusIndicator({
	owner,
	repo,
	number,
	initialState,
	initialMerged,
	initialDraft,
}: PRStatusIndicatorProps) {
	const [status, setStatus] = useState<PRStatus>(() => {
		if (initialMerged) return "merged";
		if (initialState === "closed") return "closed";
		if (initialDraft) return "draft";
		return "open";
	});

	// Reset status when props change (e.g., after router.refresh())
	useEffect(() => {
		if (initialMerged) setStatus("merged");
		else if (initialState === "closed") setStatus("closed");
		else if (initialDraft) setStatus("draft");
		else setStatus("open");
	}, [initialMerged, initialState, initialDraft]);

	useMutationSubscription(
		["pr:merged", "pr:closed", "pr:reopened"],
		(event: MutationEvent) => {
			if (!isRepoEvent(event, owner, repo)) return;
			if (event.number !== number) return;
			switch (event.type) {
				case "pr:merged":
					setStatus("merged");
					break;
				case "pr:closed":
					setStatus("closed");
					break;
				case "pr:reopened":
					setStatus("open");
					break;
			}
		},
	);

	const config = {
		merged: {
			dot: "bg-alert-important",
			text: "text-alert-important",
			icon: GitMerge,
			label: "Merged",
		},
		closed: {
			dot: "bg-destructive",
			text: "text-destructive",
			icon: XCircle,
			label: "Closed",
		},
		draft: {
			dot: "bg-muted-foreground",
			text: "text-muted-foreground",
			icon: GitPullRequest,
			label: "Draft",
		},
		open: {
			dot: "bg-success",
			text: "text-success",
			icon: GitPullRequest,
			label: "Open",
		},
	}[status];

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider",
				config.text,
			)}
		>
			<span
				className={cn(
					"w-1.5 h-1.5 rounded-full shrink-0",
					config.dot,
				)}
			/>
			{config.label}
		</span>
	);
}
