"use client";

import { useMemo } from "react";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import Link from "next/link";
import Image from "next/image";
import {
	GitPullRequest,
	GitMerge,
	MessageSquare,
	Clock,
	Search,
	ArrowUpDown,
	Eye,
	PenLine,
	UserCheck,
	AtSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { toInternalUrl } from "@/lib/github-utils";
import { CopyLinkButton } from "@/components/shared/copy-link-button";
import type { IssueItem } from "@/lib/github-types";

const prTabTypes = ["review", "created", "assigned", "mentioned"] as const;
type TabType = (typeof prTabTypes)[number];

const prSortTypes = ["updated", "newest", "oldest"] as const;
type SortType = (typeof prSortTypes)[number];

const sortLabels: Record<SortType, string> = {
	updated: "Updated",
	newest: "Newest",
	oldest: "Oldest",
};

const sortCycle: SortType[] = ["updated", "newest", "oldest"];

function extractRepoName(url: string) {
	const parts = url.split("/");
	return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function PRsContent({
	created,
	reviewRequested,
	assigned,
	mentioned,
	username,
}: {
	created: { items: IssueItem[]; total_count: number };
	reviewRequested: { items: IssueItem[]; total_count: number };
	assigned: { items: IssueItem[]; total_count: number };
	mentioned: { items: IssueItem[]; total_count: number };
	username: string;
}) {
	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringLiteral(prTabTypes).withDefault("review"),
	);
	const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
	const [sort, setSort] = useQueryState(
		"sort",
		parseAsStringLiteral(prSortTypes).withDefault("updated"),
	);

	const tabItems: { key: TabType; label: string; icon: React.ReactNode; count: number }[] = [
		{
			key: "review",
			label: "Review requested",
			icon: <Eye className="w-3 h-3" />,
			count: reviewRequested.total_count,
		},
		{
			key: "created",
			label: "Created",
			icon: <PenLine className="w-3 h-3" />,
			count: created.total_count,
		},
		{
			key: "assigned",
			label: "Assigned",
			icon: <UserCheck className="w-3 h-3" />,
			count: assigned.total_count,
		},
		{
			key: "mentioned",
			label: "Mentioned",
			icon: <AtSign className="w-3 h-3" />,
			count: mentioned.total_count,
		},
	];

	const rawItems = {
		review: reviewRequested.items,
		created: created.items,
		assigned: assigned.items,
		mentioned: mentioned.items,
	}[tab];

	const filtered = useMemo(() => {
		let list = rawItems;

		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(pr) =>
					pr.number.toString().includes(q) ||
					pr.title.toLowerCase().includes(q) ||
					pr.user?.login.toLowerCase().includes(q) ||
					extractRepoName(pr.repository_url)
						.toLowerCase()
						.includes(q),
			);
		}

		return [...list].sort((a, b) => {
			switch (sort) {
				case "newest":
					return (
						new Date(b.created_at).getTime() -
						new Date(a.created_at).getTime()
					);
				case "oldest":
					return (
						new Date(a.created_at).getTime() -
						new Date(b.created_at).getTime()
					);
				default: // updated
					return (
						new Date(b.updated_at).getTime() -
						new Date(a.updated_at).getTime()
					);
			}
		});
	}, [rawItems, search, sort]);

	return (
		<div>
			{/* Toolbar */}
			<div className="sticky top-0 z-10 bg-background pb-3 pt-4 before:content-[''] before:absolute before:left-0 before:right-0 before:bottom-full before:h-8 before:bg-background">
				{/* Row 1: Search + Sort */}
				<div className="flex items-center gap-2 mb-3">
					<div className="relative flex-1 max-w-sm">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
						<input
							type="text"
							placeholder="Search pull requests..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full h-8 bg-transparent border border-border rounded-lg pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/20 transition-colors"
						/>
					</div>

					<button
						onClick={() =>
							setSort(
								sortCycle[
									(sortCycle.indexOf(sort) +
										1) %
										sortCycle.length
								],
							)
						}
						className={cn(
							"flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
							sort !== "updated"
								? "border-foreground/20 bg-muted/50 dark:bg-white/4 text-foreground"
								: "border-border text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/3",
						)}
					>
						<ArrowUpDown className="w-3 h-3" />
						{sortLabels[sort]}
					</button>
				</div>

				{/* Row 2: Category tabs */}
				<div className="flex items-center border-b border-border/40">
					{tabItems.map((t) => (
						<button
							key={t.key}
							onClick={() => setTab(t.key)}
							className={cn(
								"relative flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[12px] transition-colors cursor-pointer",
								tab === t.key
									? "text-foreground"
									: "text-muted-foreground/50 hover:text-foreground/70",
							)}
						>
							{t.icon}
							<span className="hidden sm:inline">
								{t.label}
							</span>
							<span
								className={cn(
									"text-[10px] tabular-nums font-mono",
									tab === t.key
										? "text-foreground/50"
										: "text-muted-foreground/30",
								)}
							>
								{t.count}
							</span>
							{tab === t.key && (
								<span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
							)}
						</button>
					))}
				</div>
			</div>

			{/* PR List */}
			{filtered.length === 0 ? (
				<div className="py-16 text-center">
					<GitPullRequest className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
					<p className="text-xs text-muted-foreground/60 font-mono">
						{search
							? "No matching pull requests"
							: "No pull requests in this category"}
					</p>
				</div>
			) : (
				<div className="border border-border divide-y divide-border">
					{filtered.map((pr) => {
						const repo = extractRepoName(pr.repository_url);
						const isMerged = pr.pull_request?.merged_at;
						const isDraft = pr.draft;

						return (
							<Link
								key={pr.id}
								href={toInternalUrl(pr.html_url)}
								className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
							>
								{isMerged ? (
									<GitMerge className="w-4 h-4 shrink-0 text-alert-important" />
								) : (
									<GitPullRequest
										className={cn(
											"w-4 h-4 shrink-0",
											isDraft
												? "text-muted-foreground/50"
												: "text-success",
										)}
									/>
								)}
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-sm text-foreground truncate group-hover:text-foreground/90 transition-colors">
											{pr.title}
										</span>
										{isDraft && (
											<span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/70 shrink-0 rounded-sm">
												Draft
											</span>
										)}
										{pr.labels
											.filter(
												(
													l,
												) =>
													l.name,
											)
											.slice(0, 3)
											.map(
												(
													label,
												) => (
													<span
														key={
															label.name
														}
														className="text-[9px] font-mono px-1.5 py-0.5 border shrink-0 rounded-sm"
														style={{
															borderColor: `#${label.color || "888"}30`,
															color: `#${label.color || "888"}`,
														}}
													>
														{
															label.name
														}
													</span>
												),
											)}
									</div>
									<div className="flex items-center gap-3 mt-0.5">
										<span className="text-[11px] font-mono text-muted-foreground/50">
											{repo}#
											{pr.number}
										</span>
										{pr.user &&
											pr.user
												.login !==
												username && (
												<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
													<Image
														src={
															pr
																.user
																.avatar_url
														}
														alt={
															pr
																.user
																.login
														}
														width={
															14
														}
														height={
															14
														}
														className="rounded-full"
													/>
													<span className="font-mono text-[10px]">
														{
															pr
																.user
																.login
														}
													</span>
												</span>
											)}
										<span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
											<Clock className="w-3 h-3" />
											<TimeAgo
												date={
													pr.updated_at
												}
											/>
										</span>
										{pr.comments >
											0 && (
											<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
												<MessageSquare className="w-3 h-3" />
												{
													pr.comments
												}
											</span>
										)}
									</div>
								</div>
								<CopyLinkButton
									owner={repo.split("/")[0]}
									repo={repo.split("/")[1]}
									number={pr.number}
									type="pulls"
									iconOnly
								/>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
