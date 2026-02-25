import Link from "next/link";
import Image from "next/image";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { BotActivityGroup } from "@/components/pr/bot-activity-group";
import { OlderActivityGroup } from "@/components/issue/older-activity-group";
import { CollapsibleBody } from "@/components/issue/collapsible-body";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";
import { ChatMessageWrapper } from "@/components/pr/chat-message-wrapper";

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
	| { kind: "older-activity"; entries: IssueTimelineEntry[] };

/** Threshold: if more than this many human comments, collapse the middle ones */
const OLDER_ACTIVITY_THRESHOLD = 12;
/** Keep the first N and last N human entries visible */
const KEEP_VISIBLE = 4;

function groupEntries(entries: IssueTimelineEntry[]): GroupedItem[] {
	const groups: GroupedItem[] = [];
	let botBuffer: IssueTimelineEntry[] = [];

	const flushBots = () => {
		if (botBuffer.length === 0) return;
		groups.push({ kind: "bot-group", entries: [...botBuffer] });
		botBuffer = [];
	};

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (isBot(entry)) {
			botBuffer.push(entry);
		} else {
			flushBots();
			groups.push({ kind: "entry", entry, index: i });
		}
	}
	flushBots();

	// If many groups, collapse older activity
	if (groups.length > OLDER_ACTIVITY_THRESHOLD) {
		const head = groups.slice(0, KEEP_VISIBLE);
		const middle = groups.slice(KEEP_VISIBLE, groups.length - KEEP_VISIBLE);
		const tail = groups.slice(groups.length - KEEP_VISIBLE);

		const middleEntries: IssueTimelineEntry[] = [];
		for (const g of middle) {
			if (g.kind === "entry") middleEntries.push(g.entry);
			else if (g.kind === "bot-group") middleEntries.push(...g.entries);
		}

		const result: GroupedItem[] = [...head];
		if (middleEntries.length > 0) {
			result.push({ kind: "older-activity", entries: middleEntries });
		}
		result.push(...tail);
		return result;
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
		<div className="relative">
			{/* Timeline connector line */}
			{grouped.length > 1 && (
				<div className="absolute left-[19px] top-10 bottom-4 w-px bg-border/50" />
			)}

			<div className="space-y-4">
				{grouped.map((item, gi) => {
					if (item.kind === "bot-group") {
						const botNames = [
							...new Set(
								item.entries.map(
									(e) => e.user!.login,
								),
							),
						];
						const avatars = [
							...new Set(
								item.entries.map(
									(e) => e.user!.avatar_url,
								),
							),
						];
						return (
							<div
								key={`bot-group-${gi}`}
								className="relative pl-12"
							>
								<BotActivityGroup
									count={item.entries.length}
									botNames={botNames}
									avatars={avatars}
								>
									<div className="space-y-3">
										{item.entries.map(
											(entry) => (
												<ThreadComment
													key={`comment-${entry.id}`}
													entry={
														entry
													}
													owner={
														owner
													}
													repo={
														repo
													}
													issueNumber={
														issueNumber
													}
												/>
											),
										)}
									</div>
								</BotActivityGroup>
							</div>
						);
					}

					if (item.kind === "older-activity") {
						const avatars = [
							...new Set(
								item.entries
									.filter((e) => e.user)
									.map(
										(e) =>
											e.user!
												.avatar_url,
									),
							),
						];
						return (
							<div
								key={`older-${gi}`}
								className="relative pl-12"
							>
								<OlderActivityGroup
									count={item.entries.length}
									participantAvatars={avatars}
								>
									{item.entries.map(
										(entry) => (
											<ThreadComment
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
												repo={
													repo
												}
												issueNumber={
													issueNumber
												}
											/>
										),
									)}
								</OlderActivityGroup>
							</div>
						);
					}

					const { entry } = item;
					const isDescription = entry.type === "description";

					return (
						<ThreadEntry
							key={
								isDescription
									? "description"
									: `comment-${entry.id}`
							}
							entry={entry}
							isDescription={isDescription}
							owner={owner}
							repo={repo}
							issueNumber={issueNumber}
						/>
					);
				})}

				{entries.length === 0 && (
					<div className="py-8 text-center">
						<p className="text-sm text-muted-foreground">
							No conversation yet
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function ThreadEntry({
	entry,
	isDescription,
	owner,
	repo,
	issueNumber,
}: {
	entry: IssueTimelineEntry;
	isDescription: boolean;
	owner: string;
	repo: string;
	issueNumber: number;
}) {
	const hasBody = Boolean(entry.body && entry.body.trim().length > 0);
	const isLong = hasBody && entry.body.length > 800;

	const renderedBody = entry.bodyHtml ? (
		<MarkdownCopyHandler>
			<div
				className="ghmd"
				dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
			/>
		</MarkdownCopyHandler>
	) : null;

	return (
		<div className="flex gap-3 relative">
			{/* Avatar */}
			<div className="shrink-0 relative z-10">
				{entry.user ? (
					<Link href={`/users/${entry.user.login}`}>
						<Image
							src={entry.user.avatar_url}
							alt={entry.user.login}
							width={40}
							height={40}
							className={cn(
								"rounded-full bg-background",
								isDescription
									? "ring-2 ring-border/60"
									: "",
							)}
						/>
					</Link>
				) : (
					<div className="w-10 h-10 rounded-full bg-muted-foreground/20" />
				)}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				{isDescription ? (
					<DescriptionBlock
						entry={entry}
						hasBody={hasBody}
						isLong={isLong}
						renderedBody={renderedBody}
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
					/>
				) : (
					<CommentBlock
						entry={entry as IssueCommentEntry}
						hasBody={hasBody}
						isLong={isLong}
						renderedBody={renderedBody}
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
					/>
				)}
			</div>
		</div>
	);
}

function DescriptionBlock({
	entry,
	hasBody,
	isLong,
	renderedBody,
	owner,
	repo,
	issueNumber,
}: {
	entry: IssueTimelineEntry;
	hasBody: boolean;
	isLong: boolean;
	renderedBody: React.ReactNode;
	owner: string;
	repo: string;
	issueNumber: number;
}) {
	return (
		<div className="border border-border/60 rounded-lg overflow-hidden">
			<div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/60 bg-card/80">
				{entry.user && (
					<Link
						href={`/users/${entry.user.login}`}
						className="text-xs font-semibold text-foreground/90 hover:text-foreground transition-colors"
					>
						{entry.user.login}
					</Link>
				)}
				<span className="text-[11px] text-muted-foreground/50">
					commented <TimeAgo date={entry.created_at} />
				</span>
			</div>

			{hasBody && renderedBody ? (
				<div className="px-3.5 py-3">
					{isLong ? (
						<CollapsibleBody>{renderedBody}</CollapsibleBody>
					) : (
						renderedBody
					)}
				</div>
			) : (
				<div className="px-3.5 py-4">
					<p className="text-sm text-muted-foreground/30 italic">
						No description provided.
					</p>
				</div>
			)}

			<div className="px-3.5 pb-2.5">
				<ReactionDisplay
					reactions={entry.reactions ?? {}}
					owner={owner}
					repo={repo}
					contentType="issue"
					contentId={issueNumber}
				/>
			</div>
		</div>
	);
}

function CommentBlock({
	entry,
	hasBody,
	isLong,
	renderedBody,
	owner,
	repo,
	issueNumber,
}: {
	entry: IssueCommentEntry;
	hasBody: boolean;
	isLong: boolean;
	renderedBody: React.ReactNode;
	owner: string;
	repo: string;
	issueNumber: number;
}) {
	const headerContent = (
		<>
			{entry.user ? (
				<Link
					href={`/users/${entry.user.login}`}
					className="text-xs font-semibold text-foreground/90 hover:text-foreground transition-colors"
				>
					{entry.user.login}
				</Link>
			) : (
				<span className="text-xs font-semibold text-foreground/80">
					ghost
				</span>
			)}
			{entry.author_association && entry.author_association !== "NONE" && (
				<span className="text-[9px] px-1.5 py-0.5 border border-border/60 text-muted-foreground/50 rounded font-medium">
					{entry.author_association.toLowerCase()}
				</span>
			)}
			<span className="text-[11px] text-muted-foreground/50">
				commented <TimeAgo date={entry.created_at} />
			</span>
		</>
	);

	const bodyContent =
		hasBody && renderedBody ? (
			<div className="px-3.5 py-3">
				{isLong ? (
					<CollapsibleBody>{renderedBody}</CollapsibleBody>
				) : (
					renderedBody
				)}
			</div>
		) : (
			<div className="px-3.5 py-4">
				<p className="text-sm text-muted-foreground/30 italic">
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
			contentId={entry.id}
		/>
	);

	return (
		<ChatMessageWrapper
			headerContent={headerContent}
			bodyContent={bodyContent}
			reactionsContent={reactionsContent}
			owner={owner}
			repo={repo}
			contentType="issue"
			issueNumber={issueNumber}
			commentId={entry.id}
			body={entry.body}
		/>
	);
}

function ThreadComment({
	entry,
	owner,
	repo,
	issueNumber,
}: {
	entry: IssueTimelineEntry;
	owner: string;
	repo: string;
	issueNumber: number;
}) {
	const hasBody = Boolean(entry.body && entry.body.trim().length > 0);
	const isLong = hasBody && entry.body.length > 800;

	const renderedBody = entry.bodyHtml ? (
		<MarkdownCopyHandler>
			<div
				className="ghmd ghmd-sm"
				dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
			/>
		</MarkdownCopyHandler>
	) : null;

	if (entry.type === "description") {
		return (
			<DescriptionBlock
				entry={entry}
				hasBody={hasBody}
				isLong={isLong}
				renderedBody={renderedBody}
				owner={owner}
				repo={repo}
				issueNumber={issueNumber}
			/>
		);
	}

	return (
		<CommentBlock
			entry={entry as IssueCommentEntry}
			hasBody={hasBody}
			isLong={isLong}
			renderedBody={renderedBody}
			owner={owner}
			repo={repo}
			issueNumber={issueNumber}
		/>
	);
}
