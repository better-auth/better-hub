import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, GitCommitHorizontal, GitPullRequest, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import type { IssueTimelineEvent } from "@/lib/github";
import { UserTooltip } from "@/components/shared/user-tooltip";

interface IssueTimelineEventsProps {
	events: IssueTimelineEvent[];
	owner: string;
	repo: string;
	isLastSegment?: boolean;
}

export function IssueTimelineEvents({
	events,
	owner,
	repo,
	isLastSegment = false,
}: IssueTimelineEventsProps) {
	if (events.length === 0) return null;

	const crossRefPRs = events
		.filter((e) => e.event === "cross-referenced" && e.source?.type === "pull_request")
		.map((e) => e.source!);

	return (
		<div className="relative py-1 -mt-2 mb-2">
			{/* Timeline connector line - extends beyond bounds to connect with adjacent segments */}
			<div
				className={cn(
					"absolute left-[19px] -top-5 w-px bg-border/50",
					isLastSegment ? "bottom-0" : "-bottom-4",
				)}
			/>

			<div className="space-y-1 pl-[52px] py-2">
				{events.map((event) => (
					<TimelineEventItem
						key={event.id}
						event={event}
						owner={owner}
						repo={repo}
						linkedPRs={crossRefPRs}
					/>
				))}
			</div>
		</div>
	);
}

type PRSource = NonNullable<IssueTimelineEvent["source"]>;

function TimelineEventItem({
	event,
	owner,
	repo,
	linkedPRs,
	issueStateReason,
}: {
	event: IssueTimelineEvent;
	owner: string;
	repo: string;
	linkedPRs: PRSource[];
	issueStateReason?: string | null;
}) {
	if (event.event === "closed") {
		const closingPR = linkedPRs.find((pr) => pr.merged);
		return (
			<ClosedEvent
				event={event}
				owner={owner}
				repo={repo}
				closingPR={closingPR}
				issueStateReason={issueStateReason}
			/>
		);
	}

	if (event.event === "reopened") {
		return <ReopenedEvent event={event} />;
	}

	if (event.event === "referenced") {
		return <ReferencedEvent event={event} owner={owner} repo={repo} />;
	}

	if (event.event === "cross-referenced") {
		return <CrossReferencedEvent event={event} owner={owner} repo={repo} />;
	}

	if (event.event === "committed") {
		return <CommittedEvent event={event} owner={owner} repo={repo} />;
	}

	return null;
}

function UserAvatar({ actor }: { actor: { login: string; avatar_url: string } | null }) {
	if (!actor) {
		return <div className="w-4 h-4 rounded-full bg-muted shrink-0" />;
	}

	return (
		<UserTooltip username={actor.login}>
			<Link href={`/users/${actor.login}`} className="shrink-0">
				<Image
					src={actor.avatar_url}
					alt={actor.login}
					width={16}
					height={16}
					className="rounded-full"
				/>
			</Link>
		</UserTooltip>
	);
}

function ClosedEvent({
	event,
	owner,
	repo,
	closingPR,
	issueStateReason,
}: {
	event: IssueTimelineEvent;
	owner: string;
	repo: string;
	closingPR?: PRSource;
	issueStateReason?: string | null;
}) {
	const isCompleted = issueStateReason === "completed";

	return (
		<div className="flex items-center gap-2 text-[11px] py-2 px-3 bg-muted/50 rounded-sm border border-dashed">
			<CheckCircle2
				className={cn(
					"w-4 h-4 shrink-0",
					isCompleted
						? "text-purple-400"
						: "text-muted-foreground/50",
				)}
			/>
			<UserAvatar actor={event.actor} />
			{event.actor && (
				<UserTooltip username={event.actor.login}>
					<Link
						href={`/users/${event.actor.login}`}
						className="font-semibold text-foreground hover:underline transition-colors"
					>
						{event.actor.login}
					</Link>
				</UserTooltip>
			)}
			<span className="text-muted-foreground">
				closed this as{" "}
				<span
					className={cn(
						isCompleted
							? "text-purple-400"
							: "text-muted-foreground",
					)}
				>
					{isCompleted ? "completed" : "not planned"}
				</span>
				{closingPR && " in"}
			</span>
			{closingPR && (
				<Link
					href={`/${closingPR.repoOwner}/${closingPR.repoName}/pulls/${closingPR.number}`}
					className="text-purple-400 hover:underline font-mono"
				>
					{closingPR.repoOwner !== owner ||
					closingPR.repoName !== repo
						? `${closingPR.repoOwner}/${closingPR.repoName}#${closingPR.number}`
						: `#${closingPR.number}`}
				</Link>
			)}
			<span className="text-muted-foreground/60 ml-auto">
				<TimeAgo date={event.created_at} />
			</span>
		</div>
	);
}

function ReopenedEvent({ event }: { event: IssueTimelineEvent }) {
	return (
		<div className="flex items-center gap-2 text-[11px] py-2 px-3 bg-muted/50 rounded-sm border border-dashed border-border">
			<RotateCcw className="w-4 h-4 text-success shrink-0" />
			<UserAvatar actor={event.actor} />
			{event.actor && (
				<UserTooltip username={event.actor.login}>
					<Link
						href={`/users/${event.actor.login}`}
						className="font-semibold text-foreground hover:underline transition-colors"
					>
						{event.actor.login}
					</Link>
				</UserTooltip>
			)}
			<span className="text-muted-foreground">reopened this</span>
			<span className="text-muted-foreground/60 ml-auto">
				<TimeAgo date={event.created_at} />
			</span>
		</div>
	);
}

function ReferencedEvent({
	event,
	owner,
	repo,
}: {
	event: IssueTimelineEvent;
	owner: string;
	repo: string;
}) {
	return (
		<div className="flex items-center gap-1.5 text-[11px] py-1.5">
			<GitCommitHorizontal className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
			<UserAvatar actor={event.actor} />
			{event.actor && (
				<UserTooltip username={event.actor.login}>
					<Link
						href={`/users/${event.actor.login}`}
						className="font-medium text-foreground/80 hover:text-foreground hover:underline transition-colors"
					>
						{event.actor.login}
					</Link>
				</UserTooltip>
			)}
			<span className="text-muted-foreground/60">
				added a commit that references this{" "}
				{event.commit_id ? (
					<Link
						href={`/${owner}/${repo}/commit/${event.commit_id}`}
						className="text-muted-foreground/80 hover:text-foreground underline underline-offset-2 transition-colors"
					>
						issue
					</Link>
				) : (
					"issue"
				)}
			</span>
			<span className="text-muted-foreground/40">
				<TimeAgo date={event.created_at} />
			</span>
		</div>
	);
}

function CrossReferencedEvent({
	event,
	owner,
	repo,
}: {
	event: IssueTimelineEvent;
	owner: string;
	repo: string;
}) {
	const source = event.source;
	if (!source) return null;

	const isLocal = source.repoOwner === owner && source.repoName === repo;
	const href = `/${source.repoOwner}/${source.repoName}/${source.type === "pull_request" ? "pulls" : "issues"}/${source.number}`;
	const isPR = source.type === "pull_request";
	const isMerged = source.merged;
	const isClosed = source.state === "closed";

	return (
		<div className="flex items-center gap-2 text-[11px] py-2 px-3 bg-muted/50 rounded-sm border border-dashed border-border">
			<GitPullRequest
				className={cn(
					"w-4 h-4 shrink-0",
					isMerged
						? "text-purple-400"
						: isClosed
							? "text-alert-important"
							: "text-success",
				)}
			/>
			<UserAvatar actor={event.actor} />
			{event.actor && (
				<UserTooltip username={event.actor.login}>
					<Link
						href={`/users/${event.actor.login}`}
						className="font-semibold text-foreground hover:underline transition-colors"
					>
						{event.actor.login}
					</Link>
				</UserTooltip>
			)}
			<span className="text-muted-foreground">
				{isPR ? "referenced this in" : "mentioned this in"}
			</span>
			<Link
				href={href}
				className={cn(
					"hover:underline transition-colors",
					isMerged
						? "text-purple-400"
						: isClosed
							? "text-alert-important"
							: "text-success",
				)}
			>
				{!isLocal && (
					<span className="text-muted-foreground/70 mr-1">
						{source.repoOwner}/{source.repoName}
					</span>
				)}
				<span className="font-mono">#{source.number}</span>
			</Link>
			<span className="text-muted-foreground/60 ml-auto">
				<TimeAgo date={event.created_at} />
			</span>
		</div>
	);
}

function CommittedEvent({
	event,
	owner,
	repo,
}: {
	event: IssueTimelineEvent;
	owner: string;
	repo: string;
}) {
	const shortSha = event.commit_id?.slice(0, 7);
	if (!shortSha) return null;

	return (
		<div className="flex items-center gap-1.5 text-[11px] py-1.5">
			<div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
				<div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
			</div>
			<Link
				href={`/${owner}/${repo}/commit/${event.commit_id}`}
				className="font-mono text-muted-foreground/60 hover:text-foreground hover:underline transition-colors"
			>
				{shortSha}
			</Link>
			<span className="text-muted-foreground/40">
				<TimeAgo date={event.created_at} />
			</span>
		</div>
	);
}
