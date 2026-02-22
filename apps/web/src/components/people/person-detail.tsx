"use client";

import { noSSR } from "foxact/no-ssr";
import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { PersonRepoActivity, ContributorWeek } from "@/lib/github";

interface UserData {
	login: string;
	avatar_url: string;
	name: string | null;
	bio: string | null;
	html_url: string;
}

interface PersonDetailProps {
	owner: string;
	repo: string;
	user: UserData | null;
	activity: PersonRepoActivity;
	weeklyData: ContributorWeek[];
}

type Tab = "commits" | "prs" | "issues" | "reviews";
type Period = "4w" | "12w" | "6m" | "1y";

const PERIOD_CONFIG: Record<Period, { label: string; weeks: number }> = {
	"4w": { label: "4w", weeks: 4 },
	"12w": { label: "12w", weeks: 12 },
	"6m": { label: "6m", weeks: 26 },
	"1y": { label: "1y", weeks: 52 },
};

function formatDate(dateStr: string): string {
	if (!dateStr) return "";
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatDateGroup(dateStr: string): string {
	if (!dateStr) return "";
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatWeekLabel(timestamp: number): string {
	const d = new Date(timestamp * 1000);
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupCommitsByDate(
	commits: PersonRepoActivity["commits"],
): { date: string; label: string; commits: PersonRepoActivity["commits"] }[] {
	const groups: Record<string, PersonRepoActivity["commits"]> = {};
	for (const c of commits) {
		const key = c.date ? new Date(c.date).toISOString().slice(0, 10) : "unknown";
		if (!groups[key]) groups[key] = [];
		groups[key].push(c);
	}
	return Object.entries(groups)
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([date, commits]) => ({
			date,
			label: date === "unknown" ? "Unknown date" : formatDateGroup(date),
			commits,
		}));
}

function StatChip({ label, value }: { label: string; value: number | string }) {
	return (
		<span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 border border-border rounded-md">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-foreground">{value}</span>
		</span>
	);
}

function StateBadge({ state }: { state: string }) {
	const colors: Record<string, string> = {
		open: "bg-success/15 text-success",
		closed: "bg-destructive/15 text-destructive",
		merged: "bg-alert-important/15 text-alert-important",
	};

	return (
		<span
			className={cn(
				"text-[10px] font-mono px-1.5 py-0.5 rounded-full",
				colors[state] ?? "bg-muted text-muted-foreground",
			)}
		>
			{state}
		</span>
	);
}

function ActivitySection({
	weeklyData,
	period,
	onPeriodChange,
}: {
	weeklyData: ContributorWeek[];
	period: Period;
	onPeriodChange: (p: Period) => void;
}) {
	const config = PERIOD_CONFIG[period];
	const weeks = weeklyData.slice(-config.weeks);

	const maxCommits = Math.max(...weeks.map((w) => w.c), 1);
	const periodCommits = weeks.reduce((s, w) => s + w.c, 0);
	const periodAdditions = weeks.reduce((s, w) => s + w.a, 0);
	const periodDeletions = weeks.reduce((s, w) => s + w.d, 0);

	const firstLabel = weeks.length > 0 ? formatWeekLabel(weeks[0].w) : "";
	const lastLabel = weeks.length > 1 ? formatWeekLabel(weeks[weeks.length - 1].w) : "";

	return (
		<div className="border border-border rounded-md p-4 space-y-3">
			{/* Header row */}
			<div className="flex items-center justify-between">
				<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Activity
				</span>
				<div className="flex items-center gap-0.5">
					{(Object.keys(PERIOD_CONFIG) as Period[]).map((p) => (
						<button
							key={p}
							onClick={() => onPeriodChange(p)}
							className={cn(
								"px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors",
								period === p
									? "bg-muted text-foreground"
									: "text-muted-foreground/50 hover:text-muted-foreground",
							)}
						>
							{PERIOD_CONFIG[p].label}
						</button>
					))}
				</div>
			</div>

			{/* Stats summary */}
			<div className="flex items-center gap-2 text-[11px] font-mono">
				<span className="text-muted-foreground">
					{periodCommits} commits
				</span>
				<span className="text-success">
					+{periodAdditions.toLocaleString()}
				</span>
				<span className="text-destructive">
					-{periodDeletions.toLocaleString()}
				</span>
			</div>

			{/* Bar chart */}
			<div className="flex items-end gap-px h-16">
				{weeks.map((week, i) => {
					const height = Math.max(1, (week.c / maxCommits) * 64);
					return (
						<div
							key={week.w || i}
							className="flex-1 group relative flex items-end"
							style={{ height: 64 }}
						>
							<div
								className={cn(
									"w-full rounded-sm transition-colors",
									week.c > 0
										? "bg-success/60 group-hover:bg-success/80"
										: "bg-accent",
								)}
								style={{ height }}
							/>
							<div className="absolute bottom-full mb-1 hidden group-hover:block z-20">
								<div className="bg-foreground text-background text-[10px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap">
									{formatWeekLabel(week.w)}:{" "}
									{week.c}c +{week.a} -
									{week.d}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* Week date labels */}
			{firstLabel && lastLabel && (
				<div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground/60">
					<span>{firstLabel}</span>
					<span>{lastLabel}</span>
				</div>
			)}
		</div>
	);
}

export function PersonDetail({ owner, repo, user, activity, weeklyData }: PersonDetailProps) {
	noSSR();
	const [tab, setTab] = useState<Tab>("commits");
	const [period, setPeriod] = useState<Period>("12w");

	const stats = useMemo(() => {
		let streak = 0;
		for (let i = weeklyData.length - 1; i >= 0; i--) {
			if (weeklyData[i].c > 0) streak++;
			else break;
		}
		return {
			commits: activity.commits.length,
			prs: activity.prs.length,
			issues: activity.issues.length,
			reviews: activity.reviews.length,
			streak,
		};
	}, [weeklyData, activity]);

	const commitGroups = useMemo(
		() => groupCommitsByDate(activity.commits),
		[activity.commits],
	);

	if (!user) {
		return (
			<div className="p-8 text-center text-sm text-muted-foreground font-mono">
				User not found
			</div>
		);
	}

	const tabs: { key: Tab; label: string; count: number }[] = [
		{ key: "commits", label: "Commits", count: activity.commits.length },
		{ key: "prs", label: "PRs", count: activity.prs.length },
		{ key: "issues", label: "Issues", count: activity.issues.length },
		{ key: "reviews", label: "Reviews", count: activity.reviews.length },
	];

	const base = `/${owner}/${repo}`;

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header */}
			<div className="shrink-0 space-y-4 pb-4">
				{/* Avatar + info */}
				<div className="flex items-start gap-4">
					<Image
						src={user.avatar_url}
						alt={user.login}
						width={72}
						height={72}
						className="rounded-full shrink-0 ring-2 ring-border ring-offset-2 ring-offset-background"
					/>
					<div className="min-w-0 space-y-1">
						<h2 className="text-xl font-semibold truncate">
							{user.name ?? user.login}
						</h2>
						<p className="text-sm font-mono text-muted-foreground">
							@{user.login}
						</p>
						{user.bio && (
							<p className="text-sm text-muted-foreground line-clamp-2 max-w-lg">
								{user.bio}
							</p>
						)}
					</div>
				</div>

				{/* Stat chips */}
				<div className="flex items-center gap-2 flex-wrap">
					<StatChip label="commits" value={stats.commits} />
					<StatChip label="PRs" value={stats.prs} />
					<StatChip label="issues" value={stats.issues} />
					<StatChip label="reviews" value={stats.reviews} />
					{stats.streak > 0 && (
						<StatChip
							label="streak"
							value={`${stats.streak}w`}
						/>
					)}
				</div>

				{/* Activity section */}
				{weeklyData.length > 0 && (
					<ActivitySection
						weeklyData={weeklyData}
						period={period}
						onPeriodChange={setPeriod}
					/>
				)}

				{/* Tabs */}
				<div className="flex items-center gap-1 border-b border-border">
					{tabs.map((t) => (
						<button
							key={t.key}
							onClick={() => setTab(t.key)}
							className={cn(
								"px-3 py-2 text-sm transition-colors relative",
								tab === t.key
									? "text-foreground font-medium"
									: "text-muted-foreground/70 hover:text-muted-foreground",
							)}
						>
							<span className="flex items-center gap-1.5">
								{t.label}
								<span
									className={cn(
										"text-[10px] font-mono px-1.5 py-0.5 rounded-full",
										tab === t.key
											? "bg-muted text-foreground/70"
											: "bg-muted/60 text-muted-foreground/60",
									)}
								>
									{t.count}
								</span>
							</span>
							{tab === t.key && (
								<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
							)}
						</button>
					))}
				</div>
			</div>

			{/* Scrollable tab content */}
			<div className="flex-1 min-h-0 overflow-y-auto pb-4">
				{/* Commits tab - grouped by date */}
				{tab === "commits" && (
					<>
						{activity.commits.length === 0 ? (
							<EmptyState message="No commits found" />
						) : (
							<div className="space-y-3">
								{commitGroups.map((group) => (
									<div key={group.date}>
										<p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
											{
												group.label
											}
										</p>
										<div className="divide-y divide-border border border-border rounded-md overflow-hidden">
											{group.commits.map(
												(
													c,
												) => (
													<Link
														key={
															c.sha
														}
														href={`${base}/commits/${c.sha}`}
														className="px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors group"
													>
														<span className="font-mono text-xs text-info shrink-0">
															{c.sha.slice(
																0,
																7,
															)}
														</span>
														<span className="text-sm truncate flex-1 group-hover:text-foreground">
															{
																c.message
															}
														</span>
													</Link>
												),
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</>
				)}

				{/* PRs tab */}
				{tab === "prs" && (
					<div className="divide-y divide-border border border-border rounded-md overflow-hidden">
						{activity.prs.length === 0 ? (
							<EmptyState message="No pull requests found" />
						) : (
							activity.prs.map((pr) => (
								<Link
									key={pr.number}
									href={`${base}/pulls/${pr.number}`}
									className="px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors group"
								>
									<span className="font-mono text-xs text-muted-foreground shrink-0 w-12">
										#{pr.number}
									</span>
									<span className="text-sm truncate flex-1 group-hover:text-foreground">
										{pr.title}
									</span>
									<StateBadge
										state={pr.state}
									/>
									<span className="text-xs text-muted-foreground font-mono shrink-0">
										{formatDate(
											pr.created_at,
										)}
									</span>
								</Link>
							))
						)}
					</div>
				)}

				{/* Issues tab */}
				{tab === "issues" && (
					<div className="divide-y divide-border border border-border rounded-md overflow-hidden">
						{activity.issues.length === 0 ? (
							<EmptyState message="No issues found" />
						) : (
							activity.issues.map((issue) => (
								<Link
									key={issue.number}
									href={`${base}/issues/${issue.number}`}
									className="px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors group"
								>
									<span className="font-mono text-xs text-muted-foreground shrink-0 w-12">
										#{issue.number}
									</span>
									<span className="text-sm truncate flex-1 group-hover:text-foreground">
										{issue.title}
									</span>
									<StateBadge
										state={issue.state}
									/>
									<span className="text-xs text-muted-foreground font-mono shrink-0">
										{formatDate(
											issue.created_at,
										)}
									</span>
								</Link>
							))
						)}
					</div>
				)}

				{/* Reviews tab */}
				{tab === "reviews" && (
					<div className="divide-y divide-border border border-border rounded-md overflow-hidden">
						{activity.reviews.length === 0 ? (
							<EmptyState message="No reviews found" />
						) : (
							activity.reviews.map((review) => (
								<Link
									key={`${review.pr_number}-${review.submitted_at}`}
									href={`${base}/pulls/${review.pr_number}`}
									className="px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors group"
								>
									<span className="font-mono text-xs text-muted-foreground shrink-0 w-12">
										#{review.pr_number}
									</span>
									<span className="text-sm truncate flex-1 group-hover:text-foreground">
										{review.pr_title}
									</span>
									<span className="text-xs text-muted-foreground font-mono shrink-0">
										{formatDate(
											review.submitted_at,
										)}
									</span>
								</Link>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function EmptyState({ message }: { message: string }) {
	return <div className="p-8 text-center text-sm text-muted-foreground">{message}</div>;
}
