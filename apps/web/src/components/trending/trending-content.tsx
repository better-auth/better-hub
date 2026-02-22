"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, GitFork, Flame } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { getLanguageColor } from "@/lib/github-utils";
import type { TrendingRepoItem } from "@/lib/github-types";

type Period = "daily" | "weekly" | "monthly";

interface TrendingContentProps {
	weekly: TrendingRepoItem[];
	daily: TrendingRepoItem[];
	monthly: TrendingRepoItem[];
}

export function TrendingContent({ weekly, daily, monthly }: TrendingContentProps) {
	const [period, setPeriod] = useState<Period>("weekly");

	const repos = period === "daily" ? daily : period === "monthly" ? monthly : weekly;

	const periods: { key: Period; label: string }[] = [
		{ key: "daily", label: "Today" },
		{ key: "weekly", label: "This week" },
		{ key: "monthly", label: "This month" },
	];

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="flex items-center gap-3 mb-4 shrink-0">
				<Flame className="w-4 h-4 text-orange-500/70" />
				<h1 className="text-sm font-medium">Trending</h1>
				<div className="flex items-center gap-0.5 ml-auto">
					{periods.map((p) => (
						<button
							key={p.key}
							onClick={() => setPeriod(p.key)}
							className={cn(
								"px-3 py-1 text-[11px] font-mono transition-colors cursor-pointer rounded-sm",
								period === p.key
									? "bg-accent text-foreground"
									: "text-muted-foreground/50 hover:text-muted-foreground",
							)}
						>
							{p.label}
						</button>
					))}
				</div>
			</div>

			<div className="border border-border bg-card flex-1 min-h-0 overflow-y-auto">
				{repos.length > 0 ? (
					repos.map((repo, i) => (
						<Link
							key={repo.id}
							href={`/${repo.full_name}`}
							className="group flex gap-4 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/40 last:border-b-0"
						>
							<span className="text-[11px] font-mono text-muted-foreground/30 tabular-nums w-5 text-right shrink-0 pt-1">
								{i + 1}
							</span>
							<Image
								src={repo.owner?.avatar_url ?? ""}
								alt={repo.owner?.login ?? ""}
								width={32}
								height={32}
								className="rounded-sm shrink-0 w-8 h-8 object-cover mt-0.5"
							/>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-sm font-mono truncate group-hover:text-foreground transition-colors">
										<span className="text-muted-foreground/50">
											{
												repo
													.owner
													?.login
											}
										</span>
										<span className="text-muted-foreground/30 mx-0.5">
											/
										</span>
										<span className="font-medium">
											{repo.name}
										</span>
									</span>
								</div>
								{repo.description && (
									<p className="text-xs text-muted-foreground/60 truncate mt-0.5">
										{repo.description}
									</p>
								)}
								<div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground/60">
									{repo.language && (
										<span className="flex items-center gap-1 font-mono">
											<span
												className="w-2 h-2 rounded-full shrink-0"
												style={{
													backgroundColor:
														getLanguageColor(
															repo.language,
														),
												}}
											/>
											{
												repo.language
											}
										</span>
									)}
									<span className="flex items-center gap-0.5">
										<Star className="w-2.5 h-2.5" />
										{formatNumber(
											repo.stargazers_count,
										)}
									</span>
									{repo.forks_count > 0 && (
										<span className="flex items-center gap-0.5">
											<GitFork className="w-2.5 h-2.5" />
											{formatNumber(
												repo.forks_count,
											)}
										</span>
									)}
								</div>
							</div>
						</Link>
					))
				) : (
					<div className="py-16 text-center">
						<p className="text-xs text-muted-foreground/50 font-mono">
							No trending repos found
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
