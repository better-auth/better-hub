"use client";

import { MessageSquare } from "lucide-react";

interface KanbanCommentsEmptyProps {
	title?: string;
	subtitle?: string;
}

export function KanbanCommentsEmpty({
	title = "No comments yet",
	subtitle = "Start a discussion with maintainers",
}: KanbanCommentsEmptyProps) {
	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<MessageSquare className="w-8 h-8 text-muted-foreground/20 mb-2" />
			<p className="text-xs text-muted-foreground/50">{title}</p>
			<p className="text-[10px] text-muted-foreground/40 mt-1">{subtitle}</p>
		</div>
	);
}
