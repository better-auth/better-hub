"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";

const reviewStateBadge: Record<string, { label: string; className: string }> = {
	APPROVED: {
		label: "approved",
		className: "text-success border-success/20 bg-success/5",
	},
	CHANGES_REQUESTED: {
		label: "changes requested",
		className: "text-warning border-warning/20 bg-warning/5",
	},
	COMMENTED: {
		label: "reviewed",
		className: "text-info border-info/20 bg-info/5",
	},
	DISMISSED: {
		label: "dismissed",
		className: "text-muted-foreground border-muted-foreground/20 bg-muted-foreground/5",
	},
};

interface ReviewComment {
	id: number;
	body: string;
	path: string;
	line: number | null;
	reactions?: Reactions;
}

interface CollapsibleReviewCardProps {
	user: { login: string; avatar_url: string } | null;
	state: string;
	timestamp: string;
	comments: ReviewComment[];
	bodyContent: React.ReactNode;
	owner: string;
	repo: string;
}

export function CollapsibleReviewCard({
	user,
	state,
	timestamp,
	comments,
	bodyContent,
	owner,
	repo,
}: CollapsibleReviewCardProps) {
	const [expanded, setExpanded] = useState(true);
	const badge = reviewStateBadge[state] || reviewStateBadge.COMMENTED;
	const hasContent = bodyContent || comments.length > 0;

	return (
		<div className="group">
			<div className="border border-border/60 rounded-lg overflow-hidden">
				{/* Review header — clickable to collapse */}
				<button
					onClick={() => hasContent && setExpanded((e) => !e)}
					className={cn(
						"w-full flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-card/50 text-left",
						hasContent &&
							"cursor-pointer hover:bg-card/80 transition-colors",
					)}
				>
					{hasContent && (
						<ChevronDown
							className={cn(
								"w-3 h-3 text-muted-foreground/40 transition-transform duration-200 shrink-0",
								!expanded && "-rotate-90",
							)}
						/>
					)}
					{user ? (
						<Link
							href={`/users/${user.login}`}
							onClick={(e) => e.stopPropagation()}
							className="flex items-center gap-2 text-xs font-medium text-foreground/80 hover:text-foreground hover:underline transition-colors"
						>
							<Image
								src={user.avatar_url}
								alt={user.login}
								width={16}
								height={16}
								className="rounded-full shrink-0"
							/>
							{user.login}
						</Link>
					) : (
						<>
							<div className="w-4 h-4 rounded-full bg-muted-foreground shrink-0" />
							<span className="text-xs font-medium text-foreground/80">
								ghost
							</span>
						</>
					)}
					<span
						className={cn(
							"text-[9px] px-1.5 py-px border rounded",
							badge.className,
						)}
					>
						{badge.label}
					</span>
					{!expanded && comments.length > 0 && (
						<span className="text-[10px] text-muted-foreground/40">
							{comments.length} comment
							{comments.length !== 1 ? "s" : ""}
						</span>
					)}
					<span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
						<TimeAgo date={timestamp} />
					</span>
				</button>

				{/* Collapsible body */}
				<div
					className={cn(
						"transition-all duration-200 ease-out overflow-hidden",
						expanded
							? "max-h-[2000px] opacity-100"
							: "max-h-0 opacity-0",
					)}
				>
					{/* Server-rendered markdown body */}
					{bodyContent}

					{/* Nested review comments */}
					{comments.length > 0 && (
						<div
							className={cn(
								bodyContent &&
									"border-t border-border/40",
							)}
						>
							{comments.map((comment) => (
								<div
									key={comment.id}
									className="px-3 py-2 border-b border-border/30 last:border-b-0"
								>
									<div className="flex items-center gap-1.5 mb-1">
										<span className="text-[10px] text-muted-foreground/50 truncate font-mono">
											{
												comment.path
											}
											{comment.line !==
												null &&
												`:${comment.line}`}
										</span>
									</div>
									<div className="text-xs text-foreground/70">
										<ClientMarkdown
											content={
												comment.body
											}
										/>
									</div>
									<div className="mt-1">
										<ReactionDisplay
											reactions={
												comment.reactions ??
												{}
											}
											owner={
												owner
											}
											repo={repo}
											contentType="pullRequestReviewComment"
											contentId={
												comment.id
											}
										/>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
