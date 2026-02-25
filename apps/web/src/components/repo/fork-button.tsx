"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2 } from "lucide-react";
import { forkRepo } from "@/app/(app)/repos/actions";
import { cn, formatNumber } from "@/lib/utils";

interface ForkButtonProps {
	owner: string;
	repo: string;
	forkCount: number;
	disabled?: boolean;
}

export function ForkButton({ owner, repo, forkCount, disabled = false }: ForkButtonProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const handleFork = () => {
		if (disabled || isPending) return;
		setError(null);
		startTransition(async () => {
			const res = await forkRepo(owner, repo);
			if (res.error) {
				setError(res.error);
				return;
			}
			if (res.full_name) {
				router.push(`/${res.full_name}`);
			}
		});
	};

	return (
		<div className="flex flex-col items-center">
			<button
				onClick={handleFork}
				disabled={isPending || disabled}
				className={cn(
					"flex items-center justify-center gap-1.5 text-[11px] font-mono py-1.5 text-muted-foreground transition-colors w-full",
					!(isPending || disabled) &&
						"cursor-pointer hover:text-foreground",
					(isPending || disabled) &&
						"text-muted-foreground/60 pointer-events-none cursor-not-allowed",
				)}
			>
				{isPending ? (
					<Loader2 className="w-3 h-3 animate-spin" />
				) : (
					<GitFork className="w-3 h-3" />
				)}
				{isPending ? "Forking..." : "Fork"}
				<span className="text-muted-foreground/50 tabular-nums">
					{formatNumber(forkCount)}
				</span>
			</button>
			{error && (
				<p className="text-[10px] text-destructive font-mono mt-0.5">
					{error}
				</p>
			)}
		</div>
	);
}
