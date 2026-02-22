"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { cn, formatNumber } from "@/lib/utils";
import type { CommitActivityWeek, CheckStatus } from "@/lib/github";
import {
	GitPullRequest,
	CircleDot,
	MessageSquare,
	XCircle,
	Pin,
	GitCommit,
	Link2,
	X,
} from "lucide-react";
import { CheckStatusBadge } from "@/components/pr/check-status-badge";
import {
	unpinFromOverview,
	fetchPinnedItemsForRepo,
} from "@/app/(app)/repos/[owner]/[repo]/pin-actions";
import type { PinnedItem } from "@/lib/pinned-items-store";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";
import { useReadme } from "@/hooks/use-readme";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import {
	fetchOverviewPRs,
	fetchOverviewIssues,
	fetchOverviewCommitActivity,
	fetchOverviewEvents,
	fetchOverviewCIStatus,
} from "@/app/(app)/repos/[owner]/[repo]/overview-actions";

// --- Shared UI primitives ---
function Section({
	title,
	subtitle,
	actions,
	stickyHeader,
	children,
	className,
}: {
	title: string;
	subtitle?: string;
	actions?: React.ReactNode;
	stickyHeader?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("p-4 flex flex-col lg:min-h-0", className)}>
			<div className="flex items-baseline gap-2 mb-4 shrink-0">
				<h3 className="text-sm font-medium text-foreground">{title}</h3>
				{subtitle && (
					<span className="text-[10px] font-mono text-muted-foreground/50 bg-muted/60 px-1.5 py-0.5 rounded">
						{subtitle}
					</span>
				)}
				{actions && <div className="ml-auto">{actions}</div>}
			</div>
			{stickyHeader && <div className="shrink-0">{stickyHeader}</div>}
			<div className="flex-1 min-h-0 lg:overflow-y-auto">{children}</div>
		</div>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<div className="flex items-center justify-center h-24 text-xs font-mono text-muted-foreground/40">
			{message}
		</div>
	);
}

// --- PR / Issue list item ---
function ListItem({
	number,
	title,
	user,
	createdAt,
	href,
	type,
}: {
	number: number;
	title: string;
	user: { login: string; avatar_url: string } | null;
	createdAt: string;
	href: string;
	type: "pr" | "issue";
}) {
	const Icon = type === "pr" ? GitPullRequest : CircleDot;
	return (
		<Link
			href={href}
			className="flex items-start gap-2.5 py-2 group hover:bg-muted -mx-2 px-2 rounded-md transition-colors"
		>
			<Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-success" />
			<div className="min-w-0 flex-1">
				<p className="text-xs text-foreground/80 truncate group-hover:text-foreground transition-colors">
					<span className="font-mono text-muted-foreground/60 mr-1.5">
						#{number}
					</span>
					{title}
				</p>
				<p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 flex items-center gap-1">
					{user?.avatar_url && (
						<Image
							src={user.avatar_url}
							alt={user.login}
							width={14}
							height={14}
							className="rounded-full shrink-0"
						/>
					)}
					{user?.login ?? "unknown"} &middot;{" "}
					{new Date(createdAt).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
					})}
				</p>
			</div>
		</Link>
	);
}

// --- Sortable PR / Issue list ---
type SortKey = "newest" | "oldest" | "comments";

function SortableList({
	title,
	totalCount,
	items,
	type,
	base,
	viewAllHref,
}: {
	title: string;
	totalCount: number;
	items: (PRItem | IssueItem)[];
	type: "pr" | "issue";
	base: string;
	viewAllHref: string;
}) {
	const [sort, setSort] = useState<SortKey>("newest");

	const sorted = [...items].sort((a, b) => {
		if (sort === "oldest")
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		if (sort === "comments") return (b.comments ?? 0) - (a.comments ?? 0);
		return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
	});

	const nextSort = () => {
		const order: SortKey[] = ["newest", "oldest", "comments"];
		setSort(order[(order.indexOf(sort) + 1) % order.length]);
	};
	const sortLabel = sort === "newest" ? "Newest" : sort === "oldest" ? "Oldest" : "Discussed";

	return (
		<Section
			title={title}
			actions={
				items.length > 1 ? (
					<button
						onClick={nextSort}
						className="text-[10px] font-mono text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
					>
						{sortLabel} &darr;
					</button>
				) : undefined
			}
		>
			{items.length === 0 ? (
				<EmptyState
					message={
						type === "pr"
							? "No open pull requests"
							: "No open issues"
					}
				/>
			) : (
				<div className="space-y-0.5">
					{sorted.slice(0, 10).map((item) => (
						<ListItem
							key={item.number}
							number={item.number}
							title={item.title}
							user={item.user}
							createdAt={item.created_at}
							href={`${base}/${type === "pr" ? "pulls" : "issues"}/${item.number}`}
							type={type}
						/>
					))}
					{totalCount > 10 && (
						<Link
							href={viewAllHref}
							className="block text-[10px] font-mono text-muted-foreground/60 hover:text-foreground/60 mt-2 transition-colors"
						>
							View all {totalCount} &rarr;
						</Link>
					)}
				</div>
			)}
		</Section>
	);
}

// --- Activity event helpers ---
function getEventDescription(event: RepoEvent): {
	verb: string;
	detail: string;
	href: string | null;
} {
	const p = event.payload;
	const repoName = event.repo?.name;
	const base = repoName ? `/${repoName}` : "";

	switch (event.type) {
		case "PushEvent": {
			const branch = p?.ref?.replace("refs/heads/", "") ?? "";
			const commitCount = p?.size ?? p?.commits?.length ?? 0;
			const firstCommit = p?.commits?.[0];
			const firstMsg = firstCommit?.message?.split("\n")[0] ?? "";
			const commitHref =
				commitCount === 1 && firstCommit?.sha && base
					? `${base}/commits/${firstCommit.sha.slice(0, 7)}`
					: base
						? `${base}/commits`
						: null;
			const verb =
				commitCount > 0
					? `pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to ${branch}`
					: `pushed to ${branch}`;
			return {
				verb,
				detail: firstMsg,
				href: commitHref,
			};
		}
		case "PullRequestEvent": {
			const pr = p?.pull_request;
			return {
				verb: `${p?.action ?? "opened"} PR #${pr?.number ?? ""}`,
				detail: pr?.title ?? "",
				href: pr?.number && base ? `${base}/pulls/${pr.number}` : null,
			};
		}
		case "IssuesEvent": {
			const issue = p?.issue;
			return {
				verb: `${p?.action ?? "opened"} issue #${issue?.number ?? ""}`,
				detail: issue?.title ?? "",
				href:
					issue?.number && base
						? `${base}/issues/${issue.number}`
						: null,
			};
		}
		case "IssueCommentEvent": {
			const issue = p?.issue;
			return {
				verb: `commented on #${issue?.number ?? ""}`,
				detail: issue?.title ?? "",
				href:
					issue?.number && base
						? `${base}/issues/${issue.number}`
						: null,
			};
		}
		case "PullRequestReviewEvent": {
			const pr = p?.pull_request;
			return {
				verb: `reviewed PR #${pr?.number ?? ""}`,
				detail: pr?.title ?? "",
				href: pr?.number && base ? `${base}/pulls/${pr.number}` : null,
			};
		}
		case "PullRequestReviewCommentEvent": {
			const pr = p?.pull_request;
			return {
				verb: `commented on PR #${pr?.number ?? ""}`,
				detail: pr?.title ?? "",
				href: pr?.number && base ? `${base}/pulls/${pr.number}` : null,
			};
		}
		case "CreateEvent":
			return {
				verb: `created ${p?.ref_type ?? "branch"} ${p?.ref ?? ""}`,
				detail: "",
				href:
					p?.ref_type === "branch" && p?.ref && base
						? `${base}/tree/${p.ref}`
						: null,
			};
		case "DeleteEvent":
			return {
				verb: `deleted ${p?.ref_type ?? "branch"} ${p?.ref ?? ""}`,
				detail: "",
				href: null,
			};
		case "ForkEvent":
			return {
				verb: "forked the repository",
				detail: p?.forkee?.full_name ?? "",
				href: p?.forkee?.full_name ? `/${p.forkee.full_name}` : null,
			};
		case "WatchEvent":
			return { verb: "starred the repository", detail: "", href: null };
		case "ReleaseEvent":
			return {
				verb: `${p?.action ?? "published"} release ${p?.release?.tag_name ?? ""}`,
				detail: p?.release?.name ?? "",
				href: null,
			};
		default:
			return {
				verb: event.type.replace("Event", "").toLowerCase(),
				detail: "",
				href: null,
			};
	}
}

function timeAgo(dateStr: string): string {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// --- Filter out noise (stars, forks, watches) — only keep meaningful dev activity ---
const SIGNIFICANT_EVENT_TYPES = new Set([
	"PushEvent",
	"PullRequestEvent",
	"IssuesEvent",
	"IssueCommentEvent",
	"PullRequestReviewEvent",
	"PullRequestReviewCommentEvent",
	"CreateEvent",
	"DeleteEvent",
	"ReleaseEvent",
]);

function filterSignificantEvents(events: RepoEvent[]): RepoEvent[] {
	return events.filter((e) => SIGNIFICANT_EVENT_TYPES.has(e.type));
}

// --- Activity feed item ---
function ActivityItem({ event }: { event: RepoEvent }) {
	const router = useRouter();
	const { verb, detail, href } = getEventDescription(event);

	const content = (
		<div
			className={cn(
				"flex items-start gap-2 py-1.5 -mx-2 px-2 rounded-md transition-colors hover:bg-muted group",
				href && "cursor-pointer",
			)}
			onClick={href ? () => router.push(href) : undefined}
		>
			{event.actor?.avatar_url ? (
				<Link
					href={`/users/${event.actor.login}`}
					onClick={(e) => e.stopPropagation()}
				>
					<Image
						src={event.actor.avatar_url}
						alt={event.actor.login}
						width={16}
						height={16}
						className="rounded-full mt-0.5 shrink-0 hover:ring-2 hover:ring-foreground/20 transition-shadow"
					/>
				</Link>
			) : (
				<div className="w-4 h-4 rounded-full bg-muted mt-0.5 shrink-0" />
			)}
			<div className="min-w-0 flex-1">
				<p className="text-xs text-foreground/70 leading-relaxed">
					<Link
						href={`/users/${event.actor?.login}`}
						className="font-mono text-foreground/80 hover:underline"
						onClick={(e) => e.stopPropagation()}
					>
						{event.actor?.login}
					</Link>
					{event.org?.login && (
						<>
							{" "}
							<span className="text-muted-foreground/40">
								@
							</span>
							<Link
								href={`/${event.org.login}`}
								className="text-muted-foreground/50 hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								{event.org.login}
							</Link>
						</>
					)}{" "}
					<span className="text-muted-foreground/60">{verb}</span>
				</p>
				{detail && (
					<p className="text-[10px] font-mono text-muted-foreground/50 truncate mt-0.5">
						{detail}
					</p>
				)}
			</div>
			<span className="text-[9px] font-mono text-muted-foreground/40 shrink-0 mt-0.5">
				{timeAgo(event.created_at)}
			</span>
		</div>
	);

	return content;
}

// --- Commit activity graph (weekly, last 16 weeks) ---
function CommitActivityGraph({ data }: { data: CommitActivityWeek[] }) {
	const [hovered, setHovered] = useState<number | null>(null);

	const weeks = data.slice(-16);
	if (weeks.length === 0) return null;

	const maxVal = Math.max(...weeks.map((w) => w.total), 1);
	const total = weeks.reduce((s, w) => s + w.total, 0);
	const chartHeight = 36;

	return (
		<div className="mb-3 pb-3 border-b border-border/20">
			<div className="flex items-center justify-between mb-2">
				<span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider">
					Commits &middot; 16 weeks
				</span>
				<span className="text-[9px] font-mono text-muted-foreground/50">
					{formatNumber(total)} total
				</span>
			</div>
			<div className="flex items-end gap-[3px]" style={{ height: chartHeight }}>
				{weeks.map((week, i) => {
					const isLatest = i === weeks.length - 1;
					const weekDate = new Date(week.week * 1000);
					return (
						<div
							key={i}
							className="flex-1 relative"
							onMouseEnter={() => setHovered(i)}
							onMouseLeave={() => setHovered(null)}
						>
							<div
								className={cn(
									"w-full rounded-t-[2px] rounded-b-[1px] transition-colors",
									week.total === 0
										? "bg-border"
										: hovered === i
											? "bg-success/90"
											: isLatest
												? "bg-success/70"
												: "bg-success/50",
								)}
								style={{
									height:
										week.total === 0
											? 2
											: Math.max(
													3,
													(week.total /
														maxVal) *
														chartHeight,
												),
								}}
							/>
							{hovered === i && (
								<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap px-2 py-1 text-[9px] font-mono bg-card text-foreground rounded-md shadow-lg border border-border/60">
									<span className="text-foreground/80">
										{weekDate.toLocaleDateString(
											"en-US",
											{
												month: "short",
												day: "numeric",
											},
										)}
									</span>
									<span className="text-foreground ml-1.5">
										{week.total} commit
										{week.total !== 1
											? "s"
											: ""}
									</span>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// --- Activity feed with filter ---
const ACTIVITY_COUNT = 15;

function ActivityFeed({
	repoEvents,
	commitActivity,
	base,
}: {
	repoEvents: RepoEvent[];
	commitActivity?: CommitActivityWeek[];
	base: string;
}) {
	const events = filterSignificantEvents(repoEvents);
	const visibleEvents = events.slice(0, ACTIVITY_COUNT);

	return (
		<Section
			title="Recent Activity"
			subtitle={`${events.length}`}
			className="flex flex-col"
			stickyHeader={
				commitActivity && commitActivity.length > 0 ? (
					<CommitActivityGraph data={commitActivity} />
				) : undefined
			}
		>
			{events.length === 0 ? (
				<EmptyState message="No recent activity" />
			) : (
				<>
					<div className="space-y-0.5 flex-1">
						{visibleEvents.map((event, i) => (
							<ActivityItem key={i} event={event} />
						))}
					</div>
					{events.length > ACTIVITY_COUNT && (
						<Link
							href={`${base}/activity`}
							className="block text-[10px] font-mono text-muted-foreground/60 hover:text-foreground/60 mt-3 pt-2 border-t border-border/20 transition-colors text-center shrink-0"
						>
							View all activity &rarr;
						</Link>
					)}
				</>
			)}
		</Section>
	);
}

// --- Types ---
interface RepoEvent {
	type: string;
	actor: { login: string; avatar_url: string } | null;
	created_at: string;
	repo?: { name: string };
	org?: { login: string };
	payload?: {
		action?: string;
		ref?: string;
		ref_type?: string;
		size?: number;
		commits?: { sha: string; message: string }[];
		pull_request?: { number: number; title: string };
		issue?: { number: number; title: string };
		comment?: { body: string };
		forkee?: { full_name: string };
		release?: { tag_name: string; name: string };
	};
}

interface RepoData {
	description?: string;
	topics?: string[];
	stargazers_count?: number;
	forks_count?: number;
	subscribers_count?: number;
	watchers_count?: number;
}

interface PRItem {
	number: number;
	title: string;
	user: { login: string; avatar_url: string } | null;
	created_at: string;
	pull_request?: unknown;
	comments: number;
	draft?: boolean;
}

interface IssueItem {
	number: number;
	title: string;
	user: { login: string; avatar_url: string } | null;
	created_at: string;
	pull_request?: unknown;
	comments: number;
	reactions?: { total_count: number };
	labels?: Array<{ name?: string; color?: string }>;
}

// --- Highlighted Activity Ticker ---
interface HotItem {
	type: "pr" | "issue";
	number: number;
	title: string;
	user: { login: string; avatar_url: string } | null;
	comments: number;
	score: number;
	href: string;
}

function computeHotItems(prs: PRItem[], issues: IssueItem[], base: string): HotItem[] {
	const fromPRs: HotItem[] = prs.map((pr) => ({
		type: "pr" as const,
		number: pr.number,
		title: pr.title,
		user: pr.user,
		comments: pr.comments ?? 0,
		score: (pr.comments ?? 0) * 2,
		href: `${base}/pulls/${pr.number}`,
	}));
	const fromIssues: HotItem[] = issues
		.filter((i) => !i.pull_request)
		.map((issue) => ({
			type: "issue" as const,
			number: issue.number,
			title: issue.title,
			user: issue.user,
			comments: issue.comments ?? 0,
			score: (issue.comments ?? 0) * 2 + (issue.reactions?.total_count ?? 0),
			href: `${base}/issues/${issue.number}`,
		}));
	return [...fromPRs, ...fromIssues].sort((a, b) => b.score - a.score).slice(0, 6);
}

function TickerCard({ item }: { item: HotItem }) {
	const Icon = item.type === "pr" ? GitPullRequest : CircleDot;
	return (
		<Link
			href={item.href}
			className="w-full shrink-0 flex items-start gap-3 px-4 py-3 group hover:bg-muted transition-colors"
		>
			<Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-success" />
			<div className="min-w-0 flex-1">
				<p className="text-xs text-foreground/80 truncate group-hover:text-foreground transition-colors">
					<span className="font-mono text-muted-foreground/60 mr-1.5">
						#{item.number}
					</span>
					{item.title}
				</p>
				<div className="flex items-center gap-2 mt-1">
					{item.user?.avatar_url && (
						<Image
							src={item.user.avatar_url}
							alt={item.user.login}
							width={14}
							height={14}
							className="rounded-full shrink-0"
						/>
					)}
					<span className="text-[10px] font-mono text-muted-foreground/50 truncate">
						{item.user?.login ?? "unknown"}
					</span>
					{item.comments > 0 && (
						<span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/50 ml-auto shrink-0">
							<MessageSquare className="w-3 h-3" />
							{item.comments}
						</span>
					)}
				</div>
			</div>
		</Link>
	);
}

const PINNED_TYPE_ICONS: Record<string, typeof GitPullRequest> = {
	pr: GitPullRequest,
	issue: CircleDot,
	commit: GitCommit,
	page: Link2,
	link: Link2,
};

function PinnedItemsSection({
	items,
	owner,
	repo,
}: {
	items: PinnedItem[];
	owner: string;
	repo: string;
}) {
	const [localItems, setLocalItems] = useState(items);
	const { emit } = useMutationEvents();

	useMutationSubscription(["pin:added", "pin:removed"], (event: MutationEvent) => {
		if (!isRepoEvent(event, owner, repo)) return;
		if (event.type === "pin:added") {
			setLocalItems((prev) => {
				if (prev.some((i) => i.url === event.url)) return prev;
				return [
					{
						id: crypto.randomUUID(),
						userId: "",
						owner,
						repo,
						url: event.url,
						title: event.title,
						itemType: event.itemType,
						pinnedAt: new Date().toISOString(),
					},
					...prev,
				];
			});
		} else if (event.type === "pin:removed") {
			setLocalItems((prev) => prev.filter((i) => i.url !== event.url));
		}
	});

	async function handleUnpin(url: string) {
		setLocalItems((prev) => prev.filter((i) => i.url !== url));
		await unpinFromOverview(owner, repo, url);
		emit({ type: "pin:removed", owner, repo, url });
	}

	if (localItems.length === 0) return null;

	return (
		<div className="border border-border/40 rounded-md overflow-hidden">
			<div className="flex items-center gap-2 px-4 pt-3 pb-1">
				<Pin className="w-3 h-3 text-muted-foreground/60" />
				<h3 className="text-sm font-medium text-foreground">Pinned</h3>
				<span className="text-[10px] font-mono text-muted-foreground/50 bg-muted/60 px-1.5 py-0.5 rounded">
					{localItems.length}
				</span>
			</div>
			<div className="px-2 pb-2 max-h-[280px] overflow-y-auto">
				{localItems.map((item) => {
					const Icon = PINNED_TYPE_ICONS[item.itemType] ?? Link2;
					return (
						<div
							key={item.id}
							className="flex items-center gap-2.5 px-2 py-1.5 group hover:bg-muted rounded-md transition-colors"
						>
							<Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
							<Link
								href={item.url}
								className="text-xs text-foreground/80 truncate flex-1 hover:text-foreground transition-colors"
							>
								{item.title}
							</Link>
							<button
								onClick={() =>
									handleUnpin(item.url)
								}
								className="p-0.5 text-muted-foreground/30 hover:text-foreground opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
								title="Unpin"
							>
								<X className="w-3 h-3" />
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function CIStatusCard({
	ciStatus,
	owner,
	repo,
	defaultBranch,
}: {
	ciStatus: CheckStatus;
	owner: string;
	repo: string;
	defaultBranch: string;
}) {
	const hasFails = ciStatus.failure > 0;
	const failedChecks = ciStatus.checks.filter(
		(c) => c.state === "failure" || c.state === "error",
	);
	const maxShown = 5;
	const shownFailed = failedChecks.slice(0, maxShown);
	const remaining = failedChecks.length - maxShown;

	return (
		<div
			className={cn(
				"rounded-md p-4",
				hasFails && "border-l-2 border-l-destructive/50",
			)}
		>
			<div className="flex items-center gap-3">
				<CheckStatusBadge
					checkStatus={ciStatus}
					owner={owner}
					repo={repo}
					showChevron
				/>
				<span className="text-xs text-foreground/70">
					{ciStatus.state === "success"
						? `All checks passed on ${defaultBranch}`
						: ciStatus.state === "pending"
							? `Checks in progress on ${defaultBranch}`
							: `${ciStatus.failure} check${ciStatus.failure !== 1 ? "s" : ""} failed on ${defaultBranch}`}
				</span>
			</div>

			{hasFails && shownFailed.length > 0 && (
				<div className="mt-3 space-y-1.5 pl-1">
					{shownFailed.map((check, i) => (
						<div
							key={`${check.name}-${i}`}
							className="flex items-center gap-2 text-xs"
						>
							<XCircle className="w-3 h-3 text-destructive shrink-0" />
							<span className="font-mono text-[11px] text-foreground/70 truncate">
								{check.name}
							</span>
							{check.runId ? (
								<Link
									href={`/${owner}/${repo}/actions/${check.runId}`}
									className="ml-auto shrink-0 text-[10px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors"
								>
									View →
								</Link>
							) : check.url ? (
								<a
									href={check.url}
									target="_blank"
									rel="noopener noreferrer"
									className="ml-auto shrink-0 text-[10px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors"
								>
									View →
								</a>
							) : null}
						</div>
					))}
					{remaining > 0 && (
						<p className="text-[10px] font-mono text-muted-foreground/50 pl-5">
							and {remaining} more
						</p>
					)}
				</div>
			)}
		</div>
	);
}

function HighlightedActivityTicker({ items }: { items: HotItem[] }) {
	const [activeIndex, setActiveIndex] = useState(0);
	return (
		<div className="border border-dashed border-border/40 rounded-md overflow-hidden">
			<div className="flex items-center justify-between px-4 pt-3 pb-1">
				<h3 className="text-sm font-medium text-foreground">
					Highlighted Activity
				</h3>
				{items.length > 1 && (
					<div className="flex items-center gap-1">
						{items.map((_, i) => (
							<button
								key={i}
								onClick={() => setActiveIndex(i)}
								className={cn(
									"h-1.5 rounded-full transition-all cursor-pointer",
									i === activeIndex
										? "w-4 bg-foreground/50"
										: "w-1.5 bg-foreground/15 hover:bg-foreground/25",
								)}
							/>
						))}
					</div>
				)}
			</div>
			<div className="overflow-hidden">
				<div
					className="flex transition-transform duration-500 ease-in-out"
					style={{ transform: `translateX(-${activeIndex * 100}%)` }}
				>
					{items.map((item) => (
						<TickerCard
							key={`${item.type}-${item.number}`}
							item={item}
						/>
					))}
				</div>
			</div>
		</div>
	);
}


export interface RepoOverviewProps {
	owner: string;
	repo: string;
	repoData: RepoData;
	isMaintainer: boolean;
	openPRCount?: number;
	openIssueCount?: number;
	defaultBranch?: string;
	initialReadmeHtml?: string | null;
	initialPRs?: PRItem[] | null;
	initialIssues?: IssueItem[] | null;
	initialEvents?: RepoEvent[] | null;
	initialCommitActivity?: CommitActivityWeek[] | null;
	initialCIStatus?: CheckStatus | null;
	initialPinnedItems?: PinnedItem[] | null;
}

export function RepoOverview({
	owner,
	repo,
	repoData: _repoData,
	isMaintainer,
	openPRCount,
	openIssueCount,
	defaultBranch,
	initialReadmeHtml,
	initialPRs,
	initialIssues,
	initialEvents,
	initialCommitActivity,
	initialCIStatus,
	initialPinnedItems,
}: RepoOverviewProps) {
	const base = `/${owner}/${repo}`;
	const branch = defaultBranch ?? "main";

	const { data: openPRs = [] } = useQuery({
		queryKey: ["overview-prs", owner, repo],
		queryFn: () => fetchOverviewPRs(owner, repo),
		initialData: initialPRs ?? undefined,
		enabled: isMaintainer,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	const { data: openIssues = [] } = useQuery({
		queryKey: ["overview-issues", owner, repo],
		queryFn: () => fetchOverviewIssues(owner, repo),
		initialData: initialIssues ?? undefined,
		enabled: isMaintainer,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	const { data: commitActivity } = useQuery({
		queryKey: ["overview-commit-activity", owner, repo],
		queryFn: () => fetchOverviewCommitActivity(owner, repo),
		initialData: initialCommitActivity ?? undefined,
		enabled: isMaintainer,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	const { data: repoEvents } = useQuery({
		queryKey: ["overview-events", owner, repo],
		queryFn: () => fetchOverviewEvents(owner, repo),
		initialData: initialEvents ?? undefined,
		enabled: isMaintainer,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	const { data: ciStatus } = useQuery({
		queryKey: ["overview-ci", owner, repo, branch],
		queryFn: () => fetchOverviewCIStatus(owner, repo, branch),
		initialData: initialCIStatus ?? undefined,
		enabled: isMaintainer,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	const { data: pinnedItems } = useQuery({
		queryKey: ["pinned-items", owner, repo],
		queryFn: () => fetchPinnedItemsForRepo(owner, repo),
		initialData: initialPinnedItems ?? undefined,
		enabled: isMaintainer,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	const hotItems = isMaintainer ? computeHotItems(openPRs, openIssues, base) : [];

	if (isMaintainer) {
		return (
			<div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0 pb-4">
				<div className="shrink-0 flex flex-col gap-4">
					{ciStatus && ciStatus.total > 0 && (
						<CIStatusCard
							ciStatus={ciStatus}
							owner={owner}
							repo={repo}
							defaultBranch={branch}
						/>
					)}
					{pinnedItems && pinnedItems.length > 0 && (
						<PinnedItemsSection
							items={pinnedItems}
							owner={owner}
							repo={repo}
						/>
					)}
					{hotItems.length > 0 && (
						<HighlightedActivityTicker items={hotItems} />
					)}
				</div>

				<div
					className={cn(
						"grid grid-cols-1 gap-4 lg:flex-1 lg:min-h-0 lg:grid-rows-1",
						openIssues.length > 0
							? "lg:grid-cols-3"
							: "lg:grid-cols-2",
					)}
				>
					<ActivityFeed
						repoEvents={repoEvents ?? []}
						commitActivity={commitActivity}
						base={base}
					/>

					<SortableList
						title="Open PRs"
						totalCount={openPRCount ?? openPRs.length}
						items={openPRs}
						type="pr"
						base={base}
						viewAllHref={`${base}/pulls`}
					/>

					{openIssues.length > 0 && (
						<SortableList
							title="Open Issues"
							totalCount={
								openIssueCount ?? openIssues.length
							}
							items={openIssues}
							type="issue"
							base={base}
							viewAllHref={`${base}/issues`}
						/>
					)}
				</div>
			</div>
		);
	}

	const { data: readmeHtml } = useReadme(
		owner,
		repo,
		branch,
		initialReadmeHtml ?? null,
	);

	return (
		<div className="space-y-4 pb-4">
			{readmeHtml && (
				<div className="rounded-md border border-border/40 overflow-hidden">
					<div className="px-6 py-5">
						<MarkdownCopyHandler>
							<div
								className="ghmd"
								dangerouslySetInnerHTML={{
									__html: readmeHtml,
								}}
							/>
						</MarkdownCopyHandler>
					</div>
				</div>
			)}
		</div>
	);
}
