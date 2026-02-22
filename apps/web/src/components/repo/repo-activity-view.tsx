"use client";

import { noSSR } from "foxact/no-ssr";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatNumber } from "@/lib/utils";
import type { CommitActivityWeek } from "@/lib/github";

// --- Significant event types ---
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

interface RepoEvent {
	type: string;
	actor: { login: string; avatar_url: string } | null;
	created_at: string;
	org?: { login: string; avatar_url: string };
	repo?: { name: string };
	payload?: {
		action?: string;
		ref?: string;
		ref_type?: string;
		commits?: { sha: string; message: string }[];
		pull_request?: { number: number; title: string };
		issue?: { number: number; title: string };
		comment?: { body: string };
		forkee?: { full_name: string };
		release?: { tag_name: string; name: string };
	};
}

function getEventDescription(
	event: RepoEvent,
	base: string,
): { verb: string; detail: string; href: string | null } {
	const p = event.payload;

	switch (event.type) {
		case "PushEvent": {
			const branch = p?.ref?.replace("refs/heads/", "") ?? "";
			const commitCount = p?.commits?.length ?? 0;
			const firstCommit = p?.commits?.[0];
			const firstMsg = firstCommit?.message?.split("\n")[0] ?? "";
			const commitHref =
				commitCount === 1 && firstCommit?.sha
					? `${base}/commits/${firstCommit.sha.slice(0, 7)}`
					: `${base}/commits`;
			return {
				verb: `pushed ${commitCount} commit${commitCount !== 1 ? "s" : ""} to ${branch}`,
				detail: firstMsg,
				href: commitHref,
			};
		}
		case "PullRequestEvent": {
			const pr = p?.pull_request;
			return {
				verb: `${p?.action ?? "opened"} PR #${pr?.number ?? ""}`,
				detail: pr?.title ?? "",
				href: pr?.number ? `${base}/pulls/${pr.number}` : null,
			};
		}
		case "IssuesEvent": {
			const issue = p?.issue;
			return {
				verb: `${p?.action ?? "opened"} issue #${issue?.number ?? ""}`,
				detail: issue?.title ?? "",
				href: issue?.number ? `${base}/issues/${issue.number}` : null,
			};
		}
		case "IssueCommentEvent": {
			const issue = p?.issue;
			return {
				verb: `commented on #${issue?.number ?? ""}`,
				detail: issue?.title ?? "",
				href: issue?.number ? `${base}/issues/${issue.number}` : null,
			};
		}
		case "PullRequestReviewEvent": {
			const pr = p?.pull_request;
			return {
				verb: `reviewed PR #${pr?.number ?? ""}`,
				detail: pr?.title ?? "",
				href: pr?.number ? `${base}/pulls/${pr.number}` : null,
			};
		}
		case "PullRequestReviewCommentEvent": {
			const pr = p?.pull_request;
			return {
				verb: `commented on PR #${pr?.number ?? ""}`,
				detail: pr?.title ?? "",
				href: pr?.number ? `${base}/pulls/${pr.number}` : null,
			};
		}
		case "CreateEvent":
			return {
				verb: `created ${p?.ref_type ?? "branch"} ${p?.ref ?? ""}`,
				detail: "",
				href:
					p?.ref_type === "branch" && p?.ref
						? `${base}/tree/${p.ref}`
						: null,
			};
		case "DeleteEvent":
			return {
				verb: `deleted ${p?.ref_type ?? "branch"} ${p?.ref ?? ""}`,
				detail: "",
				href: null,
			};
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

interface RepoActivityViewProps {
	owner: string;
	repo: string;
	events: RepoEvent[];
	commitActivity: CommitActivityWeek[];
}

export function RepoActivityView({ owner, repo, events, commitActivity }: RepoActivityViewProps) {
	noSSR();
	const base = `/${owner}/${repo}`;
	const [filter, setFilter] = useState<"all" | "push" | "pr" | "issue">("all");

	const significant = events.filter((e) => SIGNIFICANT_EVENT_TYPES.has(e.type));
	const filtered =
		filter === "all"
			? significant
			: filter === "push"
				? significant.filter((e) => e.type === "PushEvent")
				: filter === "pr"
					? significant.filter((e) =>
							[
								"PullRequestEvent",
								"PullRequestReviewEvent",
								"PullRequestReviewCommentEvent",
							].includes(e.type),
						)
					: significant.filter((e) =>
							[
								"IssuesEvent",
								"IssueCommentEvent",
							].includes(e.type),
						);

	// Commit activity chart
	const weeks = commitActivity.slice(-24);
	const maxVal = Math.max(...weeks.map((w) => w.total), 1);
	const total = weeks.reduce((s, w) => s + w.total, 0);
	const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
	const chartHeight = 64;

	const filters = [
		{ key: "all" as const, label: "All" },
		{ key: "push" as const, label: "Pushes" },
		{ key: "pr" as const, label: "Pull Requests" },
		{ key: "issue" as const, label: "Issues" },
	];

	return (
		<div className="space-y-6">
			{/* Commit activity chart */}
			{weeks.length > 0 && (
				<div className="border border-border/40 rounded-lg p-4">
					<div className="flex items-baseline gap-2 mb-4">
						<h3 className="text-sm font-medium text-foreground">
							Commit Activity
						</h3>
						<span className="text-xs font-mono text-muted-foreground/60">
							{formatNumber(total)} commits in 24 weeks
						</span>
					</div>
					<div
						className="flex items-end gap-[3px]"
						style={{ height: chartHeight }}
					>
						{weeks.map((week, i) => {
							const weekDate = new Date(week.week * 1000);
							return (
								<div
									key={i}
									className="flex-1 relative"
									onMouseEnter={() =>
										setHoveredWeek(i)
									}
									onMouseLeave={() =>
										setHoveredWeek(null)
									}
								>
									<div
										className={cn(
											"w-full rounded-t-[2px] transition-colors",
											week.total ===
												0
												? "bg-muted/40"
												: hoveredWeek ===
													  i
													? "bg-success/90"
													: "bg-success/50",
										)}
										style={{
											height:
												week.total ===
												0
													? 2
													: Math.max(
															3,
															(week.total /
																maxVal) *
																chartHeight,
														),
										}}
									/>
									{hoveredWeek === i && (
										<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap px-2 py-1 text-[9px] font-mono bg-card text-foreground rounded-md shadow-lg border border-border/60">
											{weekDate.toLocaleDateString(
												"en-US",
												{
													month: "short",
													day: "numeric",
												},
											)}{" "}
											—{" "}
											{week.total}{" "}
											commit
											{week.total !==
											1
												? "s"
												: ""}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Filter tabs */}
			<div className="flex items-center gap-1 text-[11px] font-mono">
				{filters.map((f) => (
					<button
						key={f.key}
						onClick={() => setFilter(f.key)}
						className={cn(
							"px-3 py-1 rounded-md transition-colors cursor-pointer",
							filter === f.key
								? "bg-muted text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40",
						)}
					>
						{f.label}
					</button>
				))}
				<span className="text-muted-foreground/40 ml-2">
					{filtered.length} events
				</span>
			</div>

			{/* Event list */}
			<div className="space-y-1">
				{filtered.length === 0 ? (
					<div className="flex items-center justify-center h-32 text-xs font-mono text-muted-foreground/50">
						No events matching filter
					</div>
				) : (
					filtered.map((event, i) => {
						const { verb, detail, href } = getEventDescription(
							event,
							base,
						);
						const inner = (
							<div className="flex items-start gap-3 py-2.5 px-3 rounded-md transition-colors hover:bg-muted/30 group border border-transparent hover:border-border/30">
								{event.actor?.avatar_url ? (
									<Link
										href={`/users/${event.actor.login}`}
										onClick={(e) =>
											e.stopPropagation()
										}
									>
										<Image
											src={
												event
													.actor
													.avatar_url
											}
											alt={
												event
													.actor
													.login
											}
											width={24}
											height={24}
											className="rounded-full mt-0.5 shrink-0 hover:ring-2 hover:ring-foreground/20 transition-shadow"
										/>
									</Link>
								) : (
									<div className="w-6 h-6 rounded-full bg-muted mt-0.5 shrink-0" />
								)}
								<div className="min-w-0 flex-1">
									<p className="text-sm text-foreground/80 leading-relaxed">
										<Link
											href={`/users/${event.actor?.login}`}
											className="font-mono font-medium text-foreground hover:underline"
											onClick={(
												e,
											) =>
												e.stopPropagation()
											}
										>
											{
												event
													.actor
													?.login
											}
										</Link>
										{event.org
											?.login && (
											<>
												{" "}
												<span className="text-muted-foreground/40">
													@
												</span>
												<Link
													href={`/${event.org.login}`}
													className="text-muted-foreground/50 hover:underline"
													onClick={(
														e,
													) =>
														e.stopPropagation()
													}
												>
													{
														event
															.org
															.login
													}
												</Link>
											</>
										)}{" "}
										<span className="text-muted-foreground/60">
											{verb}
										</span>
									</p>
									{detail && (
										<p className="text-xs font-mono text-muted-foreground/50 truncate mt-1">
											{detail}
										</p>
									)}
								</div>
								<span className="text-[10px] font-mono text-muted-foreground/40 shrink-0 mt-1">
									{timeAgo(event.created_at)}
								</span>
							</div>
						);

						return href ? (
							<Link key={i} href={href}>
								{inner}
							</Link>
						) : (
							<div key={i}>{inner}</div>
						);
					})
				)}
			</div>
		</div>
	);
}
