"use client";

import Image from "next/image";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { TimeAgo } from "@/components/ui/time-ago";
import type { KanbanComment } from "@/lib/kanban-store";

interface KanbanCommentCardProps {
	comment: KanbanComment;
	currentUserId?: string;
	isEditing?: boolean;
	editingBody?: string;
	onEditingBodyChange?: (body: string) => void;
	onStartEdit?: () => void;
	onCancelEdit?: () => void;
	onSaveEdit?: () => void;
	onDelete?: () => void;
	isSaving?: boolean;
	variant?: "default" | "compact";
}

export function KanbanCommentCard({
	comment,
	currentUserId,
	isEditing = false,
	editingBody = "",
	onEditingBodyChange,
	onStartEdit,
	onCancelEdit,
	onSaveEdit,
	onDelete,
	isSaving = false,
	variant = "default",
}: KanbanCommentCardProps) {
	const isOptimistic = comment.id.startsWith("optimistic-");
	const canEdit = currentUserId === comment.userId && !isOptimistic;
	const isCompact = variant === "compact";

	const avatarSize = isCompact ? 20 : 24;
	const textSize = isCompact ? "text-xs" : "text-sm";
	const timeSize = isCompact ? "text-[10px]" : "text-xs";
	const iconSize = isCompact ? "w-3 h-3" : "w-3.5 h-3.5";
	const padding = isCompact ? "p-3" : "p-4";
	const gap = isCompact ? "gap-2" : "gap-3";
	const contentPadding = isCompact ? "pl-7" : "pl-9";

	return (
		<div
			className={cn(
				"border border-border/50 rounded-lg bg-background",
				padding,
				"space-y-1.5",
				isOptimistic && "opacity-60",
			)}
		>
			<div className={cn("flex items-center", gap)}>
				{comment.userAvatarUrl ? (
					<Image
						src={comment.userAvatarUrl}
						alt={comment.userName}
						width={avatarSize}
						height={avatarSize}
						className="rounded-full shrink-0"
					/>
				) : (
					<div
						className="rounded-full bg-muted shrink-0"
						style={{ width: avatarSize, height: avatarSize }}
					/>
				)}
				<div className="flex items-center gap-1.5 flex-1 min-w-0">
					{comment.userLogin ? (
						<Link
							href={`/users/${comment.userLogin}`}
							className={cn(
								textSize,
								"font-medium text-foreground hover:underline truncate",
							)}
						>
							{comment.userName}
						</Link>
					) : (
						<span
							className={cn(
								textSize,
								"font-medium text-foreground truncate",
							)}
						>
							{comment.userName}
						</span>
					)}
					<span
						className={cn(
							timeSize,
							"text-muted-foreground/50 font-mono shrink-0",
						)}
					>
						<TimeAgo date={comment.createdAt} />
					</span>
					{comment.updatedAt !== comment.createdAt && (
						<span className="text-[9px] text-muted-foreground/40 shrink-0">
							(edited)
						</span>
					)}
				</div>
				{canEdit && (
					<div className="flex items-center gap-0.5 shrink-0">
						{!isEditing && onStartEdit && (
							<button
								onClick={onStartEdit}
								className="text-muted-foreground/30 hover:text-foreground transition-colors cursor-pointer p-0.5"
								title="Edit comment"
							>
								<Pencil className={iconSize} />
							</button>
						)}
						{onDelete && (
							<button
								onClick={onDelete}
								className="text-muted-foreground/30 hover:text-red-400 transition-colors cursor-pointer p-0.5"
								title="Delete comment"
							>
								<Trash2 className={iconSize} />
							</button>
						)}
					</div>
				)}
			</div>

			{isEditing ? (
				<div className={cn(contentPadding, "space-y-2")}>
					<textarea
						value={editingBody}
						onChange={(e) =>
							onEditingBodyChange?.(e.target.value)
						}
						className={cn(
							"w-full min-h-[60px] p-2 bg-muted/30 border border-border rounded-md resize-y",
							"focus:outline-none focus:ring-1 focus:ring-primary/50",
							isCompact ? "text-xs" : "text-sm",
						)}
						autoFocus
					/>
					<div className="flex items-center justify-between">
						<span
							className={cn(
								"text-[10px]",
								editingBody.trim().length > 10000
									? "text-red-400"
									: "text-muted-foreground/50",
							)}
						>
							{editingBody.trim().length}/10000
						</span>
						<div className="flex items-center gap-1.5">
							<button
								onClick={onCancelEdit}
								className="text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground transition-colors rounded"
							>
								Cancel
							</button>
							<button
								onClick={onSaveEdit}
								disabled={
									!editingBody.trim() ||
									editingBody.trim().length >
										10000 ||
									isSaving
								}
								className={cn(
									"text-[10px] px-2 py-1 bg-primary text-primary-foreground rounded",
									"disabled:opacity-50 disabled:cursor-not-allowed",
									"hover:bg-primary/90 transition-colors",
								)}
							>
								{isSaving ? "Saving..." : "Save"}
							</button>
						</div>
					</div>
				</div>
			) : (
				<div className={cn(contentPadding, textSize)}>
					<ClientMarkdown content={comment.body} />
				</div>
			)}
		</div>
	);
}
