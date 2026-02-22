"use client";

import { noSSR } from 'foxact/no-ssr'
import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
	GitPullRequest,
	CircleDot,
	Bell,
	Eye,
	Star,
	GitFork,
	ChevronRight,
	CheckCircle2,
	MessageSquare,
	Lock,
	Flame,
	GitCommit,
	MessageCircle,
	Plus,
	Trash2,
	X,
	Lightbulb,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { toInternalUrl, getLanguageColor } from "@/lib/github-utils";
import { RecentlyViewed } from "./recently-viewed";
import { CreateRepoDialog } from "@/components/repo/create-repo-dialog";
import type {
	IssueItem,
	RepoItem,
	NotificationItem,
	ActivityEvent,
	TrendingRepoItem,
	GitHubUser,
	SearchResult,
} from "@/lib/github-types";

interface DashboardContentProps {
	user: GitHubUser;
	reviewRequests: SearchResult<IssueItem>;
	myOpenPRs: SearchResult<IssueItem>;
	myIssues: SearchResult<IssueItem>;
	repos: Array<RepoItem>;
	notifications: Array<NotificationItem>;
	activity: Array<ActivityEvent>;
	trending: Array<TrendingRepoItem>;
}

function extractRepoName(repoUrl: string) {
	const parts = repoUrl.split("/");
	return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function DashboardContent({
	user,
	reviewRequests,
	myOpenPRs,
	myIssues,
	repos,
	notifications,
	activity,
	trending,
}: DashboardContentProps) {
	const hasWork =
		reviewRequests.items.length > 0 ||
		myOpenPRs.items.length > 0 ||
		myIssues.items.length > 0;

	return (
		<div className="flex flex-col flex-1 min-h-0 w-full">
			{/* Header */}
			<Suspense fallback={<GreetingHeaderSkeleton />}>
				<GreetingHeader userName={user.name || user.login} />
			</Suspense>

			<ExtensionBanner />

			{/* Two-column layout */}
			<div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 pb-2">
				{/* Left — overview + work items */}
				<div className="lg:w-1/2 lg:min-h-0 lg:overflow-hidden flex flex-col gap-3 lg:pr-2">
					{/* Activity marquee */}
					<Suspense fallback={<ActivityMarqueeSkeleton />}>
						<ActivityMarquee activity={activity} />
					</Suspense>

					{/* Stats */}
					<div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
						<Stat
							icon={<Eye className="w-3.5 h-3.5" />}
							label="Reviews"
							value={reviewRequests.total_count}
							accent={reviewRequests.total_count > 0}
						/>
						<Stat
							icon={
								<GitPullRequest className="w-3.5 h-3.5" />
							}
							label="Open PRs"
							value={myOpenPRs.total_count}
							accent={myOpenPRs.total_count > 0}
						/>
						<Stat
							icon={<CircleDot className="w-3.5 h-3.5" />}
							label="Issues"
							value={myIssues.total_count}
							accent={myIssues.total_count > 0}
						/>
						<Stat
							icon={<Bell className="w-3.5 h-3.5" />}
							label="Notifs"
							value={
								notifications.filter(
									(n) => n.unread,
								).length
							}
						/>
					</div>

					{/* Tabbed work panel */}
					<WorkTabs
						reviewRequests={reviewRequests}
						myOpenPRs={myOpenPRs}
						myIssues={myIssues}
						hasWork={hasWork}
					/>
				</div>

				{/* Right — recently viewed + repos/trending */}
				<div className="lg:w-1/2 lg:min-h-0 lg:overflow-hidden flex flex-col gap-3 lg:pl-2">
					{/* Recently Viewed */}
					<RecentlyViewed />

					{/* Repos + Trending (tabbed) */}
					<ReposTabs repos={repos} trending={trending} />
				</div>
			</div>
		</div>
	);
}

const EXTENSION_DISMISSED_KEY = "extension-banner-dismissed";

function ExtensionBanner() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (!localStorage.getItem(EXTENSION_DISMISSED_KEY)) {
			setVisible(true);
		}
	}, []);

	if (!visible) return null;

	return (
		<div className="shrink-0 mb-3 flex items-center gap-3 px-3 py-2.5 border border-border rounded-md bg-muted/30">
			<Lightbulb className="w-4 h-4 text-muted-foreground/60 shrink-0" />
			<p className="flex-1 text-[11px] text-muted-foreground leading-relaxed">
				Install our{" "}
				<a
					href="/extension"
					className="text-foreground underline underline-offset-2 decoration-foreground/20 hover:decoration-foreground/40 transition-colors"
				>
					browser extension
				</a>{" "}
				to automatically redirect GitHub links to Better Hub.
			</p>
			<button
				onClick={() => {
					localStorage.setItem(EXTENSION_DISMISSED_KEY, "true");
					setVisible(false);
				}}
				className="shrink-0 p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
			>
				<X className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}
type TabKey = "reviews" | "prs" | "issues";

function WorkTabs({
	reviewRequests,
	myOpenPRs,
	myIssues,
	hasWork,
}: {
	reviewRequests: SearchResult<IssueItem>;
	myOpenPRs: SearchResult<IssueItem>;
	myIssues: SearchResult<IssueItem>;
	hasWork: boolean;
}) {
	const [activeTab, setActiveTab] = useState<TabKey>("reviews");

	const tabs: { key: TabKey; label: string; count: number }[] = [
		{ key: "reviews", label: "Needs your review", count: reviewRequests.total_count },
		{ key: "prs", label: "PRs", count: myOpenPRs.total_count },
		{ key: "issues", label: "Assigned to you", count: myIssues.total_count },
	];

	if (!hasWork) {
		return (
			<div className="flex-1 min-h-0 border border-border py-12 text-center">
				<CheckCircle2 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
				<p className="text-xs text-muted-foreground font-mono">
					Nothing needs your attention
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 min-h-0 flex flex-col border border-border">
			{/* Tab header */}
			<div className="shrink-0 flex items-center border-b border-border overflow-x-auto no-scrollbar">
				{tabs.map((tab) => (
					<button
						key={tab.key}
						onClick={() => setActiveTab(tab.key)}
						className={cn(
							"flex items-center gap-2 px-3 sm:px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider whitespace-nowrap shrink-0 transition-colors cursor-pointer",
							activeTab === tab.key
								? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
								: "text-muted-foreground hover:text-foreground/60",
						)}
					>
						{tab.label}
						<span
							className={cn(
								"text-[10px] tabular-nums",
								activeTab === tab.key
									? "text-foreground/50"
									: "text-muted-foreground/50",
							)}
						>
							{tab.count}
						</span>
					</button>
				))}
			</div>

			{/* Tab content — scrollable */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{activeTab === "reviews" &&
					(reviewRequests.items.length > 0 ? (
						reviewRequests.items.map((pr) => (
							<ItemRow key={pr.id} item={pr} type="pr" />
						))
					) : (
						<EmptyTab message="No reviews requested" />
					))}
				{activeTab === "prs" &&
					(myOpenPRs.items.length > 0 ? (
						myOpenPRs.items.map((pr) => (
							<ItemRow key={pr.id} item={pr} type="pr" />
						))
					) : (
						<EmptyTab message="No open PRs" />
					))}
				{activeTab === "issues" &&
					(myIssues.items.length > 0 ? (
						myIssues.items.map((issue) => (
							<ItemRow
								key={issue.id}
								item={issue}
								type="issue"
							/>
						))
					) : (
						<EmptyTab message="No assigned issues" />
					))}
			</div>
		</div>
	);
}

function EmptyTab({ message }: { message: string }) {
	return (
		<div className="py-10 text-center">
			<p className="text-xs text-muted-foreground/50 font-mono">{message}</p>
		</div>
	);
}

function ReposTabs({
	repos,
	trending,
}: {
	repos: Array<RepoItem>;
	trending: Array<TrendingRepoItem>;
}) {
	const [tab, setTab] = useState<"repos" | "trending">("repos");

	return (
		<section className="flex-1 border border-border flex flex-col min-h-0">
			<div className="shrink-0 flex items-center border-b border-border overflow-x-auto no-scrollbar">
				<button
					onClick={() => setTab("repos")}
					className={cn(
						"flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
						tab === "repos"
							? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
							: "text-muted-foreground hover:text-foreground/60",
					)}
				>
					Repositories
				</button>
				{trending.length > 0 && (
					<button
						onClick={() => setTab("trending")}
						className={cn(
							"flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
							tab === "trending"
								? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
								: "text-muted-foreground hover:text-foreground/60",
						)}
					>
						<Flame className="w-3 h-3 text-orange-500/70" />
						Trending
					</button>
				)}
				{tab === "trending" && (
					<Link
						href="/trending"
						className="ml-auto mr-3 flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors"
					>
						See all
						<ChevronRight className="w-3 h-3" />
					</Link>
				)}
				{tab === "repos" && (
					<div className="ml-auto mr-3">
						<CreateRepoDialog />
					</div>
				)}
			</div>
			<div className="overflow-y-auto">
				{tab === "repos"
					? repos
							.slice(0, 10)
							.map((repo) => (
								<RepoRow
									key={repo.id}
									repo={repo}
								/>
							))
					: trending.map((repo) => (
							<TrendingRow key={repo.id} repo={repo} />
						))}
			</div>
		</section>
	);
}

/* ── Stat ──────────────────────────────────────────────────────────── */

function Stat({
	icon,
	label,
	value,
	accent,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
	accent?: boolean;
}) {
	return (
		<div
			className={cn(
				"stat-card relative overflow-hidden rounded-lg px-3 py-3",
				"border border-black/[0.04] dark:border-white/[0.06]",
				"bg-gradient-to-br from-black/[0.02] via-black/[0.01] to-transparent dark:from-white/[0.04] dark:via-white/[0.02] dark:to-transparent",
			)}
		>
			{/* Noise texture */}
			<div className="pointer-events-none absolute inset-0 stat-noise opacity-[0.25] dark:opacity-[0.5] mix-blend-overlay" />
			{/* Diagonal shine */}
			<div className="pointer-events-none absolute -inset-1/2 w-[200%] h-[200%] rotate-12 bg-gradient-to-br from-transparent via-white/[0.5] dark:via-white/[0.03] to-transparent translate-x-[-30%] translate-y-[-10%]" />
			<div className="relative flex flex-col gap-1.5">
				<div className="flex items-center gap-1.5">
					<span
						className={cn(
							accent
								? "text-foreground/60"
								: "text-muted-foreground/40",
						)}
					>
						{icon}
					</span>
					<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
						{label}
					</span>
				</div>
				<div className="flex items-baseline gap-1.5">
					<span
						className={cn(
							"text-lg font-medium tabular-nums tracking-tight",
							accent
								? "text-foreground"
								: "text-foreground/60",
						)}
					>
						{value}
					</span>
					{accent && value > 0 && (
						<span className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
					)}
				</div>
			</div>
		</div>
	);
}

/* ── Panel ─────────────────────────────────────────────────────────── */

function Panel({
	title,
	count,
	children,
}: {
	title: string;
	count?: number;
	children: React.ReactNode;
}) {
	return (
		<section className="border border-border">
			<div className="flex items-center gap-2 px-4 py-2 border-b border-border">
				<h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					{title}
				</h2>
				{count !== undefined && (
					<span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums ml-auto">
						{count}
					</span>
				)}
			</div>
			<div>{children}</div>
		</section>
	);
}

function ItemRow({ item, type }: { item: IssueItem; type: "pr" | "issue" }) {
	const repo = extractRepoName(item.repository_url);
	const isMerged = type === "pr" && item.pull_request?.merged_at;
	const isDraft = type === "pr" && item.draft;

	return (
		<Link
			href={toInternalUrl(item.html_url)}
			className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/2 transition-colors border-b border-border/60 last:border-b-0"
		>
			{type === "pr" ? (
				<GitPullRequest
					className={cn(
						"w-3.5 h-3.5 shrink-0",
						isMerged
							? "text-alert-important"
							: isDraft
								? "text-muted-foreground"
								: "text-success",
					)}
				/>
			) : (
				<CircleDot className="w-3.5 h-3.5 text-success shrink-0" />
			)}
			<div className="flex-1 min-w-0">
				<span className="text-sm truncate block group-hover:text-foreground transition-colors">
					{item.title}
				</span>
				<div className="flex items-center gap-2 mt-px">
					<span className="text-[11px] font-mono text-muted-foreground/70">
						{repo}#{item.number}
					</span>
					<span className="text-[11px] text-muted-foreground/50">
						<TimeAgo date={item.updated_at} />
					</span>
					{item.comments > 0 && (
						<span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50">
							<MessageSquare className="w-2.5 h-2.5" />
							{item.comments}
						</span>
					)}
					{item.labels
						.filter((l) => l.name)
						.slice(0, 2)
						.map((label) => (
							<span
								key={label.name}
								className="text-[9px] font-mono px-1 rounded-sm"
								style={{
									color: `#${label.color || "888"}`,
									backgroundColor: `#${label.color || "888"}14`,
								}}
							>
								{label.name}
							</span>
						))}
				</div>
			</div>
			<ChevronRight className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
		</Link>
	);
}

/* ── RepoRow ───────────────────────────────────────────────────────── */

function RepoRow({ repo }: { repo: RepoItem }) {
	return (
		<Link
			href={`/${repo.full_name}`}
			className="group flex gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/60 last:border-b-0"
		>
			<Image
				src={repo.owner.avatar_url}
				alt={repo.owner.login}
				width={20}
				height={20}
				className="rounded-sm shrink-0 mt-0.5 w-5 h-5 object-cover"
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono truncate group-hover:text-foreground transition-colors">
						<span className="text-muted-foreground/50">
							{repo.owner.login}
						</span>
						<span className="text-muted-foreground/30 mx-0.5">
							/
						</span>
						<span className="font-medium">{repo.name}</span>
					</span>
					{repo.private && (
						<Lock className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
					)}
				</div>
				<div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
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
							{repo.language}
						</span>
					)}
					{repo.stargazers_count > 0 && (
						<span className="flex items-center gap-0.5">
							<Star className="w-2.5 h-2.5" />
							{formatNumber(repo.stargazers_count)}
						</span>
					)}
					{repo.updated_at && (
						<span className="ml-auto text-muted-foreground/50 font-mono">
							<TimeAgo date={repo.updated_at} />
						</span>
					)}
				</div>
			</div>
		</Link>
	);
}

/* ── TrendingRow ──────────────────────────────────────────────────── */

function TrendingRow({ repo }: { repo: TrendingRepoItem }) {
	return (
		<Link
			href={`/${repo.full_name}`}
			className="group flex gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/60 last:border-b-0"
		>
			<Image
				src={repo.owner?.avatar_url ?? ""}
				alt={repo.owner?.login ?? ""}
				width={20}
				height={20}
				className="rounded-sm shrink-0 mt-0.5 w-5 h-5 object-cover"
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono truncate group-hover:text-foreground transition-colors">
						<span className="text-muted-foreground/50">
							{repo.owner?.login}
						</span>
						<span className="text-muted-foreground/30 mx-0.5">
							/
						</span>
						<span className="font-medium">{repo.name}</span>
					</span>
				</div>
				{repo.description && (
					<p className="text-[11px] text-muted-foreground/60 truncate mt-0.5 leading-relaxed">
						{repo.description}
					</p>
				)}
				<div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
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
							{repo.language}
						</span>
					)}
					<span className="flex items-center gap-0.5">
						<Star className="w-2.5 h-2.5" />
						{formatNumber(repo.stargazers_count)}
					</span>
					{repo.forks_count > 0 && (
						<span className="flex items-center gap-0.5">
							<GitFork className="w-2.5 h-2.5" />
							{formatNumber(repo.forks_count)}
						</span>
					)}
				</div>
			</div>
		</Link>
	);
}

/* ── ActivityMarquee ───────────────────────────────────────────────── */

function getMarqueeItem(
	event: ActivityEvent,
): { icon: React.ReactNode; text: string; href: string; time: string } | null {
	const repoFullName = event.repo?.name;
	if (!repoFullName) return null;
	const repoBase = `/${repoFullName}`;
	const time = event.created_at
		? new Date(event.created_at).toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
				hour12: false,
			})
		: "";
	const p = event.payload;

	switch (event.type) {
		case "PushEvent": {
			const msg = p.commits?.[0]?.message?.split("\n")[0];
			const count = p.size ?? p.commits?.length ?? 0;
			return {
				icon: <GitCommit className="w-3 h-3" />,
				text:
					msg ||
					(count > 1
						? `Pushed ${count} commits to ${repoFullName}`
						: `Pushed to ${repoFullName}`),
				href: repoBase,
				time,
			};
		}
		case "PullRequestEvent": {
			const pr = p.pull_request;
			if (!pr?.number)
				return {
					icon: <GitPullRequest className="w-3 h-3" />,
					text: `PR activity in ${repoFullName}`,
					href: repoBase,
					time,
				};
			const action =
				p.action === "closed" && pr.merged
					? "merged"
					: p.action || "updated";
			return {
				icon: (
					<GitPullRequest
						className={cn(
							"w-3 h-3",
							action === "merged"
								? "text-alert-important"
								: action === "opened"
									? "text-success"
									: "",
						)}
					/>
				),
				text: `${action} #${pr.number}${pr.title ? `: ${pr.title}` : ""}`,
				href: `${repoBase}/pulls/${pr.number}`,
				time,
			};
		}
		case "PullRequestReviewEvent": {
			const pr = p.pull_request;
			if (!pr?.number)
				return {
					icon: <Eye className="w-3 h-3" />,
					text: `Reviewed PR in ${repoFullName}`,
					href: repoBase,
					time,
				};
			return {
				icon: <Eye className="w-3 h-3" />,
				text: `reviewed #${pr.number}${pr.title ? `: ${pr.title}` : ""}`,
				href: `${repoBase}/pulls/${pr.number}`,
				time,
			};
		}
		case "PullRequestReviewCommentEvent": {
			const pr = p.pull_request;
			if (!pr?.number)
				return {
					icon: <MessageCircle className="w-3 h-3" />,
					text: `Commented on PR in ${repoFullName}`,
					href: repoBase,
					time,
				};
			return {
				icon: <MessageCircle className="w-3 h-3" />,
				text: `commented on review #${pr.number}${pr.title ? `: ${pr.title}` : ""}`,
				href: `${repoBase}/pulls/${pr.number}`,
				time,
			};
		}
		case "IssuesEvent": {
			const issue = p.issue;
			if (!issue?.number)
				return {
					icon: <CircleDot className="w-3 h-3" />,
					text: `Issue activity in ${repoFullName}`,
					href: repoBase,
					time,
				};
			const action = p.action || "updated";
			return {
				icon: (
					<CircleDot
						className={cn(
							"w-3 h-3",
							action === "opened" ? "text-success" : "",
						)}
					/>
				),
				text: `${action} #${issue.number}${issue.title ? `: ${issue.title}` : ""}`,
				href: `${repoBase}/issues/${issue.number}`,
				time,
			};
		}
		case "IssueCommentEvent": {
			const issue = p.issue;
			if (!issue?.number)
				return {
					icon: <MessageCircle className="w-3 h-3" />,
					text: `Commented in ${repoFullName}`,
					href: repoBase,
					time,
				};
			return {
				icon: <MessageCircle className="w-3 h-3" />,
				text: `commented on #${issue.number}${issue.title ? `: ${issue.title}` : ""}`,
				href: `${repoBase}/issues/${issue.number}`,
				time,
			};
		}
		case "CreateEvent":
			return {
				icon: <Plus className="w-3 h-3" />,
				text: p.ref
					? `created ${p.ref_type || "ref"} ${p.ref}`
					: `created ${p.ref_type || "repo"} ${repoFullName}`,
				href: repoBase,
				time,
			};
		case "DeleteEvent":
			return {
				icon: <Trash2 className="w-3 h-3" />,
				text: `deleted ${p.ref_type || "ref"} ${p.ref || ""}`.trim(),
				href: repoBase,
				time,
			};
		case "WatchEvent":
			return {
				icon: <Star className="w-3 h-3 text-warning" />,
				text: `starred ${repoFullName}`,
				href: repoBase,
				time,
			};
		case "ForkEvent":
			return {
				icon: <GitFork className="w-3 h-3" />,
				text: `forked ${repoFullName}`,
				href: repoBase,
				time,
			};
		case "ReleaseEvent":
			return {
				icon: <Plus className="w-3 h-3" />,
				text: `${p.action || "published"} release ${p.release?.tag_name || ""} in ${repoFullName}`.trim(),
				href: repoBase,
				time,
			};
		case "CommitCommentEvent":
			return {
				icon: <MessageCircle className="w-3 h-3" />,
				text: `commented on commit in ${repoFullName}`,
				href: repoBase,
				time,
			};
		case "GollumEvent":
			return {
				icon: <Plus className="w-3 h-3" />,
				text: `updated wiki in ${repoFullName}`,
				href: repoBase,
				time,
			};
		case "MemberEvent":
			return {
				icon: <Plus className="w-3 h-3" />,
				text: `${p.action || "added"} member ${p.member?.login || ""} to ${repoFullName}`.trim(),
				href: repoBase,
				time,
			};
		case "PublicEvent":
			return {
				icon: <Eye className="w-3 h-3" />,
				text: `made ${repoFullName} public`,
				href: repoBase,
				time,
			};
		default:
			return null;
	}
}

function GreetingHeaderSkeleton() {
	return (
		<div className="shrink-0 pb-3">
			<div className="h-5 w-48 rounded bg-muted-foreground/10 animate-pulse" />
			<div className="h-3.5 w-56 rounded bg-muted-foreground/10 animate-pulse mt-1" />
		</div>
	);
}

function GreetingHeader({ userName }: { userName: string }) {
	noSSR();
	const greeting = getGreeting();
	const today = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});

	return (
		<div className="shrink-0 pb-3">
			<h1 className="text-sm font-medium">
				{greeting}, {userName}
			</h1>
			<p className="text-[11px] text-muted-foreground font-mono">
				{today}
			</p>
		</div>
	);
}

function ActivityMarqueeSkeleton() {
	return (
		<div className="shrink-0 relative overflow-hidden border-y border-border">
			<div className="flex items-center gap-3 py-2 px-3">
				{Array.from({ length: 4 }).map((_, i) => (
					<div key={i} className="flex items-center gap-1 shrink-0">
						<div className="w-8 h-3 rounded bg-muted-foreground/10 animate-pulse" />
						<div className="w-3 h-3 rounded bg-muted-foreground/10 animate-pulse" />
						<div
							className="h-3 rounded bg-muted-foreground/10 animate-pulse"
							style={{ width: `${80 + i * 20}px` }}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

function ActivityMarquee({ activity }: { activity: Array<ActivityEvent> }) {
	noSSR()
	const items = activity.map((e) => getMarqueeItem(e)).filter(Boolean) as Array<{
		icon: React.ReactNode;
		text: string;
		href: string;
		time: string;
	}>;

	if (items.length === 0) return null;

	const content = items.map((item, i) => (
		<Link
			key={i}
			href={item.href}
			className="inline-flex items-center gap-1 shrink-0 hover:text-foreground transition-colors"
		>
			<span className="text-muted-foreground/30">{item.time}</span>
			<span className="text-muted-foreground/50">{item.icon}</span>
			<span>{item.text}</span>
			<span className="text-muted-foreground/15 mx-1">&middot;</span>
		</Link>
	));

	return (
		<div className="shrink-0 relative overflow-hidden border-y border-border">
			<div className="pointer-events-none absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-background to-transparent" />
			<div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-background to-transparent" />
			<div className="flex whitespace-nowrap marquee-track text-[11px] font-mono text-muted-foreground py-2 px-3">
				{content}
				{content}
			</div>
		</div>
	);
}

/* ── Greeting ──────────────────────────────────────────────────────── */

function getGreeting() {
	const h = new Date().getHours();
	if (h < 12) return "Good morning";
	if (h < 18) return "Good afternoon";
	return "Good evening";
}
