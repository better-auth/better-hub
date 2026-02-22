import Link from "next/link";
import Image from "next/image";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { BotActivityGroup } from "@/components/pr/bot-activity-group";
import { OlderActivityGroup } from "@/components/issue/older-activity-group";
import { CollapsibleBody } from "@/components/issue/collapsible-body";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";

interface BaseUser {
	login: string;
	avatar_url: string;
	type?: string;
}

export interface IssueDescriptionEntry {
	type: "description";
	id: string;
	user: BaseUser | null;
	body: string;
	bodyHtml?: string;
	created_at: string;
	reactions?: Reactions;
}

export interface IssueCommentEntry {
	type: "comment";
	id: number;
	user: BaseUser | null;
	body: string;
	bodyHtml?: string;
	created_at: string;
	author_association?: string;
	reactions?: Reactions;
}

export type IssueTimelineEntry = IssueDescriptionEntry | IssueCommentEntry;

function isBot(entry: IssueTimelineEntry): boolean {
	if (!entry.user) return false;
	if (entry.type === "description") return false;
	return (
		entry.user.type === "Bot" ||
		entry.user.login.endsWith("[bot]") ||
		entry.user.login.endsWith("-bot")
	);
}

type GroupedItem =
	| { kind: "entry"; entry: IssueTimelineEntry; index: number }
	| { kind: "bot-group"; entries: IssueTimelineEntry[] }
	| { kind: "author-group"; author: BaseUser; entries: IssueTimelineEntry[] }
	| { kind: "older-activity"; entries: IssueTimelineEntry[] };

/** Threshold: if more than this many human comments, collapse the middle ones */
const OLDER_ACTIVITY_THRESHOLD = 8;
/** Keep the first N and last N human entries visible */
const KEEP_VISIBLE = 3;

function groupEntries(entries: IssueTimelineEntry[]): GroupedItem[] {
	// Phase 1: separate description, bots, and human comments
	const description =
		entries.length > 0 && entries[0].type === "description" ? entries[0] : null;
	const rest = description ? entries.slice(1) : entries;

	// Phase 2: group bots and same-author consecutive runs
	const rawGroups: GroupedItem[] = [];
	let botBuffer: IssueTimelineEntry[] = [];
	let authorBuffer: IssueTimelineEntry[] = [];

	const flushBots = () => {
		if (botBuffer.length === 0) return;
		rawGroups.push({ kind: "bot-group", entries: [...botBuffer] });
		botBuffer = [];
	};

	const flushAuthor = () => {
		if (authorBuffer.length === 0) return;
		if (authorBuffer.length === 1) {
			rawGroups.push({ kind: "entry", entry: authorBuffer[0], index: -1 });
		} else {
			rawGroups.push({
				kind: "author-group",
				author: authorBuffer[0].user!,
				entries: [...authorBuffer],
			});
		}
		authorBuffer = [];
	};

	for (const entry of rest) {
		if (isBot(entry)) {
			flushAuthor();
			botBuffer.push(entry);
		} else {
			flushBots();
			const currentAuthor = entry.user?.login;
			const bufferAuthor =
				authorBuffer.length > 0 ? authorBuffer[0].user?.login : null;
			if (currentAuthor && currentAuthor === bufferAuthor) {
				authorBuffer.push(entry);
			} else {
				flushAuthor();
				authorBuffer.push(entry);
			}
		}
	}
	flushBots();
	flushAuthor();

	// Phase 3: prepend description
	const groups: GroupedItem[] = [];
	if (description) {
		groups.push({ kind: "entry", entry: description, index: 0 });
	}

	// Phase 4: if many groups, collapse older activity into a single group
	if (rawGroups.length > OLDER_ACTIVITY_THRESHOLD) {
		const head = rawGroups.slice(0, KEEP_VISIBLE);
		const middle = rawGroups.slice(KEEP_VISIBLE, rawGroups.length - KEEP_VISIBLE);
		const tail = rawGroups.slice(rawGroups.length - KEEP_VISIBLE);

		// Flatten middle groups into entries for the older-activity wrapper
		const middleEntries: IssueTimelineEntry[] = [];
		for (const g of middle) {
			if (g.kind === "entry") middleEntries.push(g.entry);
			else if (g.kind === "bot-group" || g.kind === "author-group")
				middleEntries.push(...g.entries);
		}

		groups.push(...head);
		if (middleEntries.length > 0) {
			groups.push({ kind: "older-activity", entries: middleEntries });
		}
		groups.push(...tail);
	} else {
		groups.push(...rawGroups);
	}

	return groups;
}

export function IssueConversation({
	entries,
	owner,
	repo,
	issueNumber,
}: {
	entries: IssueTimelineEntry[];
	owner: string;
	repo: string;
	issueNumber: number;
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
								{item.entries.map((entry) => (
									<ChatMessage
										key={
											entry.type ===
											"description"
												? entry.id
												: `comment-${entry.id}`
										}
										entry={entry}
										isFirst={false}
										owner={owner}
										repo={repo}
										issueNumber={
											issueNumber
										}
									/>
								))}
							</div>
						</BotActivityGroup>
					);
				}

				if (item.kind === "author-group") {
					return (
						<AuthorGroup
							key={`author-${gi}`}
							author={item.author}
						>
							{item.entries.map((entry) => (
								<ChatMessage
									key={
										entry.type ===
										"description"
											? entry.id
											: `comment-${entry.id}`
									}
									entry={entry}
									isFirst={false}
									owner={owner}
									repo={repo}
									issueNumber={issueNumber}
									compact
								/>
							))}
						</AuthorGroup>
					);
				}

				if (item.kind === "older-activity") {
					const avatars = [
						...new Set(
							item.entries
								.filter((e) => e.user)
								.map((e) => e.user!.avatar_url),
						),
					];
					return (
						<OlderActivityGroup
							key={`older-${gi}`}
							count={item.entries.length}
							participantAvatars={avatars}
						>
							{item.entries.map((entry) => (
								<ChatMessage
									key={
										entry.type ===
										"description"
											? entry.id
											: `comment-${entry.id}`
									}
									entry={entry}
									isFirst={false}
									owner={owner}
									repo={repo}
									issueNumber={issueNumber}
								/>
							))}
						</OlderActivityGroup>
					);
				}

				const { entry, index } = item;
				return (
					<ChatMessage
						key={
							entry.type === "description"
								? entry.id
								: `comment-${entry.id}`
						}
						entry={entry}
						isFirst={index === 0}
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
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

function AuthorGroup({ author, children }: { author: BaseUser; children: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-border/60 overflow-hidden">
			<div className="flex items-center gap-2 px-3 py-1.5 bg-card/50 border-b border-border/60">
				<Link
					href={`/users/${author.login}`}
					className="flex items-center gap-2 hover:text-foreground transition-colors"
				>
					<Image
						src={author.avatar_url}
						alt={author.login}
						width={16}
						height={16}
						className="rounded-full shrink-0"
					/>
					<span className="text-xs font-medium text-foreground/80">
						{author.login}
					</span>
				</Link>
				<span className="text-[10px] text-muted-foreground/40">thread</span>
			</div>
			<div className="divide-y divide-border/30">{children}</div>
		</div>
	);
}

function ChatMessage({
	entry,
	isFirst,
	owner,
	repo,
	issueNumber,
	compact,
}: {
	entry: IssueTimelineEntry;
	isFirst: boolean;
	owner: string;
	repo: string;
	issueNumber: number;
	compact?: boolean;
}) {
	const hasBody = entry.body && entry.body.trim().length > 0;
	const isLong = hasBody && entry.body.length > 800;

	const renderedBody = entry.bodyHtml ? (
		<MarkdownCopyHandler>
			<div
				className="ghmd ghmd-sm"
				dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
			/>
		</MarkdownCopyHandler>
	) : null;

	if (compact) {
		return (
			<div className="px-3 py-2">
				<div className="flex items-center gap-2 mb-1">
					<span className="text-[10px] text-muted-foreground/40">
						<TimeAgo date={entry.created_at} />
					</span>
					{entry.type === "comment" &&
						entry.author_association &&
						entry.author_association !== "NONE" && (
							<span className="text-[9px] px-1 py-px border border-border/60 text-muted-foreground/50 rounded">
								{entry.author_association.toLowerCase()}
							</span>
						)}
				</div>
				{hasBody && renderedBody ? (
					isLong ? (
						<CollapsibleBody>{renderedBody}</CollapsibleBody>
					) : (
						renderedBody
					)
				) : (
					<p className="text-xs text-muted-foreground/30 italic">
						No description provided.
					</p>
				)}
				<div className="mt-1.5">
					<ReactionDisplay
						reactions={entry.reactions ?? {}}
						owner={owner}
						repo={repo}
						contentType={
							entry.type === "description"
								? "issue"
								: "issueComment"
						}
						contentId={
							entry.type === "description"
								? issueNumber
								: (entry.id as number)
						}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="group">
			<div
				className={cn(
					"border border-border/60 rounded-lg overflow-hidden",
					isFirst && "border-border/80",
				)}
			>
				<div
					className={cn(
						"flex items-center gap-2 px-3 py-1.5 border-b border-border/60",
						isFirst ? "bg-card/80" : "bg-card/50",
					)}
				>
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
					{entry.type === "description" && (
						<span className="text-[10px] text-muted-foreground/50">
							opened
						</span>
					)}
					{entry.type === "comment" &&
						entry.author_association &&
						entry.author_association !== "NONE" && (
							<span className="text-[9px] px-1 py-px border border-border/60 text-muted-foreground/50 rounded">
								{entry.author_association.toLowerCase()}
							</span>
						)}
					<span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
						<TimeAgo date={entry.created_at} />
					</span>
				</div>

				{hasBody && renderedBody ? (
					<div className="px-3 py-2.5">
						{isLong ? (
							<CollapsibleBody>
								{renderedBody}
							</CollapsibleBody>
						) : (
							renderedBody
						)}
					</div>
				) : (
					<div className="px-3 py-3">
						<p className="text-xs text-muted-foreground/30 italic">
							No description provided.
						</p>
					</div>
				)}

				<div className="px-3 pb-2">
					<ReactionDisplay
						reactions={entry.reactions ?? {}}
						owner={owner}
						repo={repo}
						contentType={
							entry.type === "description"
								? "issue"
								: "issueComment"
						}
						contentId={
							entry.type === "description"
								? issueNumber
								: (entry.id as number)
						}
					/>
				</div>
			</div>
		</div>
	);
}
