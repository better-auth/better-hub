"use client";

import { useState, useEffect } from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPinnedRepo, pinRepo, unpinRepo, type PinnedRepo } from "@/lib/pinned-repos";

interface PinButtonProps {
	owner: string;
	repo: string;
	language: string | null;
	stargazers_count: number;
	isPrivate: boolean;
	avatarUrl: string;
}

export function PinButton({
	owner,
	repo,
	language,
	stargazers_count,
	isPrivate,
	avatarUrl,
}: PinButtonProps) {
	const [isPinned, setIsPinned] = useState(false);

	const fullName = `${owner}/${repo}`;

	useEffect(() => {
		setIsPinned(isPinnedRepo(fullName));
	}, [fullName]);

	const toggle = () => {
		if (isPinned) {
			unpinRepo(fullName);
			setIsPinned(false);
		} else {
			pinRepo({
				id: Date.now(),
				full_name: fullName,
				name: repo,
				owner: { login: owner, avatar_url: avatarUrl },
				language,
				stargazers_count,
				private: isPrivate,
			});
			setIsPinned(true);
		}
	};

	return (
		<button
			onClick={toggle}
			className={cn(
				"flex items-center justify-center gap-1.5 text-[11px] font-mono py-1.5 rounded-md transition-colors cursor-pointer",
				isPinned
					? "border border-foreground/30 text-foreground hover:bg-foreground/10"
					: "text-muted-foreground hover:text-foreground hover:border-border",
			)}
		>
			<Pin className={cn("w-3 h-3", isPinned && "fill-current")} />
			{isPinned ? "Pinned" : "Pin"}
		</button>
	);
}
