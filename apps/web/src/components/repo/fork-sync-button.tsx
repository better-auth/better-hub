"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2, Check } from "lucide-react";
import { syncFork } from "@/app/(app)/repos/actions";
import { cn } from "@/lib/utils";

interface ForkSyncButtonProps {
	owner: string;
	repo: string;
	defaultBranch: string;
	behind: number;
	parentFullName?: string;
}

export function ForkSyncButton({
	owner,
	repo,
	defaultBranch,
	behind,
	parentFullName,
}: ForkSyncButtonProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const handleSync = () => {
		if (isPending) return;
		setError(null);
		startTransition(async () => {
			const res = await syncFork(owner, repo, defaultBranch);
			if (!res.success) {
				setError(res.error ?? "Failed to sync");
				return;
			}
			router.refresh();
		});
	};

	if (behind === 0) {
		return (
			<span className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/60 py-1.5">
				<Check className="w-3 h-3 shrink-0" />
				<span className="truncate">
					This branch is up to date with{" "}
					{parentFullName ?? "upstream"}:{defaultBranch}
				</span>
			</span>
		);
	}

	return (
		<div className="flex flex-col items-start">
			<button
				onClick={handleSync}
				disabled={isPending}
				className={cn(
					"flex items-center gap-1.5 text-[11px] font-mono py-1.5 text-muted-foreground transition-colors",
					"hover:text-foreground",
					isPending && "pointer-events-none opacity-60",
				)}
			>
				{isPending ? (
					<Loader2 className="w-3 h-3 animate-spin shrink-0" />
				) : (
					<RefreshCw className="w-3 h-3 shrink-0" />
				)}
				<span className="truncate">
					{isPending
						? "Syncing..."
						: `Sync fork (${behind} commit${behind !== 1 ? "s" : ""} behind)`}
				</span>
			</button>
			{error && (
				<p className="text-[10px] text-destructive font-mono ml-4">
					{error}
				</p>
			)}
		</div>
	);
}
