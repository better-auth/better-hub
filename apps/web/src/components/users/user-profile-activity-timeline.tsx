"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ActivityEvent } from "@/lib/github-types";
import { cn, formatNumber } from "@/lib/utils";
import {
	buildContributionMonthGroups,
	buildProfileRepoMonthMap,
	groupEventsByMonth,
	mergeMonthGroups,
	mergeProfileReposIntoMonths,
} from "@/components/users/activity-timeline/aggregators";
import { monthLabel } from "@/components/users/activity-timeline/helpers";
import type {
	ContributionData,
	ProfileRepoTimelineItem,
	EventActivityItem,
	PullRequestEntry,
	IssueEntry,
	CreatedRepoEntry,
	CommitActivityItem,
} from "@/components/users/activity-timeline/types";
import { TimeAgo } from "@/components/ui/time-ago";
import { ChevronDown, GitCommit, GitPullRequest, MessageCircle, Plus } from "lucide-react";
import { getLanguageColor } from "@/lib/github-utils";

function ActivityCard({
	icon,
	title,
	count,
	children,
	defaultExpanded = false,
}: {
	icon: React.ReactNode;
	title: string;
	count?: number;
	children: React.ReactNode;
	defaultExpanded?: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultExpanded);

	return (
		<div className="border border-border rounded-md overflow-hidden bg-card/50">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
			>
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-muted-foreground/70">{icon}</span>
					<span className="text-xs font-medium truncate">
						{title}
					</span>
					{typeof count === "number" && (
						<span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">
							{count}
						</span>
					)}
				</div>
				<ChevronDown
					className={cn(
						"w-3.5 h-3.5 text-muted-foreground/50 transition-transform shrink-0",
						expanded && "rotate-180",
					)}
				/>
			</button>
			{expanded && (
				<div className="border-t border-border bg-card/30">{children}</div>
			)}
		</div>
	);
}

function PullRequestRow({ entry }: { entry: PullRequestEntry }) {
	return (
		<Link
			href={entry.href}
			className="group flex items-start justify-between gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"w-1.5 h-1.5 rounded-full shrink-0",
							entry.status === "open"
								? "bg-success"
								: entry.status === "merged"
									? "bg-alert-important"
									: "bg-destructive",
						)}
					/>
					<span className="text-[11px] text-foreground truncate group-hover:underline">
						{entry.title || `PR #${entry.number}`}
					</span>
				</div>
				<div className="flex items-center gap-2 mt-0.5 ml-3.5">
					<span className="text-[10px] font-mono text-muted-foreground/60 truncate">
						{entry.repoName}
					</span>
					{entry.language && (
						<span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
							<span
								className="w-1.5 h-1.5 rounded-full"
								style={{
									backgroundColor:
										getLanguageColor(
											entry.language,
										),
								}}
							/>
							{entry.language}
						</span>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				{(typeof entry.additions === "number" ||
					typeof entry.deletions === "number") && (
					<span className="text-[10px] font-mono">
						<span className="text-success">
							+{entry.additions ?? 0}
						</span>
						<span className="text-muted-foreground/30 mx-0.5">
							/
						</span>
						<span className="text-destructive">
							-{entry.deletions ?? 0}
						</span>
					</span>
				)}
				<span className="text-[10px] font-mono text-muted-foreground/50">
					<TimeAgo date={entry.createdAt} />
				</span>
			</div>
		</Link>
	);
}

function IssueRow({ entry }: { entry: IssueEntry }) {
	return (
		<Link
			href={entry.href}
			className="group flex items-start justify-between gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"w-1.5 h-1.5 rounded-full shrink-0",
							entry.status === "open"
								? "bg-success"
								: "bg-destructive",
						)}
					/>
					<span className="text-[11px] text-foreground truncate group-hover:underline">
						{entry.title || `Issue #${entry.number}`}
					</span>
				</div>
				<span className="text-[10px] font-mono text-muted-foreground/60 truncate ml-3.5 block">
					{entry.repoName}
				</span>
			</div>
			<span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
				<TimeAgo date={entry.createdAt} />
			</span>
		</Link>
	);
}

function RepoRow({ entry }: { entry: CreatedRepoEntry }) {
	return (
		<Link
			href={entry.href}
			className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
		>
			<div className="flex items-center gap-2 min-w-0">
				<span className="text-[11px] text-foreground truncate group-hover:underline">
					{entry.repoName}
				</span>
				{entry.language && (
					<span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
						<span
							className="w-1.5 h-1.5 rounded-full"
							style={{
								backgroundColor: getLanguageColor(
									entry.language,
								),
							}}
						/>
						{entry.language}
					</span>
				)}
			</div>
			<span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
				<TimeAgo date={entry.createdAt} />
			</span>
		</Link>
	);
}

function CommitSummary({ item }: { item: CommitActivityItem }) {
	const topRepos = item.repositories.slice(0, 5);
	return (
		<div className="divide-y divide-border">
			{topRepos.map((repo) => (
				<Link
					key={repo.repoName}
					href={`/${repo.repoName}`}
					className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
				>
					<span className="text-[11px] text-foreground truncate group-hover:underline">
						{repo.repoName}
					</span>
					<span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0">
						{repo.count}{" "}
						{repo.count === 1 ? "commit" : "commits"}
					</span>
				</Link>
			))}
		</div>
	);
}

function ActivityItemCard({
	item,
	defaultExpanded,
}: {
	item: EventActivityItem;
	defaultExpanded: boolean;
}) {
	const [visibleCount, setVisibleCount] = useState(3);

	if (item.kind === "commits") {
		return (
			<ActivityCard
				icon={<GitCommit className="w-3.5 h-3.5" />}
				title="Commits"
				count={item.totalCommits}
				defaultExpanded={defaultExpanded}
			>
				<CommitSummary item={item} />
			</ActivityCard>
		);
	}

	if (item.kind === "pull_requests") {
		const hasMore = item.items.length > visibleCount;
		return (
			<ActivityCard
				icon={<GitPullRequest className="w-3.5 h-3.5" />}
				title="Pull Requests"
				count={item.items.length}
				defaultExpanded={defaultExpanded}
			>
				<div className="divide-y divide-border">
					{item.items.slice(0, visibleCount).map((entry) => (
						<PullRequestRow key={entry.id} entry={entry} />
					))}
				</div>
				{hasMore && (
					<button
						onClick={() => setVisibleCount((c) => c + 5)}
						className="w-full px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border"
					>
						Show more ({item.items.length - visibleCount}{" "}
						remaining)
					</button>
				)}
			</ActivityCard>
		);
	}

	if (item.kind === "issues") {
		const hasMore = item.items.length > visibleCount;
		return (
			<ActivityCard
				icon={<MessageCircle className="w-3.5 h-3.5" />}
				title="Issues"
				count={item.items.length}
				defaultExpanded={defaultExpanded}
			>
				<div className="divide-y divide-border">
					{item.items.slice(0, visibleCount).map((entry) => (
						<IssueRow key={entry.id} entry={entry} />
					))}
				</div>
				{hasMore && (
					<button
						onClick={() => setVisibleCount((c) => c + 5)}
						className="w-full px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t border-border"
					>
						Show more ({item.items.length - visibleCount}{" "}
						remaining)
					</button>
				)}
			</ActivityCard>
		);
	}

	if (item.kind === "repositories") {
		return (
			<ActivityCard
				icon={<Plus className="w-3.5 h-3.5" />}
				title="Repositories Created"
				count={item.items.length}
				defaultExpanded={defaultExpanded}
			>
				<div className="divide-y divide-border">
					{item.items.map((entry) => (
						<RepoRow key={entry.id} entry={entry} />
					))}
				</div>
			</ActivityCard>
		);
	}

	return null;
}

export function UserProfileActivityTimeline({
	events,
	contributions,
	profileRepos,
}: {
	events: ActivityEvent[];
	contributions: ContributionData | null;
	profileRepos?: ProfileRepoTimelineItem[];
}) {
	const sortedEvents = useMemo(
		() =>
			[...events].sort((a, b) => {
				const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
				const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
				return bTime - aTime;
			}),
		[events],
	);

	const eventMonthGroups = useMemo(() => groupEventsByMonth(sortedEvents), [sortedEvents]);
	const contributionMonthGroups = useMemo(
		() => buildContributionMonthGroups(contributions),
		[contributions],
	);
	const profileRepoMonthMap = useMemo(
		() => buildProfileRepoMonthMap(profileRepos),
		[profileRepos],
	);
	const monthGroups = useMemo(
		() => mergeMonthGroups(eventMonthGroups, contributionMonthGroups),
		[eventMonthGroups, contributionMonthGroups],
	);
	const monthGroupsWithRepos = useMemo(
		() => mergeProfileReposIntoMonths(monthGroups, profileRepoMonthMap),
		[monthGroups, profileRepoMonthMap],
	);

	const [visibleMonthCount, setVisibleMonthCount] = useState(3);

	const visibleMonths = monthGroupsWithRepos.slice(0, visibleMonthCount);
	const hasMore = monthGroupsWithRepos.length > visibleMonthCount;
	const remainingMonths = Math.max(0, monthGroupsWithRepos.length - visibleMonthCount);

	const currentMonthKey = useMemo(() => {
		const now = new Date();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		return `${now.getFullYear()}-${month}`;
	}, []);

	if (monthGroupsWithRepos.length === 0) {
		return (
			<div className="py-12 text-center border border-border rounded-md">
				<GitCommit className="w-6 h-6 text-muted-foreground/20 mx-auto mb-3" />
				<p className="text-xs text-muted-foreground/50 font-mono">
					No activity found
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{visibleMonths.map((monthGroup, monthIndex) => (
				<div key={monthGroup.key}>
					{/* Month header */}
					<div className="flex items-center gap-2 mb-3">
						<div
							className={cn(
								"w-2 h-2 rounded-full",
								monthGroup.key === currentMonthKey
									? "bg-success"
									: "bg-border",
							)}
						/>
						<h3 className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
							{monthLabel(monthGroup.key)}
						</h3>
						{monthGroup.kind === "contributions" &&
							monthGroup.days && (
								<span className="text-[10px] font-mono text-muted-foreground/50">
									{formatNumber(
										monthGroup.days.reduce(
											(sum, d) =>
												sum +
												d.contributionCount,
											0,
										),
									)}{" "}
									contributions
								</span>
							)}
					</div>

					{/* Activity items */}
					<div className="space-y-2 pl-4 border-l border-border ml-1">
						{monthGroup.items.map((item, index) => (
							<ActivityItemCard
								key={`${monthGroup.key}-${item.kind}-${index}`}
								item={item}
								defaultExpanded={
									monthIndex === 0 &&
									index === 0
								}
							/>
						))}
						{monthGroup.items.length === 0 && (
							<div className="py-4 text-center">
								<p className="text-[11px] text-muted-foreground/50 font-mono">
									Contribution activity only
								</p>
							</div>
						)}
					</div>
				</div>
			))}

			{hasMore && (
				<button
					onClick={() => setVisibleMonthCount((count) => count + 3)}
					className="w-full flex items-center justify-center gap-2 py-2.5 text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/30 transition-colors cursor-pointer"
				>
					<ChevronDown className="w-3.5 h-3.5" />
					Show {Math.min(3, remainingMonths)} more months (
					{remainingMonths} remaining)
				</button>
			)}
		</div>
	);
}
