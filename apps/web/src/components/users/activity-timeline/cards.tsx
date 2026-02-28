"use client";

import Link from "next/link";
import { useState } from "react";
import { CircleDot, GitCommit, GitPullRequest, MessageCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import {
	DEFAULT_VISIBLE_ROWS,
	monthLabel,
	monthContributionSummary,
	pullRequestActionLabel,
	pullRequestStatusCounts,
	SHOW_MORE_INCREMENT,
	statusDotClass,
	statusTextClass,
	timelineItemDescription,
	timelineItemHeading,
} from "./helpers";
import type {
	CommitActivityItem,
	ContributionDay,
	CreatedRepoEntry,
	EventActivityItem,
	ExpandableItemKind,
	IssueEntry,
	IssueStatus,
	PullRequestActivityItem,
	PullRequestEntry,
	PullRequestStatus,
} from "./types";

function TimestampLabel({ date }: { date: string }) {
	return (
		<span className="text-[10px] font-mono text-muted-foreground/80 whitespace-nowrap shrink-0">
			<TimeAgo date={date} />
		</span>
	);
}

function StatusLabel({ status }: { status: PullRequestStatus | IssueStatus }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide",
				statusTextClass(status),
			)}
		>
			<span className={cn("size-1.5 rounded-full", statusDotClass(status))} />
			{status}
		</span>
	);
}

function PullRequestItemRows({ items }: { items: PullRequestEntry[] }) {
	return (
		<div className="divide-y divide-border">
			{items.map((entry) => (
				<Link
					key={entry.id}
					href={entry.href}
					className="group flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
				>
					<div className="min-w-0 text-[11px] leading-5">
						<p className="truncate text-muted-foreground">
							<span className="text-foreground group-hover:underline">
								{entry.repoName}
							</span>{" "}
							{pullRequestActionLabel(entry.action)}
							{entry.number ? (
								<span className="font-mono text-foreground/90">
									{" "}
									#{entry.number}
								</span>
							) : null}
						</p>
						{entry.title ? (
							<p className="truncate text-muted-foreground/80">
								{entry.title}
							</p>
						) : null}
						<div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-muted-foreground/70">
							{typeof entry.comments === "number" ? (
								<span>
									{entry.comments} comments
								</span>
							) : null}
							{typeof entry.commits === "number" ? (
								<span>{entry.commits} commits</span>
							) : null}
							{typeof entry.changedFiles === "number" ? (
								<span>
									{entry.changedFiles} files
								</span>
							) : null}
							{typeof entry.additions === "number" ||
							typeof entry.deletions === "number" ? (
								<span className="inline-flex items-center gap-1">
									<span className="text-success">
										+
										{entry.additions ??
											0}
									</span>
									<span className="text-destructive">
										-
										{entry.deletions ??
											0}
									</span>
								</span>
							) : null}
							{entry.language ? (
								<span>{entry.language}</span>
							) : null}
						</div>
					</div>
					<div className="flex items-center gap-2 pl-3">
						{entry.status ? (
							<StatusLabel status={entry.status} />
						) : null}
						<TimestampLabel date={entry.createdAt} />
					</div>
				</Link>
			))}
		</div>
	);
}

function IssuesItemRows({ items }: { items: IssueEntry[] }) {
	return (
		<div className="divide-y divide-border">
			{items.map((entry) => (
				<Link
					key={entry.id}
					href={entry.href}
					className="group flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
				>
					<div className="min-w-0 text-[11px] leading-5">
						<p className="truncate text-muted-foreground">
							<span className="text-foreground group-hover:underline">
								{entry.repoName}
							</span>{" "}
							issue
							{entry.number ? (
								<span className="font-mono text-foreground/90">
									{" "}
									#{entry.number}
								</span>
							) : null}
						</p>
						{entry.title ? (
							<p className="truncate text-muted-foreground/80">
								{entry.title}
							</p>
						) : null}
						{typeof entry.comments === "number" ? (
							<p className="mt-1 text-[10px] font-mono text-muted-foreground/70">
								{entry.comments} comments
							</p>
						) : null}
					</div>
					<div className="flex items-center gap-2 pl-3">
						{entry.status ? (
							<StatusLabel status={entry.status} />
						) : null}
						<TimestampLabel date={entry.createdAt} />
					</div>
				</Link>
			))}
		</div>
	);
}

function CommitsItemBody({ item }: { item: CommitActivityItem }) {
	const topRepos = item.repositories.slice(0, 5);
	return (
		<div className="space-y-3 px-3 py-3">
			<div className="space-y-2">
				{topRepos.map((repo) => {
					const width = Math.max(
						10,
						Math.round(
							(repo.count /
								Math.max(item.totalCommits, 1)) *
								100,
						),
					);
					return (
						<div key={repo.repoName} className="space-y-1">
							<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
								<Link
									href={`/${repo.repoName}`}
									className="min-w-0 truncate text-foreground hover:underline"
								>
									{repo.repoName}
								</Link>
								<span className="font-mono tabular-nums">
									{repo.count}{" "}
									{repo.count === 1
										? "commit"
										: "commits"}
								</span>
							</div>
							<div className="h-1.5 rounded-full bg-muted overflow-hidden">
								<div
									className="h-full rounded-full bg-[var(--contrib-3)]"
									style={{
										width: `${width}%`,
									}}
								/>
							</div>
						</div>
					);
				})}
			</div>
			{item.commitMessages.length > 0 ? (
				<div className="divide-y divide-border rounded-md border border-border overflow-hidden">
					{item.commitMessages.map((commit) => (
						<Link
							key={commit.id}
							href={`/${commit.repoName}`}
							className="group flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
						>
							<div className="min-w-0 truncate text-[11px] text-muted-foreground">
								<span className="text-foreground group-hover:underline">
									{commit.repoName}
								</span>{" "}
								{commit.message}
							</div>
							<TimestampLabel date={commit.createdAt} />
						</Link>
					))}
				</div>
			) : null}
		</div>
	);
}

function CreatedReposItemBody({ items }: { items: CreatedRepoEntry[] }) {
	return (
		<div className="divide-y divide-border">
			{items.map((repo) => (
				<Link
					key={repo.id}
					href={repo.href}
					className="group flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors"
				>
					<div className="min-w-0 truncate text-[11px] text-muted-foreground">
						Created{" "}
						<span className="text-foreground group-hover:underline">
							{repo.repoName}
						</span>
						{repo.language ? (
							<span className="ml-2 text-[10px] font-mono text-muted-foreground/70">
								{repo.language}
							</span>
						) : null}
					</div>
					<TimestampLabel date={repo.createdAt} />
				</Link>
			))}
		</div>
	);
}

function PullRequestStatusSummary({ item }: { item: PullRequestActivityItem }) {
	const counts = pullRequestStatusCounts(item.items);
	return (
		<div className="flex items-center gap-1.5">
			<span className="rounded border border-success/25 bg-success/10 px-1.5 py-0.5 text-[9px] font-mono text-success tabular-nums">
				open {counts.open}
			</span>
			<span className="rounded border border-alert-important/25 bg-alert-important/10 px-1.5 py-0.5 text-[9px] font-mono text-alert-important tabular-nums">
				merged {counts.merged}
			</span>
			<span className="rounded border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-mono text-destructive tabular-nums">
				closed {counts.closed}
			</span>
		</div>
	);
}

export function TimelineEventCard({
	item,
	monthKey,
}: {
	item: EventActivityItem;
	monthKey: string;
}) {
	const expandableKind: ExpandableItemKind | null =
		item.kind === "pull_requests" ||
		item.kind === "issues" ||
		item.kind === "repositories"
			? item.kind
			: null;
	const defaultVisible = expandableKind ? DEFAULT_VISIBLE_ROWS[expandableKind] : 0;
	const [visibleCount, setVisibleCount] = useState(defaultVisible);
	const totalRows =
		item.kind === "pull_requests" ||
		item.kind === "issues" ||
		item.kind === "repositories"
			? item.items.length
			: 0;
	const canShowMore = expandableKind ? visibleCount < totalRows : false;

	const icon =
		item.kind === "commits" ? (
			<GitCommit className="size-3.5" />
		) : item.kind === "repositories" ? (
			<Plus className="size-3.5" />
		) : item.kind === "pull_requests" ? (
			<GitPullRequest className="size-3.5" />
		) : item.kind === "issues" ? (
			<MessageCircle className="size-3.5" />
		) : (
			<CircleDot className="size-3.5" />
		);

	return (
		<div className="rounded-md border border-border bg-card/70 overflow-hidden">
			<div className="flex items-center justify-between gap-3 border-b border-border bg-muted/25 px-3 py-2.5">
				<div className="min-w-0 flex items-center gap-2">
					<span className="text-muted-foreground">{icon}</span>
					<div className="min-w-0">
						<p className="truncate text-xs font-medium">
							{timelineItemHeading(item)}
						</p>
						<p className="truncate text-[10px] font-mono text-muted-foreground">
							{timelineItemDescription(item)}
						</p>
					</div>
				</div>
				{item.kind === "pull_requests" ? (
					<PullRequestStatusSummary item={item} />
				) : null}
			</div>
			{item.kind === "commits" ? <CommitsItemBody item={item} /> : null}
			{item.kind === "repositories" ? (
				<CreatedReposItemBody items={item.items.slice(0, visibleCount)} />
			) : null}
			{item.kind === "pull_requests" ? (
				<PullRequestItemRows items={item.items.slice(0, visibleCount)} />
			) : null}
			{item.kind === "issues" ? (
				<IssuesItemRows items={item.items.slice(0, visibleCount)} />
			) : null}
			{item.kind === "other" ? (
				<div className="px-3 py-2.5 text-[11px] text-muted-foreground">
					More public events were detected this month, but they are
					not classified as commits, pull requests, or new
					repositories.
				</div>
			) : null}
			{canShowMore && expandableKind ? (
				<div className="border-t border-border px-3 py-2">
					<button
						onClick={() =>
							setVisibleCount(
								(current) =>
									current +
									SHOW_MORE_INCREMENT[
										expandableKind
									],
							)
						}
						className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
					>
						Show{" "}
						{Math.min(
							SHOW_MORE_INCREMENT[expandableKind],
							totalRows - visibleCount,
						)}{" "}
						more for {monthLabel(monthKey)}
					</button>
				</div>
			) : null}
		</div>
	);
}

export function ContributionFallbackRows({ days }: { days: ContributionDay[] }) {
	return (
		<div className="divide-y divide-border">
			{days.slice(0, 14).map((day) => (
				<div
					key={day.date}
					className="flex items-center justify-between gap-3 px-3 py-2.5"
				>
					<div className="min-w-0 flex items-center gap-2">
						<span className="size-2 rounded-full bg-[var(--contrib-3)]" />
						<span className="truncate text-[11px] text-muted-foreground">
							<span className="font-medium tabular-nums text-foreground">
								{day.contributionCount}
							</span>{" "}
							contribution
							{day.contributionCount === 1 ? "" : "s"}
						</span>
					</div>
					<span className="text-[10px] font-mono text-muted-foreground">
						{new Date(day.date).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
						})}
					</span>
				</div>
			))}
		</div>
	);
}

export { monthContributionSummary };
