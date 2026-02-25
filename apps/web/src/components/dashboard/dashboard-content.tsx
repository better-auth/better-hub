"use client";

import { noSSR } from "foxact/no-ssr";
import { Suspense, useEffect, useState, useCallback, useTransition, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
	Check,
	Loader2,
	Pin,
	PinOff,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { toInternalUrl, getLanguageColor } from "@/lib/github-utils";
import { RecentlyViewed } from "./recently-viewed";
import { CreateRepoDialog } from "@/components/repo/create-repo-dialog";
import { markNotificationDone } from "@/app/(app)/repos/actions";
import { getPinnedRepos, togglePinRepo, unpinRepo, reorderPinnedRepos, type PinnedRepo } from "@/lib/pinned-repos";
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
	const greeting = getGreeting();
	const today = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	});

	const hasWork =
		reviewRequests.items.length > 0 ||
		myOpenPRs.items.length > 0 ||
		myIssues.items.length > 0;

	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");
	const validTabs: TabKey[] = ["reviews", "prs", "issues", "notifs"];
	const initialTab: TabKey = validTabs.includes(tabParam as TabKey)
		? (tabParam as TabKey)
		: "reviews";
	const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

	const handleStatClick = useCallback((tab: TabKey) => {
		setActiveTab(tab);
		const url = new URL(window.location.href);
		if (tab === "reviews") {
			url.searchParams.delete("tab");
		} else {
			url.searchParams.set("tab", tab);
		}
		window.history.replaceState(null, "", url.toString());
		document.getElementById("work-tabs")?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
		});
	}, []);

	return (
		<div className="flex flex-col flex-1 min-h-0 w-full">
			{/* Header */}
			<div className="shrink-0 pb-3">
				<h1 className="text-sm font-medium" suppressHydrationWarning>
					{greeting}, {user.name || user.login}
				</h1>
				<p
					className="text-[11px] text-muted-foreground font-mono"
					suppressHydrationWarning
				>
					{today}
				</p>
			</div>

			<ExtensionBanner />

			{/* Two-column layout */}
			<div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 pb-2">
				{/* Left — overview + work items */}
				<div className="lg:w-1/2 lg:min-h-0 lg:overflow-hidden flex flex-col gap-3 lg:pr-2">
					{/* Stats */}
					<div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
						<Stat
							icon={<Eye className="w-3.5 h-3.5" />}
							label="Needs review"
							value={reviewRequests.total_count}
							accent={reviewRequests.total_count > 0}
							active={activeTab === "reviews"}
							onClick={() => handleStatClick("reviews")}
						/>
						<Stat
							icon={
								<GitPullRequest className="w-3.5 h-3.5" />
							}
							label="Open PRs"
							value={myOpenPRs.total_count}
							accent={myOpenPRs.total_count > 0}
							active={activeTab === "prs"}
							onClick={() => handleStatClick("prs")}
						/>
						<Stat
							icon={<CircleDot className="w-3.5 h-3.5" />}
							label="Assigned Issues"
							value={myIssues.total_count}
							accent={myIssues.total_count > 0}
							active={activeTab === "issues"}
							onClick={() => handleStatClick("issues")}
						/>
						<Stat
							icon={<Bell className="w-3.5 h-3.5" />}
							label="Notifs"
							value={
								notifications.filter(
									(n) => n.unread,
								).length
							}
							accent={
								notifications.filter(
									(n) => n.unread,
								).length > 0
							}
							active={activeTab === "notifs"}
							onClick={() => handleStatClick("notifs")}
						/>
					</div>

					{/* Tabbed work panel */}
					<WorkTabs
						reviewRequests={reviewRequests}
						myOpenPRs={myOpenPRs}
						myIssues={myIssues}
						notifications={notifications}
						hasWork={hasWork}
						activeTab={activeTab}
						activity={activity ?? []}
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
				className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
			>
				<X className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}
type TabKey = "reviews" | "prs" | "issues" | "notifs";

function WorkTabs({
	reviewRequests,
	myOpenPRs,
	myIssues,
	notifications,
	hasWork,
	activeTab,
	activity,
}: {
	reviewRequests: SearchResult<IssueItem>;
	myOpenPRs: SearchResult<IssueItem>;
	myIssues: SearchResult<IssueItem>;
	notifications: Array<NotificationItem>;
	hasWork: boolean;
	activeTab: TabKey;
	activity: Array<ActivityEvent>;
}) {
	const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
	const visibleNotifs = notifications.filter((n) => !doneIds.has(n.id));

	if (!hasWork && activeTab !== "notifs") {
		return (
			<div className="flex-1 min-h-0 border border-border py-12 text-center">
				<CheckCircle2 className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
				<p className="text-xs text-muted-foreground font-mono">
					Nothing needs your attention
				</p>
			</div>
		);
	}

	return (
		<div
			id="work-tabs"
			className="flex-1 min-h-0 flex flex-col border border-border overflow-y-auto"
		>
			{/* Activity marquee */}
			<Suspense fallback={<ActivityMarqueeSkeleton />}>
				<ActivityMarquee activity={activity ?? []} />
			</Suspense>
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
						<ItemRow key={issue.id} item={issue} type="issue" />
					))
				) : (
					<EmptyTab message="No assigned issues" />
				))}
			{activeTab === "notifs" &&
				(visibleNotifs.length > 0 ? (
					visibleNotifs.map((notif) => (
						<NotificationRow
							key={notif.id}
							notif={notif}
							onDone={(id) =>
								setDoneIds(
									(prev) =>
										new Set([
											...prev,
											id,
										]),
								)
							}
						/>
					))
				) : (
					<EmptyTab message="No notifications" />
				))}
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

const reasonLabels: Record<string, string> = {
	assign: "Assigned",
	author: "Author",
	comment: "Comment",
	ci_activity: "CI",
	invitation: "Invited",
	manual: "Subscribed",
	mention: "Mentioned",
	review_requested: "Review requested",
	security_alert: "Security",
	state_change: "State change",
	subscribed: "Watching",
	team_mention: "Team mention",
};

function getNotificationHref(notif: NotificationItem): string {
	const repo = notif.repository.full_name;
	if (!notif.subject.url) return `/${repo}`;
	const match = notif.subject.url.match(/repos\/[^/]+\/[^/]+\/(pulls|issues)\/(\d+)/);
	if (match) {
		const type = match[1] === "pulls" ? "pulls" : "issues";
		return `/${repo}/${type}/${match[2]}`;
	}
	return `/${repo}`;
}

function NotificationRow({
	notif,
	onDone,
}: {
	notif: NotificationItem;
	onDone: (id: string) => void;
}) {
	const href = getNotificationHref(notif);
	const repo = notif.repository.full_name;
	const [marking, startMarking] = useTransition();
	const icon =
		notif.subject.type === "PullRequest" ? (
			<GitPullRequest className="w-3.5 h-3.5" />
		) : notif.subject.type === "Issue" ? (
			<CircleDot className="w-3.5 h-3.5" />
		) : (
			<Bell className="w-3.5 h-3.5" />
		);

	return (
		<div className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/2 transition-colors border-b border-border/60 last:border-b-0">
			<span className="text-muted-foreground/70 shrink-0">{icon}</span>
			<Link href={href} className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					{notif.unread && (
						<span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
					)}
					<span className="text-sm truncate group-hover:text-foreground transition-colors">
						{notif.subject.title}
					</span>
				</div>
				<div className="flex items-center gap-2 mt-px">
					<span className="text-[11px] font-mono text-muted-foreground/70">
						{repo}
					</span>
					<span
						className={cn(
							"text-[9px] font-mono px-1 py-0.5 border",
							notif.reason === "review_requested"
								? "border-warning/30 text-warning"
								: notif.reason === "mention" ||
									  notif.reason ===
											"team_mention"
									? "border-foreground/20 text-foreground/60"
									: "border-border text-muted-foreground",
						)}
					>
						{reasonLabels[notif.reason] || notif.reason}
					</span>
					<span className="text-[11px] text-muted-foreground/50">
						<TimeAgo date={notif.updated_at} />
					</span>
				</div>
			</Link>
			<button
				disabled={marking}
				onClick={() => {
					startMarking(async () => {
						const res = await markNotificationDone(notif.id);
						if (res.success) onDone(notif.id);
					});
				}}
				className="shrink-0 p-1 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-foreground/70 transition-all cursor-pointer disabled:opacity-100"
				title="Mark as done"
			>
				{marking ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
				) : (
					<Check className="w-3.5 h-3.5" />
				)}
			</button>
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
	const [tab, setTab] = useState<"pinned" | "repos" | "trending">("repos");
	const [pinnedRepos, setPinnedRepos] = useState<PinnedRepo[]>([]);
	const [dragIndex, setDragIndex] = useState<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

	useEffect(() => {
		const pinned = getPinnedRepos();
		setPinnedRepos(pinned);
		if (pinned.length > 0) {
			setTab("pinned");
		}
	}, []);

	const pinnedSet = useMemo(
		() => new Set(pinnedRepos.map((r) => r.full_name)),
		[pinnedRepos],
	);

	const handleTogglePin = useCallback((repo: RepoItem) => {
		const updated = togglePinRepo({
			id: repo.id,
			full_name: repo.full_name,
			name: repo.name,
			owner: repo.owner,
			language: repo.language,
			stargazers_count: repo.stargazers_count,
			private: repo.private,
		});
		setPinnedRepos(updated);
	}, []);

	const handleUnpin = useCallback((fullName: string) => {
		const updated = unpinRepo(fullName);
		setPinnedRepos(updated);
	}, []);

	const handleDragStart = useCallback((index: number) => {
		setDragIndex(index);
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
		e.preventDefault();
		setDragOverIndex(index);
	}, []);

	const handleDragEnd = useCallback(() => {
		if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
			const updated = reorderPinnedRepos(dragIndex, dragOverIndex);
			setPinnedRepos(updated);
		}
		setDragIndex(null);
		setDragOverIndex(null);
	}, [dragIndex, dragOverIndex]);

	return (
		<section className="flex-1 border border-border flex flex-col min-h-0">
			<div className="shrink-0 flex items-center border-b border-border overflow-x-auto no-scrollbar">
				{pinnedRepos.length > 0 && (
					<button
						onClick={() => setTab("pinned")}
						className={cn(
							"flex items-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
							tab === "pinned"
								? "text-foreground bg-muted/50 dark:bg-white/[0.04]"
								: "text-muted-foreground hover:text-foreground/60",
						)}
					>
						<Pin className="w-3 h-3" />
						Pinned
					</button>
				)}
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
				{(tab === "repos" || tab === "pinned") && (
					<div className="ml-auto mr-3">
						<CreateRepoDialog />
					</div>
				)}
			</div>
			<div className="overflow-y-auto">
				{tab === "pinned" &&
					pinnedRepos.map((repo, index) => (
						<PinnedRepoRow
							key={repo.id}
							repo={repo}
							index={index}
							onUnpin={handleUnpin}
							onDragStart={handleDragStart}
							onDragOver={handleDragOver}
							onDragEnd={handleDragEnd}
							isDragging={dragIndex === index}
							isDragOver={dragOverIndex === index && dragIndex !== index}
						/>
					))}
				{tab === "repos" &&
					repos
						.slice(0, 10)
						.map((repo) => (
							<RepoRow
								key={repo.id}
								repo={repo}
								isPinned={pinnedSet.has(
									repo.full_name,
								)}
								onTogglePin={handleTogglePin}
							/>
						))}
				{tab === "trending" &&
					trending.map((repo) => (
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
	active,
	onClick,
	href,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
	accent?: boolean;
	active?: boolean;
	onClick?: () => void;
	href?: string;
}) {
	const content = (
		<>
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
								: "text-muted-foreground",
						)}
					>
						{icon}
					</span>
					<span
						className={cn(
							"text-[10px] font-mono uppercase tracking-wider",
							active
								? "text-foreground"
								: "text-muted-foreground/60",
						)}
					>
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
		</>
	);

	const className = cn(
		"stat-card relative overflow-hidden rounded-lg px-3 py-3 text-left w-full",
		"bg-gradient-to-br from-black/[0.02] via-black/[0.01] to-transparent dark:from-white/[0.04] dark:via-white/[0.02] dark:to-transparent",
		"transition-all duration-150 cursor-pointer",
		"hover:border-black/[0.08] dark:hover:border-white/[0.12]",
		"hover:bg-gradient-to-br hover:from-black/[0.04] hover:via-black/[0.02] dark:hover:from-white/[0.06] dark:hover:via-white/[0.03]",
		"dark:active:from-white/[0.03] dark:active:via-white/[0.02]",
		active ? "border border-primary/20!" : "border border-border/50!",
	);

	if (href) {
		return (
			<Link href={href} className={className}>
				{content}
			</Link>
		);
	}

	return (
		<button type="button" onClick={onClick} className={className}>
			{content}
		</button>
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

function RepoRow({
	repo,
	isPinned,
	onTogglePin,
}: {
	repo: RepoItem;
	isPinned?: boolean;
	onTogglePin?: (repo: RepoItem) => void;
}) {
	return (
		<div className="group flex items-center gap-2.5 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/40 last:border-b-0">
			<Link
				href={`/${repo.full_name}`}
				className="flex items-center gap-2.5 flex-1 min-w-0"
			>
				<Image
					src={repo.owner.avatar_url}
					alt={repo.owner.login}
					width={18}
					height={18}
					className="rounded-sm shrink-0 w-[18px] h-[18px] object-cover"
				/>
				<span className="text-xs font-mono truncate group-hover:text-foreground transition-colors min-w-0">
					<span className="text-muted-foreground">
						{repo.owner.login}
					</span>
					<span className="text-muted-foreground/25 mx-0.5">/</span>
					<span className="font-medium">{repo.name}</span>
				</span>
				{repo.private && (
					<Lock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
				)}
				<div className="flex items-center gap-2.5 ml-auto shrink-0 text-[10px] text-muted-foreground/45">
					{repo.language && (
						<span className="flex items-center gap-1 font-mono">
							<span
								className="w-1.5 h-1.5 rounded-full shrink-0"
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
				</div>
			</Link>
			{onTogglePin && (
				<button
					onClick={(e) => {
						e.preventDefault();
						onTogglePin(repo);
					}}
					className={cn(
						"shrink-0 p-1 transition-all cursor-pointer",
						isPinned
							? "text-foreground/60 hover:text-foreground"
							: "text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-foreground/60",
					)}
					title={isPinned ? "Unpin repository" : "Pin repository"}
				>
					{isPinned ? (
						<PinOff className="w-3.5 h-3.5" />
					) : (
						<Pin className="w-3.5 h-3.5" />
					)}
				</button>
			)}
		</div>
	);
}

/* ── PinnedRepoRow ─────────────────────────────────────────────────── */

function PinnedRepoRow({
	repo,
	index,
	onUnpin,
	onDragStart,
	onDragOver,
	onDragEnd,
	isDragging,
	isDragOver,
}: {
	repo: PinnedRepo;
	index: number;
	onUnpin: (fullName: string) => void;
	onDragStart: (index: number) => void;
	onDragOver: (e: React.DragEvent, index: number) => void;
	onDragEnd: () => void;
	isDragging: boolean;
	isDragOver: boolean;
}) {
	return (
		<div
			draggable
			onDragStart={() => onDragStart(index)}
			onDragOver={(e) => onDragOver(e, index)}
			onDragEnd={onDragEnd}
			className={cn(
				"group flex items-center gap-2.5 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/40 last:border-b-0 cursor-grab active:cursor-grabbing",
				isDragging && "opacity-50",
				isDragOver && "border-t-2 border-t-primary",
			)}
		>
			<Link
				href={`/${repo.full_name}`}
				className="flex items-center gap-2.5 flex-1 min-w-0"
				draggable={false}
			>
				<Image
					src={repo.owner.avatar_url}
					alt={repo.owner.login}
					width={18}
					height={18}
					className="rounded-sm shrink-0 w-[18px] h-[18px] object-cover"
					draggable={false}
				/>
				<span className="text-xs font-mono truncate group-hover:text-foreground transition-colors min-w-0">
					<span className="text-muted-foreground">
						{repo.owner.login}
					</span>
					<span className="text-muted-foreground/25 mx-0.5">/</span>
					<span className="font-medium">{repo.name}</span>
				</span>
				{repo.private && (
					<Lock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
				)}
				<div className="flex items-center gap-2.5 ml-auto shrink-0 text-[10px] text-muted-foreground/45">
					{repo.language && (
						<span className="flex items-center gap-1 font-mono">
							<span
								className="w-1.5 h-1.5 rounded-full shrink-0"
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
				</div>
			</Link>
			<button
				onClick={(e) => {
					e.preventDefault();
					onUnpin(repo.full_name);
				}}
				className="shrink-0 p-1 text-foreground/60 hover:text-foreground transition-all cursor-pointer"
				title="Unpin repository"
				draggable={false}
			>
				<PinOff className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}

/* ── TrendingRow ──────────────────────────────────────────────────── */

function TrendingRow({ repo }: { repo: TrendingRepoItem }) {
	return (
		<Link
			href={`/${repo.full_name}`}
			className="group flex items-start gap-2.5 px-4 py-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/40 last:border-b-0"
		>
			<Image
				src={repo.owner?.avatar_url ?? ""}
				alt={repo.owner?.login ?? ""}
				width={18}
				height={18}
				className="rounded-sm shrink-0 mt-0.5 w-[18px] h-[18px] object-cover"
			/>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono truncate group-hover:text-foreground transition-colors">
						<span className="text-muted-foreground">
							{repo.owner?.login}
						</span>
						<span className="text-muted-foreground/25 mx-0.5">
							/
						</span>
						<span className="font-medium">{repo.name}</span>
					</span>
					<div className="flex items-center gap-2 ml-auto shrink-0 text-[10px] text-muted-foreground/45">
						{repo.language && (
							<span className="flex items-center gap-1 font-mono">
								<span
									className="w-1.5 h-1.5 rounded-full shrink-0"
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
				{repo.description && (
					<p className="text-[10px] text-muted-foreground truncate mt-0.5">
						{repo.description}
					</p>
				)}
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
	noSSR();
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
		<div className="shrink-0 relative overflow-hidden border-b">
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
