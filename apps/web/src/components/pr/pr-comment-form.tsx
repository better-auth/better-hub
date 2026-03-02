"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { addPRComment } from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { usePROptimisticComments } from "./pr-optimistic-comments-provider";

interface PRCommentFormProps {
	owner: string;
	repo: string;
	pullNumber: number;
	userAvatarUrl?: string;
	userName?: string;
	participants?: Array<{ login: string; avatar_url: string }>;
}

export function PRCommentForm({
	owner,
	repo,
	pullNumber,
	userAvatarUrl,
	userName,
	participants,
}: PRCommentFormProps) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const { addComment, removeComment } = usePROptimisticComments();
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = () => {
		if (!body.trim()) return;
		const commentBody = body.trim();
		setError(null);

		const optimisticId = addComment({
			body: commentBody,
			userAvatarUrl: userAvatarUrl,
			userName: userName,
		});
		setBody("");

		(async () => {
			const res = await addPRComment(owner, repo, pullNumber, commentBody);
			if (res.error) {
				setError(res.error);
				removeComment(optimisticId);
				setBody(commentBody);
			} else {
				emit({ type: "pr:commented", owner, repo, number: pullNumber });
				router.refresh();
			}
		})();
	};

	return (
		<div className="space-y-3">
			<div className="border border-border/60 rounded-md overflow-hidden">
				<MarkdownEditor
					value={body}
					onChange={setBody}
					placeholder="Leave a comment..."
					className="border-none"
					rows={3}
					participants={participants}
					owner={owner}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							handleSubmit();
						}
					}}
					resizeYIndicator={false}
				/>
				<div className="flex items-center justify-between m-2">
					<div>
						{error && (
							<span className="text-xs text-destructive">
								{error}
							</span>
						)}
					</div>
					<button
						onClick={handleSubmit}
						disabled={!body.trim()}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
							"border border-border",
							"text-foreground/80 hover:text-foreground hover:bg-muted/60",
							"transition-colors cursor-pointer",
							"disabled:opacity-40 disabled:cursor-not-allowed",
						)}
					>
						<CornerDownLeft className="w-3.5 h-3.5" />
						Comment
					</button>
				</div>
			</div>
		</div>
	);
}
