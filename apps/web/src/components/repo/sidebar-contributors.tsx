"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { revalidateContributorAvatars } from "@/app/(app)/repos/[owner]/[repo]/readme-actions";
import type { ContributorAvatarsData } from "@/lib/repo-data-cache";

export function SidebarContributors({
	owner,
	repo,
	initialData,
}: {
	owner: string;
	repo: string;
	initialData: ContributorAvatarsData | null;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["repo-contributors", owner, repo],
		queryFn: () => revalidateContributorAvatars(owner, repo),
		initialData: initialData ?? undefined,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
					<span className="flex items-center gap-1.5">
						<Users className="w-3 h-3" />
						Contributors
					</span>
				</span>
				<div className="flex -space-x-2 animate-pulse">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={i}
							className="w-[26px] h-[26px] rounded-full bg-muted/40 border-2 border-background"
						/>
					))}
				</div>
			</div>
		);
	}

	if (!data || data.avatars.length === 0) return null;

	const { avatars, totalCount } = data;
	const shown = avatars.slice(0, 12);
	const remaining = totalCount > 12 ? totalCount - 12 : 0;

	return (
		<div className="flex flex-col gap-2">
			<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
				<span className="flex items-center gap-1.5">
					<Users className="w-3 h-3" />
					Contributors
					<span className="text-muted-foreground/70">
						{totalCount > avatars.length
							? `${totalCount}+`
							: totalCount}
					</span>
				</span>
			</span>
			<div className="flex items-center gap-2">
				<div className="flex -space-x-2">
					{shown.map((c, i) => (
						<a
							key={c.login}
							href={`/users/${c.login}`}
							title={c.login}
							className="relative hover:z-10 hover:-translate-y-0.5 transition-transform"
							style={{ zIndex: shown.length - i }}
						>
							<Image
								src={c.avatar_url}
								alt={c.login}
								width={26}
								height={26}
								className="rounded-full border-2 border-background ring-1 ring-border"
							/>
						</a>
					))}
				</div>
				{remaining > 0 && (
					<span className="text-[10px] font-mono text-muted-foreground/70">
						+{remaining}
					</span>
				)}
			</div>
		</div>
	);
}
