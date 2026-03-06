"use client";

import { useState } from "react";
import Image from "next/image";
import { ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanItem, KanbanStatus } from "@/lib/kanban-store";
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
}

export function KanbanCard({
	item,
	isDragging,
	isFocused,
	onOpen,
	onMove,
	onDelete,
}: KanbanCardProps) {
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const assignee = item.kanbanAssigneeLogin ?? item.assigneeLogin;
	const assigneeAvatar = item.kanbanAssigneeAvatar ?? item.assigneeAvatar;

	return (
		<div
			className={cn(
				"bg-background border rounded-md p-3 cursor-pointer outline-none!",
				"hover:border-border hover:shadow-sm transition-all",
				isDragging && "shadow-lg border-border rotate-2",
				isFocused && "ring-2 ring-primary/50 border-primary/50",
			)}
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
		>
			<div className="flex items-start justify-between gap-2 mb-2">
				<h3 className="text-sm font-medium line-clamp-2 flex-1">
					{item.issueTitle}
				</h3>
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

			{item.aiSummary && (
				<p className="text-xs text-muted-foreground/70 line-clamp-2 mb-2">
					{item.aiSummary}
				</p>
			)}

			<div className="flex items-center justify-between">
				<span className="text-[10px] font-mono text-muted-foreground/50">
					#{item.issueNumber}
				</span>
				{assignee && (
					<div className="flex items-center gap-1.5">
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
						<span className="text-[10px] text-muted-foreground/60">
							{assignee}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
