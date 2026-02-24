import Link from "next/link";
import Image from "next/image";
import {
	GitCommitHorizontal,
	CircleDot,
	CircleX,
	CircleDashed,
	GitMerge,
	FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { parseCoAuthors, getInitials } from "@/lib/commit-utils";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { CollapsibleReviewCard } from "./collapsible-review-card";
import { BotActivityGroup } from "./bot-activity-group";
import { CommitActivityGroup } from "./commit-activity-group";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";
import { CollapsibleDescription } from "./collapsible-description";
import { ChatMessageWrapper } from "./chat-message-wrapper";
import { PRChecksPanel } from "./pr-checks-panel";
import type { CheckStatus } from "@/lib/github";

interface BaseUser {
	login: string;
	avatar_url: string;
	type?: string;
}

export interface DescriptionEntry {
	type: "description";
	id: string;
	user: BaseUser | null;
	body: string;
	created_at: string;
	reactions?: Reactions;
}

export interface CommentEntry {
	type: "comment";
	id: number;
	user: BaseUser | null;
	body: string;
	created_at: string;
	author_association?: string;
	reactions?: Reactions;
}

export interface ReviewEntry {
	type: "review";
	id: number;
	user: BaseUser | null;
	body: string | null;
	state: string;
	created_at: string;
	submitted_at: string | null;
	comments: ReviewCommentEntry[];
}

export interface ReviewCommentEntry {
	id: number;
	user: BaseUser | null;
	body: string;
	path: string;
	line: number | null;
	created_at: string;
	reactions?: Reactions;
}

export interface CommitEntry {
	type: "commit";
	id: string;
	sha: string;
	message: string;
	user: BaseUser | null;
	committer_name: string | null;
	created_at: string;
}

export interface StateChangeEntry {
	type: "state_change";
	id: string;
	event: "closed" | "reopened" | "merged" | "ready_for_review" | "convert_to_draft";
	user: BaseUser | null;
	created_at: string;
	merge_ref_name?: string;
}

export type TimelineEntry =
	| DescriptionEntry
	| CommentEntry
	| ReviewEntry
	| CommitEntry
	| StateChangeEntry;

function isBot(entry: TimelineEntry): boolean {
	if (!entry.user) return false;
	if (entry.type === "description") return false;
	if (entry.type === "commit") return false;
	if (entry.type === "state_change") return false;
	return (
		entry.user.type === "Bot" ||
		entry.user.login.endsWith("[bot]") ||
		entry.user.login.endsWith("-bot")
	);
}

type GroupedItem =
	| { kind: "entry"; entry: TimelineEntry; index: number }
	| { kind: "bot-group"; entries: TimelineEntry[] }
	| { kind: "commit-group"; commits: CommitEntry[] };

function groupEntries(entries: TimelineEntry[]): GroupedItem[] {
	const groups: GroupedItem[] = [];
	let botBuffer: TimelineEntry[] = [];
	let commitBuffer: CommitEntry[] = [];

	const flushBots = () => {
		if (botBuffer.length === 0) return;
		groups.push({ kind: "bot-group", entries: [...botBuffer] });
		botBuffer = [];
	};

	const flushCommits = () => {
		if (commitBuffer.length === 0) return;
		groups.push({ kind: "commit-group", commits: [...commitBuffer] });
		commitBuffer = [];
	};

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry.type === "commit") {
			// Commits are "transparent" to bot grouping — don't flush bots
			commitBuffer.push(entry);
		} else if (isBot(entry)) {
			// Flush any pending commits before adding to bot buffer
			flushCommits();
			botBuffer.push(entry);
		} else {
			// Human entry — flush everything
			flushBots();
			flushCommits();
			groups.push({ kind: "entry", entry, index: i });
		}
	}
	flushBots();
	flushCommits();

	return groups;
}

export async function PRConversation({
	entries,
	owner,
	repo,
	pullNumber,
	checkStatus,
}: {
	entries: TimelineEntry[];
	owner: string;
	repo: string;
	pullNumber: number;
	checkStatus?: CheckStatus;
}) {
	const grouped = groupEntries(entries);

	return (
		<div className="space-y-3">
			{grouped.map((item, gi) => {
				if (item.kind === "bot-group") {
					const botNames = [
						...new Set(item.entries.map((e) => e.user!.login)),
					];
					const avatars = [
						...new Set(
							item.entries.map((e) => e.user!.avatar_url),
						),
					];
					return (
						<BotActivityGroup
							key={`bot-group-${gi}`}
							count={item.entries.length}
							botNames={botNames}
							avatars={avatars}
						>
							<div className="space-y-2">
								{item.entries.map((entry) => {
									if (
										entry.type ===
										"review"
									) {
										return (
											<ReviewCardWrapper
												key={`review-${entry.id}`}
												entry={
													entry
												}
												owner={
													owner
												}
												repo={
													repo
												}
											/>
										);
									}
									if (
										entry.type ===
										"commit"
									) {
										return (
											<CommitGroup
												key={`commit-${entry.sha}`}
												commits={[
													entry,
												]}
											/>
										);
									}
									if (
										entry.type ===
										"state_change"
									) {
										return (
											<StateChangeEvent
												key={`state-${entry.id}`}
												entry={
													entry
												}
											/>
										);
									}
									return (
										<ChatMessage
											key={
												entry.type ===
												"description"
													? entry.id
													: `comment-${entry.id}`
											}
											entry={
												entry
											}
											owner={
												owner
											}
											repo={repo}
											pullNumber={
												pullNumber
											}
										/>
									);
								})}
							</div>
						</BotActivityGroup>
					);
				}

				if (item.kind === "commit-group") {
					return (
						<CommitGroup
							key={`commits-${gi}`}
							commits={item.commits}
						/>
					);
				}

				const { entry } = item;
				if (entry.type === "review") {
					return (
						<ReviewCardWrapper
							key={`review-${entry.id}`}
							entry={entry}
							owner={owner}
							repo={repo}
						/>
					);
				}
				if (entry.type === "commit") {
					return (
						<CommitGroup
							key={`commit-${entry.sha}`}
							commits={[entry]}
						/>
					);
				}
				if (entry.type === "state_change") {
					return (
						<StateChangeEvent
							key={`state-${entry.id}`}
							entry={entry}
						/>
					);
				}
				if (entry.type === "description") {
					return (
						<div key={entry.id} className="space-y-3">
							<ChatMessage
								entry={entry}
								owner={owner}
								repo={repo}
								pullNumber={pullNumber}
							/>
							{checkStatus && (
								<PRChecksPanel
									checkStatus={checkStatus}
									owner={owner}
									repo={repo}
								/>
							)}
						</div>
					);
				}
				return (
					<ChatMessage
						key={`comment-${entry.id}`}
						entry={entry}
						owner={owner}
						repo={repo}
						pullNumber={pullNumber}
					/>
				);
			})}

			{entries.length === 0 && (
				<div className="py-8 text-center">
					<p className="text-sm text-muted-foreground/40">
						No conversation yet
					</p>
				</div>
			)}
		</div>
	);
}

async function ChatMessage({
	entry,
	owner,
	repo,
	pullNumber,
}: {
	entry: DescriptionEntry | CommentEntry;
	owner: string;
	repo: string;
	pullNumber: number;
}) {
	const hasBody = entry.body && entry.body.trim().length > 0;

	// Description entry: no header (author info is in the dossier above), just render body
	if (entry.type === "description") {
		return (
			<div className="group">
				{hasBody ? (
					<CollapsibleDescription>
						<div className="px-1">
							<MarkdownRenderer
								content={entry.body}
								className="ghmd-sm"
								issueRefContext={{ owner, repo }}
							/>
						</div>
					</CollapsibleDescription>
				) : (
					<div className="px-1 py-2">
						<p className="text-xs text-muted-foreground/30 italic">
							No description provided.
						</p>
					</div>
				)}

				<div className="px-1 pb-2 pt-1">
					<ReactionDisplay
						reactions={entry.reactions ?? {}}
						owner={owner}
						repo={repo}
						contentType="issue"
						contentId={pullNumber}
					/>
				</div>
			</div>
		);
	}

	const headerContent = (
		<>
			{entry.user ? (
				<Link
					href={`/users/${entry.user.login}`}
					className="flex items-center gap-2 hover:text-foreground transition-colors"
				>
					<Image
						src={entry.user.avatar_url}
						alt={entry.user.login}
						width={16}
						height={16}
						className="rounded-full shrink-0"
					/>
					<span className="text-xs font-medium text-foreground/80">
						{entry.user.login}
					</span>
				</Link>
			) : (
				<>
					<div className="w-4 h-4 rounded-full bg-muted-foreground shrink-0" />
					<span className="text-xs font-medium text-foreground/80">
						ghost
					</span>
				</>
			)}
			{entry.type === "comment" &&
				entry.author_association &&
				entry.author_association !== "NONE" && (
					<span className="text-[9px] px-1 py-px border border-border text-muted-foreground/50 rounded">
						{entry.author_association.toLowerCase()}
					</span>
				)}
			<span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
				<TimeAgo date={entry.created_at} />
			</span>
		</>
	);

	const bodyContent = hasBody ? (
		<div className="px-3 py-2.5">
			<MarkdownRenderer
				content={entry.body}
				className="ghmd-sm"
				issueRefContext={{ owner, repo }}
			/>
		</div>
	) : (
		<div className="px-3 py-3">
			<p className="text-xs text-muted-foreground/30 italic">
				No description provided.
			</p>
		</div>
	);

	const reactionsContent = (
		<ReactionDisplay
			reactions={entry.reactions ?? {}}
			owner={owner}
			repo={repo}
			contentType="issueComment"
			contentId={entry.id as number}
		/>
	);

	return (
		<ChatMessageWrapper
			headerContent={headerContent}
			bodyContent={bodyContent}
			reactionsContent={reactionsContent}
			owner={owner}
			repo={repo}
			contentType="pr"
			pullNumber={pullNumber}
			commentId={entry.id as number}
			body={entry.body}
		/>
	);
}

function ReviewCardWrapper({
	entry,
	owner,
	repo,
}: {
	entry: ReviewEntry;
	owner: string;
	repo: string;
}) {
	const hasBody = entry.body && entry.body.trim().length > 0;

	// Skip COMMENTED reviews with no body and no comments
	if (entry.state === "COMMENTED" && !hasBody && entry.comments.length === 0) {
		return null;
	}

	// Pre-render the markdown body on the server
	const bodyContent = hasBody ? (
		<div className="px-3 py-2.5">
			<MarkdownRenderer
				content={entry.body!}
				className="ghmd-sm"
				issueRefContext={{ owner, repo }}
			/>
		</div>
	) : null;

	return (
		<CollapsibleReviewCard
			user={entry.user}
			state={entry.state}
			timestamp={entry.submitted_at || entry.created_at}
			comments={entry.comments}
			bodyContent={bodyContent}
			owner={owner}
			repo={repo}
		/>
	);
}

function CommitGroup({ commits }: { commits: CommitEntry[] }) {
	const avatars = [...new Set(commits.filter((c) => c.user).map((c) => c.user!.avatar_url))];

	const list = (
		<div className="rounded-lg border border-border/60 overflow-hidden">
			{commits.map((commit, i) => {
				const firstLine = commit.message.split("\n")[0];
				const coAuthors = parseCoAuthors(commit.message);
				return (
					<div
						key={commit.sha}
						className={cn(
							"flex items-center gap-2.5 px-3 py-1.5",
							i > 0 && "border-t border-border/40",
						)}
					>
						<GitCommitHorizontal className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
						<div className="flex items-center -space-x-1 shrink-0">
							{commit.user ? (
								<Link
									href={`/users/${commit.user.login}`}
									className="relative z-10"
								>
									<Image
										src={
											commit.user
												.avatar_url
										}
										alt={
											commit.user
												.login
										}
										width={16}
										height={16}
										className="rounded-full border border-background"
									/>
								</Link>
							) : (
								<div className="w-4 h-4 rounded-full bg-muted-foreground border border-background relative z-10 shrink-0" />
							)}
							{coAuthors.slice(0, 2).map((ca, ci) => (
								<div
									key={ca.email}
									className="rounded-full bg-muted border border-background flex items-center justify-center shrink-0 relative"
									style={{
										width: 16,
										height: 16,
										zIndex: 9 - ci,
									}}
									title={`${ca.name} <${ca.email}>`}
								>
									<span className="text-[7px] font-medium text-muted-foreground leading-none">
										{getInitials(
											ca.name,
										)}
									</span>
								</div>
							))}
						</div>
						<span className="text-xs text-foreground/80 truncate flex-1 min-w-0">
							{firstLine}
						</span>
						<code className="text-[10px] font-mono text-muted-foreground/40 shrink-0">
							{commit.sha.slice(0, 7)}
						</code>
						<span className="text-[10px] text-muted-foreground/40 shrink-0">
							<TimeAgo date={commit.created_at} />
						</span>
					</div>
				);
			})}
		</div>
	);

	if (commits.length <= 1) return list;

	return (
		<CommitActivityGroup count={commits.length} avatars={avatars}>
			{list}
		</CommitActivityGroup>
	);
}

function StateChangeEvent({ entry }: { entry: StateChangeEntry }) {
	const eventConfig = {
		closed: {
			icon: CircleX,
			label: "closed this",
			color: "text-red-500",
			bgColor: "bg-red-500/10",
			borderColor: "border-red-500/20",
		},
		reopened: {
			icon: CircleDot,
			label: "reopened this",
			color: "text-green-500",
			bgColor: "bg-green-500/10",
			borderColor: "border-green-500/20",
		},
		merged: {
			icon: GitMerge,
			label: entry.merge_ref_name
				? `merged into ${entry.merge_ref_name}`
				: "merged this",
			color: "text-purple-500",
			bgColor: "bg-purple-500/10",
			borderColor: "border-purple-500/20",
		},
		ready_for_review: {
			icon: FileCheck,
			label: "marked this as ready for review",
			color: "text-green-500",
			bgColor: "bg-green-500/10",
			borderColor: "border-green-500/20",
		},
		convert_to_draft: {
			icon: CircleDashed,
			label: "converted this to draft",
			color: "text-muted-foreground",
			bgColor: "bg-muted/50",
			borderColor: "border-border/60",
		},
	};

	const config = eventConfig[entry.event];
	const Icon = config.icon;

	return (
		<div
			className={cn(
				"flex items-center gap-2.5 px-3 py-2 rounded-lg border",
				config.bgColor,
				config.borderColor,
			)}
		>
			<Icon className={cn("w-4 h-4 shrink-0", config.color)} />
			<div className="flex items-center gap-2 min-w-0 flex-1">
				{entry.user ? (
					<Link
						href={`/users/${entry.user.login}`}
						className="flex items-center gap-1.5 hover:opacity-80 transition-opacity shrink-0"
					>
						<Image
							src={entry.user.avatar_url}
							alt={entry.user.login}
							width={16}
							height={16}
							className="rounded-full"
						/>
						<span className="text-xs font-medium text-foreground/80">
							{entry.user.login}
						</span>
					</Link>
				) : (
					<span className="text-xs font-medium text-foreground/80">
						Someone
					</span>
				)}
				<span className="text-xs text-muted-foreground">
					{config.label}
				</span>
			</div>
			<span className="text-[10px] text-muted-foreground/40 shrink-0">
				<TimeAgo date={entry.created_at} />
			</span>
		</div>
	);
}
