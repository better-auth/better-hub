"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import { ReactiveCodeBlocks } from "@/components/shared/reactive-code-blocks";
import { UserTooltip } from "@/components/shared/user-tooltip";
import { TimeAgo } from "@/components/ui/time-ago";
import { CollapsibleBody } from "@/components/issue/collapsible-body";
import { BotActivityGroup } from "@/components/pr/bot-activity-group";
import { MessageActionsMenu } from "@/components/pr/message-actions-menu";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import {
	DiscussionReactionDisplay,
	type Reactions,
} from "@/components/discussion/discussion-reaction-display";
import {
	deleteDiscussionComment,
	updateDiscussionBody,
	updateDiscussionCommentBody,
} from "@/app/(app)/repos/[owner]/[repo]/discussions/discussion-actions";
import type { DiscussionComment, DiscussionReply } from "@/lib/github";
import { canManageComment } from "@/lib/comment-permissions";

interface DescriptionEntry {
	body: string;
	bodyHtml?: string;
	author: { login: string; avatar_url: string; type?: string } | null;
	createdAt: string;
	discussionId?: string;
	reactions?: Reactions;
	upvoteCount?: number;
	viewerHasUpvoted?: boolean;
}

interface DiscussionConversationProps {
	owner: string;
	repo: string;
	discussionNumber: number;
	description: DescriptionEntry;
	comments: DiscussionComment[];
	currentUserLogin?: string;
	viewerHasWriteAccess?: boolean;
	canEditDiscussion?: boolean;
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

export function DiscussionConversation({
	owner,
	repo,
	discussionNumber,
	description,
	comments,
	currentUserLogin,
	viewerHasWriteAccess,
	canEditDiscussion,
}: DiscussionConversationProps) {
	const grouped = groupComments(comments);

	return (
		<div className="relative">
			{/* Timeline connector line */}
			{comments.length > 0 && (
				<div className="absolute left-[19px] top-10 bottom-4 w-px bg-border/50" />
			)}

			<div className="space-y-4">
				{/* Description block */}
				<DescriptionBlock
					entry={description}
					owner={owner}
					repo={repo}
					discussionNumber={discussionNumber}
					canEditDiscussion={canEditDiscussion}
				/>

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
														owner={
															owner
														}
														repo={
															repo
														}
														discussionNumber={
															discussionNumber
														}
														currentUserLogin={
															currentUserLogin
														}
														viewerHasWriteAccess={
															viewerHasWriteAccess
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
																		owner={
																			owner
																		}
																		repo={
																			repo
																		}
																		discussionNumber={
																			discussionNumber
																		}
																		currentUserLogin={
																			currentUserLogin
																		}
																		viewerHasWriteAccess={
																			viewerHasWriteAccess
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
							<CommentBlock
								comment={comment}
								owner={owner}
								repo={repo}
								discussionNumber={discussionNumber}
								currentUserLogin={currentUserLogin}
								viewerHasWriteAccess={
									viewerHasWriteAccess
								}
							/>
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
												owner={
													owner
												}
												repo={
													repo
												}
												discussionNumber={
													discussionNumber
												}
												currentUserLogin={
													currentUserLogin
												}
												viewerHasWriteAccess={
													viewerHasWriteAccess
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

function InlineDiscussionEditor({
	value,
	onChange,
	onCancel,
	onSave,
	error,
	isSaving,
	owner,
	rows = 5,
}: {
	value: string;
	onChange: (value: string) => void;
	onCancel: () => void;
	onSave: () => Promise<void>;
	error: string | null;
	isSaving: boolean;
	owner: string;
	rows?: number;
}) {
	return (
		<div className="p-3 space-y-2">
			<MarkdownEditor
				value={value}
				onChange={onChange}
				placeholder="Edit comment..."
				rows={rows}
				compact
				autoFocus
				owner={owner}
				onKeyDown={(e) => {
					if (e.key === "Escape") onCancel();
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						void onSave();
					}
				}}
			/>
			{error && (
				<div className="flex items-center gap-2 text-[11px] text-destructive">
					<AlertCircle className="w-3 h-3 shrink-0" />
					{error}
				</div>
			)}
			<div className="flex items-center justify-end gap-2">
				<button
					type="button"
					onClick={onCancel}
					disabled={isSaving}
					className="px-3 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer rounded-md"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={() => void onSave()}
					disabled={isSaving}
					className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
					Save changes
				</button>
			</div>
		</div>
	);
}

function DescriptionBlock({
	entry,
	owner,
	repo,
	discussionNumber,
	canEditDiscussion,
}: {
	entry: DescriptionEntry;
	owner: string;
	repo: string;
	discussionNumber: number;
	canEditDiscussion?: boolean;
}) {
	const hasBody = Boolean(entry.body && entry.body.trim().length > 0);
	const isLong = hasBody && entry.body.length > 800;
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isEditing, setIsEditing] = useState(false);
	const [editBody, setEditBody] = useState(entry.body);
	const [editError, setEditError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const renderedBody = entry.bodyHtml ? (
		<MarkdownCopyHandler>
			<ReactiveCodeBlocks>
				<div
					className="ghmd"
					dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
				/>
			</ReactiveCodeBlocks>
		</MarkdownCopyHandler>
	) : null;

	const discussionUrl = `https://github.com/${owner}/${repo}/discussions/${discussionNumber}`;

	const handleSave = async () => {
		if (!entry.discussionId) return;
		setIsSaving(true);
		setEditError(null);
		const result = await updateDiscussionBody(
			owner,
			repo,
			discussionNumber,
			entry.discussionId,
			editBody.trim(),
		);
		if (result.error) {
			setEditError(result.error);
			setIsSaving(false);
			return;
		}
		await queryClient.invalidateQueries({
			queryKey: ["discussion-comments", owner, repo, discussionNumber],
		});
		setIsSaving(false);
		setIsEditing(false);
		router.refresh();
	};

	return (
		<div className="flex gap-3 relative">
			<div className="shrink-0 relative z-10">
				{entry.author ? (
					<UserTooltip username={entry.author.login} side="right">
						<Link href={`/users/${entry.author.login}`}>
							<Image
								src={entry.author.avatar_url}
								alt={entry.author.login}
								width={40}
								height={40}
								className="rounded-full bg-background ring-2 ring-border/60"
							/>
						</Link>
					</UserTooltip>
				) : (
					<div className="w-10 h-10 rounded-full bg-muted-foreground/20" />
				)}
			</div>

			<div className="flex-1 min-w-0">
				<div className="border border-border/60 rounded-lg overflow-hidden">
					<div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/60 bg-card/80">
						{entry.author && (
							<UserTooltip username={entry.author.login}>
								<Link
									href={`/users/${entry.author.login}`}
									className="text-xs font-semibold text-foreground/90 hover:text-foreground transition-colors"
								>
									{entry.author.login}
								</Link>
							</UserTooltip>
						)}
						<span className="text-[11px] text-muted-foreground/50">
							started this discussion{" "}
							<TimeAgo date={entry.createdAt} />
						</span>
						<MessageActionsMenu
							commentUrl={discussionUrl}
							body={entry.body}
							ariaLabel="Discussion actions"
							editLabel="Edit discussion"
							reportContent={{
								authorLogin: entry.author?.login,
								authorType: entry.author?.type,
							}}
							referenceIssue={{
								owner,
								repo,
								authorLogin: entry.author?.login,
							}}
							canEdit={
								!!(
									canEditDiscussion &&
									entry.discussionId
								)
							}
							onEdit={
								canEditDiscussion &&
								entry.discussionId
									? () => {
											setEditBody(
												entry.body,
											);
											setEditError(
												null,
											);
											setIsEditing(
												true,
											);
										}
									: undefined
							}
						/>
					</div>

					{isEditing ? (
						<InlineDiscussionEditor
							value={editBody}
							onChange={setEditBody}
							onCancel={() => {
								setEditBody(entry.body);
								setEditError(null);
								setIsEditing(false);
							}}
							onSave={handleSave}
							error={editError}
							isSaving={isSaving}
							owner={owner}
							rows={8}
						/>
					) : hasBody && renderedBody ? (
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

					{entry.discussionId && (
						<div className="px-3.5 pb-2.5">
							<DiscussionReactionDisplay
								reactions={entry.reactions}
								subjectId={entry.discussionId}
								upvoteCount={entry.upvoteCount}
								viewerHasUpvoted={
									entry.viewerHasUpvoted
								}
								showUpvote={false}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function CommentBlock({
	comment,
	owner,
	repo,
	discussionNumber,
	currentUserLogin,
	viewerHasWriteAccess,
}: {
	comment: DiscussionComment;
	owner: string;
	repo: string;
	discussionNumber: number;
	currentUserLogin?: string;
	viewerHasWriteAccess?: boolean;
}) {
	const hasBody = Boolean(comment.body && comment.body.trim().length > 0);
	const isLong = hasBody && comment.body.length > 800;
	const router = useRouter();
	const queryClient = useQueryClient();
	const [deleted, setDeleted] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editBody, setEditBody] = useState(comment.body);
	const [editError, setEditError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const canManage = canManageComment({
		authorLogin: comment.author?.login,
		currentUserLogin,
		viewerHasWriteAccess,
	});
	const commentUrl = `https://github.com/${owner}/${repo}/discussions/${discussionNumber}#discussioncomment-${comment.databaseId}`;

	const renderedBody = comment.bodyHtml ? (
		<MarkdownCopyHandler>
			<ReactiveCodeBlocks>
				<div
					className="ghmd"
					dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
				/>
			</ReactiveCodeBlocks>
		</MarkdownCopyHandler>
	) : null;

	if (deleted) return null;

	const refreshComments = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["discussion-comments", owner, repo, discussionNumber],
		});
		router.refresh();
	};

	const handleSave = async () => {
		setIsSaving(true);
		setEditError(null);
		const result = await updateDiscussionCommentBody(
			owner,
			repo,
			discussionNumber,
			comment.id,
			editBody.trim(),
		);
		if (result.error) {
			setEditError(result.error);
			setIsSaving(false);
			return;
		}
		setIsSaving(false);
		setIsEditing(false);
		await refreshComments();
	};

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
						<MessageActionsMenu
							commentUrl={commentUrl}
							body={comment.body}
							reportContent={{
								authorLogin: comment.author?.login,
								authorType: comment.author?.type,
							}}
							referenceIssue={{
								owner,
								repo,
								authorLogin: comment.author?.login,
							}}
							canEdit={canManage}
							canDelete={canManage}
							onEdit={() => {
								setEditBody(comment.body);
								setEditError(null);
								setIsEditing(true);
							}}
							onDelete={async () => {
								const result =
									await deleteDiscussionComment(
										owner,
										repo,
										discussionNumber,
										comment.id,
									);
								if (result.error) {
									alert(result.error);
									return;
								}
								setDeleted(true);
								await refreshComments();
							}}
						/>
					</div>

					{isEditing ? (
						<InlineDiscussionEditor
							value={editBody}
							onChange={setEditBody}
							onCancel={() => {
								setEditBody(comment.body);
								setEditError(null);
								setIsEditing(false);
							}}
							onSave={handleSave}
							error={editError}
							isSaving={isSaving}
							owner={owner}
						/>
					) : hasBody && renderedBody ? (
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

					<div className="px-3.5 pb-2.5">
						<DiscussionReactionDisplay
							reactions={
								comment.reactions as
									| Reactions
									| undefined
							}
							subjectId={comment.id}
							upvoteCount={comment.upvoteCount}
							viewerHasUpvoted={comment.viewerHasUpvoted}
							showUpvote
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function ReplyBlock({
	reply,
	owner,
	repo,
	discussionNumber,
	currentUserLogin,
	viewerHasWriteAccess,
}: {
	reply: DiscussionReply;
	owner: string;
	repo: string;
	discussionNumber: number;
	currentUserLogin?: string;
	viewerHasWriteAccess?: boolean;
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [deleted, setDeleted] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editBody, setEditBody] = useState(reply.body);
	const [editError, setEditError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const canManage = canManageComment({
		authorLogin: reply.author?.login,
		currentUserLogin,
		viewerHasWriteAccess,
	});
	const replyUrl = `https://github.com/${owner}/${repo}/discussions/${discussionNumber}#discussioncomment-${reply.databaseId}`;
	const renderedBody = reply.bodyHtml ? (
		<MarkdownCopyHandler>
			<ReactiveCodeBlocks>
				<div
					className="ghmd ghmd-sm"
					dangerouslySetInnerHTML={{ __html: reply.bodyHtml }}
				/>
			</ReactiveCodeBlocks>
		</MarkdownCopyHandler>
	) : null;

	if (deleted) return null;

	const refreshComments = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["discussion-comments", owner, repo, discussionNumber],
		});
		router.refresh();
	};

	const handleSave = async () => {
		setIsSaving(true);
		setEditError(null);
		const result = await updateDiscussionCommentBody(
			owner,
			repo,
			discussionNumber,
			reply.id,
			editBody.trim(),
		);
		if (result.error) {
			setEditError(result.error);
			setIsSaving(false);
			return;
		}
		setIsSaving(false);
		setIsEditing(false);
		await refreshComments();
	};

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
				<MessageActionsMenu
					commentUrl={replyUrl}
					body={reply.body}
					reportContent={{
						authorLogin: reply.author?.login,
						authorType: reply.author?.type,
					}}
					referenceIssue={{
						owner,
						repo,
						authorLogin: reply.author?.login,
					}}
					canEdit={canManage}
					canDelete={canManage}
					onEdit={() => {
						setEditBody(reply.body);
						setEditError(null);
						setIsEditing(true);
					}}
					onDelete={async () => {
						const result = await deleteDiscussionComment(
							owner,
							repo,
							discussionNumber,
							reply.id,
						);
						if (result.error) {
							alert(result.error);
							return;
						}
						setDeleted(true);
						await refreshComments();
					}}
				/>
			</div>
			{isEditing ? (
				<InlineDiscussionEditor
					value={editBody}
					onChange={setEditBody}
					onCancel={() => {
						setEditBody(reply.body);
						setEditError(null);
						setIsEditing(false);
					}}
					onSave={handleSave}
					error={editError}
					isSaving={isSaving}
					owner={owner}
					rows={4}
				/>
			) : (
				renderedBody && <div className="px-3 py-2">{renderedBody}</div>
			)}
			<div className="px-3 pb-2">
				<DiscussionReactionDisplay
					reactions={reply.reactions as Reactions | undefined}
					subjectId={reply.id}
					upvoteCount={reply.upvoteCount}
					viewerHasUpvoted={reply.viewerHasUpvoted}
					showUpvote
				/>
			</div>
		</div>
	);
}
