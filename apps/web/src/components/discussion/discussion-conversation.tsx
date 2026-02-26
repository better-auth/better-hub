import Link from "next/link";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import { TimeAgo } from "@/components/ui/time-ago";
import { CollapsibleBody } from "@/components/issue/collapsible-body";
import { BotActivityGroup } from "@/components/pr/bot-activity-group";
import type { DiscussionComment, DiscussionReply } from "@/lib/github";

interface DescriptionEntry {
	body: string;
	bodyHtml?: string;
	author: { login: string; avatar_url: string } | null;
	createdAt: string;
}

interface DiscussionConversationProps {
	description: DescriptionEntry;
	comments: DiscussionComment[];
}

function isBot(comment: DiscussionComment): boolean {
	if (!comment.author) return false;
	return (
		comment.author.type === "Bot" ||
		comment.author.login.endsWith("[bot]") ||
		comment.author.login.endsWith("-bot")
	);
}

type GroupedItem =
	| { kind: "entry"; comment: DiscussionComment }
	| { kind: "bot-group"; comments: DiscussionComment[] };

function groupComments(comments: DiscussionComment[]): GroupedItem[] {
	const groups: GroupedItem[] = [];
	let botBuffer: DiscussionComment[] = [];

	const flushBots = () => {
		if (botBuffer.length === 0) return;
		groups.push({ kind: "bot-group", comments: [...botBuffer] });
		botBuffer = [];
	};

	for (const comment of comments) {
		if (isBot(comment)) {
			botBuffer.push(comment);
		} else {
			flushBots();
			groups.push({ kind: "entry", comment });
		}
	}
	flushBots();
	return groups;
}

export function DiscussionConversation({ description, comments }: DiscussionConversationProps) {
	const grouped = groupComments(comments);

	return (
		<div className="relative">
			{/* Timeline connector line */}
			{comments.length > 0 && (
				<div className="absolute left-[19px] top-10 bottom-4 w-px bg-border/50" />
			)}

			<div className="space-y-4">
				{/* Description block */}
				<DescriptionBlock entry={description} />

				{/* Comments */}
				{grouped.map((item, gi) => {
					if (item.kind === "bot-group") {
						const botNames = [
							...new Set(
								item.comments.map(
									(c) => c.author!.login,
								),
							),
						];
						const avatars = [
							...new Set(
								item.comments.map(
									(c) => c.author!.avatar_url,
								),
							),
						];
						return (
							<div
								key={`bot-group-${gi}`}
								className="relative pl-12"
							>
								<BotActivityGroup
									count={item.comments.length}
									botNames={botNames}
									avatars={avatars}
								>
									<div className="space-y-3">
										{item.comments.map(
											(
												comment,
											) => (
												<div
													key={
														comment.id
													}
												>
													<CommentBlock
														comment={
															comment
														}
													/>
													{comment
														.replies
														.length >
														0 && (
														<div className="ml-12 mt-2 space-y-2 border-l-2 border-border/30 pl-4">
															{comment.replies.map(
																(
																	reply,
																) => (
																	<ReplyBlock
																		key={
																			reply.id
																		}
																		reply={
																			reply
																		}
																	/>
																),
															)}
														</div>
													)}
												</div>
											),
										)}
									</div>
								</BotActivityGroup>
							</div>
						);
					}

					const { comment } = item;
					return (
						<div key={comment.id}>
							<CommentBlock comment={comment} />
							{comment.replies.length > 0 && (
								<div className="ml-12 mt-2 space-y-2 border-l-2 border-border/30 pl-4">
									{comment.replies.map(
										(reply) => (
											<ReplyBlock
												key={
													reply.id
												}
												reply={
													reply
												}
											/>
										),
									)}
								</div>
							)}
						</div>
					);
				})}

				{comments.length === 0 && (
					<div className="py-8 text-center">
						<p className="text-sm text-muted-foreground/40">
							No comments yet
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function DescriptionBlock({ entry }: { entry: DescriptionEntry }) {
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
			<div className="shrink-0 relative z-10">
				{entry.author ? (
					<Link href={`/users/${entry.author.login}`}>
						<Image
							src={entry.author.avatar_url}
							alt={entry.author.login}
							width={40}
							height={40}
							className="rounded-full bg-background ring-2 ring-border/60"
						/>
					</Link>
				) : (
					<div className="w-10 h-10 rounded-full bg-muted-foreground/20" />
				)}
			</div>

			<div className="flex-1 min-w-0">
				<div className="border border-border/60 rounded-lg overflow-hidden">
					<div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/60 bg-card/80">
						{entry.author && (
							<Link
								href={`/users/${entry.author.login}`}
								className="text-xs font-semibold text-foreground/90 hover:text-foreground transition-colors"
							>
								{entry.author.login}
							</Link>
						)}
						<span className="text-[11px] text-muted-foreground/50">
							started this discussion{" "}
							<TimeAgo date={entry.createdAt} />
						</span>
					</div>

					{hasBody && renderedBody ? (
						<div className="px-3.5 py-3">
							{isLong ? (
								<CollapsibleBody>
									{renderedBody}
								</CollapsibleBody>
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
				</div>
			</div>
		</div>
	);
}

function CommentBlock({ comment }: { comment: DiscussionComment }) {
	const hasBody = Boolean(comment.body && comment.body.trim().length > 0);
	const isLong = hasBody && comment.body.length > 800;

	const renderedBody = comment.bodyHtml ? (
		<MarkdownCopyHandler>
			<div
				className="ghmd"
				dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
			/>
		</MarkdownCopyHandler>
	) : null;

	return (
		<div className="flex gap-3 relative">
			<div className="shrink-0 relative z-10">
				{comment.author ? (
					<Link href={`/users/${comment.author.login}`}>
						<Image
							src={comment.author.avatar_url}
							alt={comment.author.login}
							width={40}
							height={40}
							className="rounded-full bg-background"
						/>
					</Link>
				) : (
					<div className="w-10 h-10 rounded-full bg-muted-foreground/20" />
				)}
			</div>

			<div className="flex-1 min-w-0">
				<div
					className={cn(
						"border rounded-lg overflow-hidden",
						comment.isAnswer
							? "border-success/40"
							: "border-border/60",
					)}
				>
					{/* Answer banner */}
					{comment.isAnswer && (
						<div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-success/10 text-success text-[11px] font-mono border-b border-success/20">
							<CheckCircle2 className="w-3 h-3" />
							Marked as answer
						</div>
					)}

					<div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/60 bg-card/80">
						{comment.author ? (
							<Link
								href={`/users/${comment.author.login}`}
								className="text-xs font-semibold text-foreground/90 hover:text-foreground transition-colors"
							>
								{comment.author.login}
							</Link>
						) : (
							<span className="text-xs font-semibold text-foreground/80">
								ghost
							</span>
						)}
						<span className="text-[11px] text-muted-foreground/50">
							commented{" "}
							<TimeAgo date={comment.createdAt} />
						</span>
						{comment.upvoteCount > 0 && (
							<span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">
								+{comment.upvoteCount}
							</span>
						)}
					</div>

					{hasBody && renderedBody ? (
						<div className="px-3.5 py-3">
							{isLong ? (
								<CollapsibleBody>
									{renderedBody}
								</CollapsibleBody>
							) : (
								renderedBody
							)}
						</div>
					) : (
						<div className="px-3.5 py-4">
							<p className="text-sm text-muted-foreground/30 italic">
								No content.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function ReplyBlock({ reply }: { reply: DiscussionReply }) {
	const renderedBody = reply.bodyHtml ? (
		<MarkdownCopyHandler>
			<div
				className="ghmd ghmd-sm"
				dangerouslySetInnerHTML={{ __html: reply.bodyHtml }}
			/>
		</MarkdownCopyHandler>
	) : null;

	return (
		<div
			className={cn(
				"border rounded-md overflow-hidden",
				reply.isAnswer ? "border-success/40" : "border-border/40",
			)}
		>
			{reply.isAnswer && (
				<div className="flex items-center gap-1.5 px-3 py-1 bg-success/10 text-success text-[10px] font-mono border-b border-success/20">
					<CheckCircle2 className="w-2.5 h-2.5" />
					Answer
				</div>
			)}
			<div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/30">
				{reply.author ? (
					<Link
						href={`/users/${reply.author.login}`}
						className="flex items-center gap-1.5"
					>
						<Image
							src={reply.author.avatar_url}
							alt={reply.author.login}
							width={14}
							height={14}
							className="rounded-full"
						/>
						<span className="text-[11px] font-semibold text-foreground/80">
							{reply.author.login}
						</span>
					</Link>
				) : (
					<span className="text-[11px] font-semibold text-foreground/60">
						ghost
					</span>
				)}
				<span className="text-[10px] text-muted-foreground/40">
					<TimeAgo date={reply.createdAt} />
				</span>
				{reply.upvoteCount > 0 && (
					<span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">
						+{reply.upvoteCount}
					</span>
				)}
			</div>
			{renderedBody && <div className="px-3 py-2">{renderedBody}</div>}
		</div>
	);
}
