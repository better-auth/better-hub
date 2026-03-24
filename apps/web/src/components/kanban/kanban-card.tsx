"use client";

import { useState } from "react";
import Image from "next/image";
import {
	ExternalLink,
	MoreHorizontal,
	Trash2,
	MessageCircle,
	MessageSquare,
	CheckCircle2,
	Clock,
	GitPullRequest,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanItem, KanbanStatus, KanbanLabel } from "@/lib/kanban-store";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { TimeAgo } from "@/components/ui/time-ago";

const STATUS_LABELS: Record<KanbanStatus, string> = {
	backlog: "Backlog",
	todo: "To Do",
	"in-progress": "In Progress",
	"in-review": "In Review",
	done: "Done",
};

interface KanbanCardProps {
	item: KanbanItem;
	isDragging: boolean;
	isFocused: boolean;
	onOpen: () => void;
	onMove: (status: KanbanStatus) => void;
	onDelete: () => void;
	maintainerCommentCount?: number;
	isLoading?: boolean;
}

function LabelPill({ label }: { label: KanbanLabel }) {
	const color = label.color || "888";
	return (
		<span
			className="text-[9px] font-mono px-1.5 py-0.5 rounded-full whitespace-nowrap"
			style={{
				backgroundColor: `#${color}18`,
				color: `#${color}`,
			}}
		>
			{label.name}
		</span>
	);
}

export function KanbanCard({
	item,
	isDragging,
	isFocused,
	onOpen,
	onMove,
	onDelete,
	maintainerCommentCount = 0,
	isLoading = false,
}: KanbanCardProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const assignee = item.kanbanAssigneeLogin ?? item.assigneeLogin;
	const assigneeAvatar = item.kanbanAssigneeAvatar ?? item.assigneeAvatar;
	const totalComments = item.issueCommentCount + maintainerCommentCount;
	const isClosed = item.issueState === "closed";

	return (
		<div
			className={cn(
				"bg-background border rounded-md p-3 cursor-pointer outline-none!",
				"hover:border-border hover:shadow-sm transition-all",
				isDragging && "shadow-lg border-border rotate-2",
				isClosed && "opacity-70",
				isLoading && "opacity-50 pointer-events-none animate-pulse",
			)}
			onClick={isLoading ? undefined : onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
		>
			<div className="flex items-start justify-between gap-2 mb-2">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5 mb-1">
						{isClosed && (
							<CheckCircle2 className="w-3.5 h-3.5 text-purple-500 shrink-0" />
						)}
						<h3
							className={cn(
								"text-sm font-medium line-clamp-2",
								isClosed &&
									"line-through opacity-70",
							)}
						>
							{item.issueTitle}
						</h3>
					</div>
				</div>
				<DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
					<DropdownMenuTrigger asChild>
						<button
							onClick={(e) => e.stopPropagation()}
							className={cn(
								"p-1 rounded-md shrink-0",
								"text-muted-foreground/40 hover:text-muted-foreground",
								"hover:bg-muted/50 transition-colors",
							)}
						>
							<MoreHorizontal className="w-4 h-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						sideOffset={4}
						className="min-w-[160px]"
						onClick={(e) => e.stopPropagation()}
					>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="text-xs">
								Move to
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent
								sideOffset={8}
								className="min-w-[140px]"
							>
								{(
									Object.keys(
										STATUS_LABELS,
									) as KanbanStatus[]
								).map((status) => (
									<DropdownMenuItem
										key={status}
										disabled={
											status ===
											item.status
										}
										onClick={() => {
											onMove(
												status,
											);
											setIsMenuOpen(
												false,
											);
										}}
										className={cn(
											"text-xs",
											status ===
												item.status &&
												"opacity-50",
										)}
									>
										{
											STATUS_LABELS[
												status
											]
										}
									</DropdownMenuItem>
								))}
							</DropdownMenuSubContent>
						</DropdownMenuSub>

						<DropdownMenuItem
							onClick={() =>
								window.open(item.issueUrl, "_blank")
							}
							className="text-xs"
						>
							<ExternalLink className="w-3.5 h-3.5" />
							Open on GitHub
						</DropdownMenuItem>

						<DropdownMenuSeparator />

						<DropdownMenuItem
							onClick={() => {
								onDelete();
								setIsMenuOpen(false);
							}}
							className="text-xs text-red-400 focus:bg-red-500/10"
						>
							<Trash2 className="w-3.5 h-3.5" />
							Remove from board
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Labels */}
			{item.labels && item.labels.length > 0 && (
				<div className="flex flex-wrap gap-1 mb-2">
					{item.labels.slice(0, 3).map((label) => (
						<LabelPill key={label.name} label={label} />
					))}
					{item.labels.length > 3 && (
						<span className="text-[9px] text-muted-foreground/50 self-center">
							+{item.labels.length - 3}
						</span>
					)}
				</div>
			)}

			{item.aiSummary && (
				<p className="text-xs text-muted-foreground/70 line-clamp-2 mb-2">
					{item.aiSummary}
				</p>
			)}

			{/* Footer with metadata */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-[10px] font-mono text-muted-foreground/50">
						#{item.issueNumber}
					</span>

					{/* Comments indicator */}
					{totalComments > 0 && (
						<div
							className="flex items-center gap-0.5 text-muted-foreground/50"
							title={`${item.issueCommentCount} issue comments${maintainerCommentCount > 0 ? `, ${maintainerCommentCount} maintainer comments` : ""}`}
						>
							<MessageCircle className="w-3 h-3" />
							<span className="text-[10px]">
								{totalComments}
							</span>
						</div>
					)}

					{/* Maintainer comments badge */}
					{maintainerCommentCount > 0 && (
						<div
							className="flex items-center gap-0.5 text-amber-500/70"
							title={`${maintainerCommentCount} maintainer comments`}
						>
							<MessageSquare className="w-3 h-3" />
							<span className="text-[10px]">
								{maintainerCommentCount}
							</span>
						</div>
					)}

					{/* Linked PRs indicator */}
					{item.linkedPRs && item.linkedPRs.length > 0 && (
						<div
							className={cn(
								"flex items-center gap-0.5",
								item.linkedPRs.some(
									(pr) =>
										pr.state ===
											"open" &&
										!pr.draft,
								)
									? "text-green-500/70"
									: item.linkedPRs.some(
												(
													pr,
												) =>
													pr.merged,
										  )
										? "text-purple-500/70"
										: "text-muted-foreground/50",
							)}
							title={`${item.linkedPRs.length} linked PR${item.linkedPRs.length !== 1 ? "s" : ""}`}
						>
							<GitPullRequest className="w-3 h-3" />
							<span className="text-[10px]">
								{item.linkedPRs.length}
							</span>
						</div>
					)}

					{/* Updated time */}
					<div
						className="flex items-center gap-0.5 text-muted-foreground/40"
						title={`Updated ${new Date(item.updatedAt).toLocaleString()}`}
					>
						<Clock className="w-2.5 h-2.5" />
						<span className="text-[9px]">
							<TimeAgo date={item.updatedAt} />
						</span>
					</div>
				</div>

				{assignee && (
					<div className="flex items-center gap-1.5 shrink-0">
						{assigneeAvatar ? (
							<Image
								src={assigneeAvatar}
								alt={assignee}
								width={16}
								height={16}
								className="rounded-full"
							/>
						) : (
							<div className="w-4 h-4 rounded-full bg-muted" />
						)}
						<span className="text-[10px] text-muted-foreground/60 max-w-[60px] truncate">
							{assignee}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
