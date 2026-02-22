"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { GitCommit } from "lucide-react";
import { TimeAgo } from "@/components/ui/time-ago";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";
import { fetchLatestCommit } from "@/app/(app)/repos/[owner]/[repo]/commits/actions";

interface LatestCommit {
	sha: string;
	message: string;
	date: string;
	author: { login: string; avatarUrl: string } | null;
}

interface LatestCommitSectionProps {
	owner: string;
	repoName: string;
	initialCommit: LatestCommit | null;
}

const COMMIT_EVENTS = [
	"pr:merged",
	"pr:suggestion-committed",
	"pr:file-committed",
	"repo:file-committed",
] as const;

export function LatestCommitSection({ owner, repoName, initialCommit }: LatestCommitSectionProps) {
	const [commit, setCommit] = useState(initialCommit);
	const [, startTransition] = useTransition();

	// Fetch fresh latest commit on every mount (page load)
	useEffect(() => {
		startTransition(async () => {
			const latest = await fetchLatestCommit(owner, repoName);
			if (latest) setCommit(latest);
		});
	}, [owner, repoName]);

	useMutationSubscription([...COMMIT_EVENTS], (event: MutationEvent) => {
		if (!isRepoEvent(event, owner, repoName)) return;
		startTransition(async () => {
			const latest = await fetchLatestCommit(owner, repoName);
			if (latest) setCommit(latest);
		});
	});

	if (!commit) return null;

	return (
		<div className="flex flex-col gap-2">
			<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
				<GitCommit className="w-3 h-3" />
				Latest commit
			</span>
			<Link
				href={`/${owner}/${repoName}/commits/${commit.sha.slice(0, 7)}`}
				className="group flex items-start gap-2 p-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
			>
				{commit.author?.avatarUrl ? (
					<Image
						src={commit.author.avatarUrl}
						alt={commit.author.login}
						width={20}
						height={20}
						className="rounded-full shrink-0 mt-0.5"
					/>
				) : (
					<div className="w-5 h-5 rounded-full bg-muted shrink-0 mt-0.5" />
				)}
				<div className="min-w-0 flex-1">
					<p className="text-xs text-foreground/80 group-hover:text-foreground truncate transition-colors">
						{commit.message.split("\n")[0]}
					</p>
					<div className="flex items-center gap-1.5 mt-0.5">
						<span className="text-[10px] text-muted-foreground/60 font-mono">
							{commit.author?.login ?? "unknown"}
						</span>
						<span className="text-[10px] text-muted-foreground/40">
							<TimeAgo date={commit.date} />
						</span>
					</div>
				</div>
			</Link>
		</div>
	);
}
