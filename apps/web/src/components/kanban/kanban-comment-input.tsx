"use client";

import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "@/components/shared/markdown-editor";

interface KanbanCommentInputProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	isSubmitting?: boolean;
	placeholder?: string;
	rows?: number;
	variant?: "default" | "compact";
}

export function KanbanCommentInput({
	value,
	onChange,
	onSubmit,
	isSubmitting = false,
	placeholder = "Leave a comment...",
	rows = 4,
	variant = "default",
}: KanbanCommentInputProps) {
	const isCompact = variant === "compact";

	return (
		<div className="rounded-none border-y border-x-0 border-border overflow-hidden">
			<MarkdownEditor
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				rows={rows}
				className={cn("border-none rounded-none", isCompact && "text-xs")}
				resizeYIndicator={false}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						onSubmit();
					}
				}}
			/>
			<div
				className={cn(
					"flex items-center justify-between bg-muted/30 border-t border-border/50",
					isCompact ? "px-2.5 py-1.5" : "px-3 py-2",
				)}
			>
				<span
					className={cn(
						"text-muted-foreground/50",
						isCompact ? "text-[9px]" : "text-xs",
					)}
				>
					{isCompact ? (
						<>
							<kbd
								className={cn(
									"bg-muted border border-border rounded",
									isCompact
										? "px-1 py-0.5 text-[8px]"
										: "px-1 py-0.5 text-[10px]",
								)}
							>
								⌘
							</kbd>{" "}
							+{" "}
							<kbd
								className={cn(
									"bg-muted border border-border rounded",
									isCompact
										? "px-1 py-0.5 text-[8px]"
										: "px-1 py-0.5 text-[10px]",
								)}
							>
								↵
							</kbd>
						</>
					) : (
						<>
							Press{" "}
							<kbd className="px-1 py-0.5 text-[10px] bg-muted border border-border rounded">
								⌘
							</kbd>{" "}
							+{" "}
							<kbd className="px-1 py-0.5 text-[10px] bg-muted border border-border rounded">
								Enter
							</kbd>{" "}
							to submit
						</>
					)}
				</span>
				<button
					onClick={onSubmit}
					disabled={!value.trim() || isSubmitting}
					className={cn(
						"flex items-center gap-1 font-medium rounded",
						"bg-primary text-primary-foreground",
						"hover:bg-primary/90 transition-colors cursor-pointer",
						"disabled:opacity-40 disabled:cursor-not-allowed",
						isCompact
							? "px-2 py-1 text-[10px]"
							: "px-3 py-1.5 text-xs",
					)}
				>
					{isSubmitting ? (
						<Loader2
							className={cn(
								"animate-spin",
								isCompact
									? "w-3 h-3"
									: "w-3.5 h-3.5",
							)}
						/>
					) : (
						<Send
							className={
								isCompact
									? "w-3 h-3"
									: "w-3.5 h-3.5"
							}
						/>
					)}
					{isCompact ? "Send" : "Comment"}
				</button>
			</div>
		</div>
	);
}
