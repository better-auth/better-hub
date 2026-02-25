"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Star } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { fetchUsedBy, type UsedByData } from "@/app/(app)/repos/[owner]/[repo]/readme-actions";

const INITIAL_COUNT = 5;

export function SidebarUsedBy({ owner, repo }: { owner: string; repo: string }) {
	const [showAll, setShowAll] = useState(false);
	const { data, isLoading } = useQuery<UsedByData | null>({
		queryKey: ["repo-used-by", owner, repo],
		queryFn: () => fetchUsedBy(owner, repo),
		staleTime: 30 * 60 * 1000,
		gcTime: 60 * 60 * 1000,
	});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
					<span className="flex items-center gap-1.5">
						<Package className="w-3 h-3" />
						Used by
					</span>
				</span>
				<div className="space-y-2 animate-pulse">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="flex items-center gap-2">
							<div className="w-4 h-4 rounded-full bg-muted/40" />
							<div className="h-3 w-24 bg-muted/40 rounded" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (!data || data.dependents.length === 0) return null;

	const { dependents, total_count } = data;
	const visible = showAll ? dependents : dependents.slice(0, INITIAL_COUNT);
	const hasMore = dependents.length > INITIAL_COUNT;

	return (
		<div className="flex flex-col gap-2">
			<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
				<span className="flex items-center gap-1.5">
					<Package className="w-3 h-3" />
					Used by
					<span className="text-muted-foreground/70">
						{total_count > 1000
							? `${formatNumber(total_count)}+`
							: formatNumber(total_count)}
					</span>
				</span>
			</span>
			<div className="flex flex-col gap-1.5">
				{visible.map((dep) => (
					<Link
						key={dep.full_name}
						href={`/${dep.owner}/${dep.name}`}
						className="flex items-center gap-2 group"
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={dep.avatar_url}
							alt={dep.owner}
							width={16}
							height={16}
							className="w-4 h-4 rounded-full bg-muted"
						/>
						<span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1 min-w-0">
							{dep.full_name}
						</span>
						{dep.stars > 0 && (
							<span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/50 shrink-0">
								<Star className="w-2.5 h-2.5" />
								{formatNumber(dep.stars)}
							</span>
						)}
					</Link>
				))}
			</div>
			{hasMore && (
				<button
					onClick={() => setShowAll(!showAll)}
					className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground/70 transition-colors cursor-pointer text-left"
				>
					{showAll
						? "Show less"
						: `View all ${dependents.length} repos`}
				</button>
			)}
		</div>
	);
}
