import Link from "next/link";
import Image from "next/image";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GitHubEmoji } from "@/components/shared/github-emoji";
import { TimeAgo } from "@/components/ui/time-ago";
import { DiscussionUpvoteButton } from "@/components/discussion/discussion-upvote-button";

interface DiscussionHeaderProps {
	title: string;
	number: number;
	discussionId: string;
	category: { name: string; emoji: string; emojiHTML?: string | null; isAnswerable: boolean };
	isAnswered: boolean;
	upvoteCount: number;
	viewerHasUpvoted: boolean;
	author: { login: string; avatar_url: string } | null;
	createdAt: string;
	commentsCount: number;
	labels: Array<{ name?: string; color?: string }>;
}

export function DiscussionHeader({
	title,
	number,
	discussionId,
	category,
	isAnswered,
	upvoteCount,
	viewerHasUpvoted,
	author,
	createdAt,
	commentsCount,
	labels,
}: DiscussionHeaderProps) {
	return (
		<div className="mb-6">
			<h1 className="text-base font-medium tracking-tight mb-2">
				{title}{" "}
				<span className="text-muted-foreground/50 font-normal">
					#{number}
				</span>
			</h1>
			<div className="flex items-center gap-3 flex-wrap">
				{/* Category pill */}
				<span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground/70">
					<GitHubEmoji emojiHTML={category.emojiHTML} />{" "}
					{category.name}
				</span>

				{/* Answered badge */}
				{isAnswered ? (
					<span
						className={cn(
							"inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono",
							"text-success",
						)}
					>
						<CheckCircle2 className="w-3 h-3" />
						Answered
					</span>
				) : (
					<span
						className={cn(
							"inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono",
							"text-muted-foreground/60",
						)}
					>
						<MessageCircle className="w-3 h-3" />
						Open
					</span>
				)}

				{/* Upvotes */}
				<DiscussionUpvoteButton
					discussionId={discussionId}
					upvoteCount={upvoteCount}
					viewerHasUpvoted={viewerHasUpvoted}
				/>

				{/* Author + date */}
				{author && (
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Link
							href={`/users/${author.login}`}
							className="flex items-center gap-1.5 hover:text-foreground transition-colors"
						>
							<Image
								src={author.avatar_url}
								alt={author.login}
								width={16}
								height={16}
								className="rounded-full"
							/>
							<span className="font-mono">
								{author.login}
							</span>
						</Link>
						<span className="text-muted-foreground/50">
							started <TimeAgo date={createdAt} />
						</span>
					</span>
				)}

				{/* Comments count */}
				<span className="text-[11px] text-muted-foreground/50 font-mono">
					{commentsCount} comment{commentsCount !== 1 ? "s" : ""}
				</span>

				{/* Labels */}
				{labels
					.filter((l) => l.name)
					.map((label) => (
						<span
							key={label.name}
							className="text-[9px] font-mono px-2 py-0.5 border rounded-full"
							style={{
								borderColor: `#${label.color || "888"}30`,
								color: `#${label.color || "888"}`,
							}}
						>
							{label.name}
						</span>
					))}
			</div>
		</div>
	);
}
