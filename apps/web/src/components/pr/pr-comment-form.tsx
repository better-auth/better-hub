"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { addPRComment } from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface OptimisticComment {
	id: number;
	body: string;
	created_at: string;
}

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
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [optimisticComments, setOptimisticComments] = useState<OptimisticComment[]>([]);

	const handleSubmit = () => {
		if (!body.trim()) return;
		const commentBody = body.trim();
		setError(null);

		const optimisticId = Date.now();
		setOptimisticComments((prev) => [
			...prev,
			{
				id: optimisticId,
				body: commentBody,
				created_at: new Date().toISOString(),
			},
		]);
		setBody("");

		(async () => {
			const res = await addPRComment(owner, repo, pullNumber, commentBody);
			if (res.error) {
				setError(res.error);
				setOptimisticComments((prev) =>
					prev.filter((c) => c.id !== optimisticId),
				);
				setBody(commentBody);
			} else {
				emit({ type: "pr:commented", owner, repo, number: pullNumber });
				router.refresh();
				setTimeout(
					() =>
						setOptimisticComments((prev) =>
							prev.filter((c) => c.id !== optimisticId),
						),
					2000,
				);
			}
		})();
	};

	return (
		<div className="space-y-3">
			{/* Optimistic comments */}
			{optimisticComments.map((c) => (
				<div
					key={c.id}
					className="border border-border/60 rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
				>
					<div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-card/50">
						{userAvatarUrl ? (
							<Image
								src={userAvatarUrl}
								alt=""
								width={16}
								height={16}
								className="rounded-full shrink-0"
							/>
						) : (
							<div className="w-4 h-4 rounded-full bg-muted-foreground shrink-0" />
						)}
						<span className="text-xs font-medium text-foreground/80">
							{userName || "You"}
						</span>
						<span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
							<TimeAgo date={c.created_at} />
						</span>
					</div>
					<div className="px-3 py-2.5 text-sm">
						<ClientMarkdown content={c.body} />
					</div>
				</div>
			))}

			{/* Comment form */}
			<div className="border border-border/60 rounded-md overflow-hidden">
				<div className="px-3.5 py-2 border-b border-border/60 bg-card/50">
					<div className="flex items-center gap-2">
						{userAvatarUrl && (
							<Image
								src={userAvatarUrl}
								alt=""
								width={16}
								height={16}
								className="rounded-full shrink-0"
							/>
						)}
						<span className="text-xs font-medium text-muted-foreground/60">
							Add a comment
						</span>
					</div>
				</div>
				<div className="p-2.5">
					<MarkdownEditor
						value={body}
						onChange={setBody}
						placeholder="Leave a comment..."
						rows={3}
						participants={participants}
						owner={owner}
						onKeyDown={(e) => {
							if (
								e.key === "Enter" &&
								(e.metaKey || e.ctrlKey)
							) {
								e.preventDefault();
								handleSubmit();
							}
						}}
					/>
					<div className="flex items-center justify-between mt-2">
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
		</div>
	);
}
