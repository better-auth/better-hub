"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { TimeAgo } from "@/components/ui/time-ago";
import { ClientMarkdown } from "@/components/shared/client-markdown";

interface OptimisticComment {
	id: number;
	body: string;
	created_at: string;
	userAvatarUrl?: string;
	userName?: string;
}

interface PROptimisticCommentsContextValue {
	comments: OptimisticComment[];
	addComment: (comment: {
		body: string;
		userAvatarUrl?: string | undefined;
		userName?: string | undefined;
	}) => number;
	removeComment: (id: number) => void;
}

const PROptimisticCommentsContext = createContext<PROptimisticCommentsContextValue | null>(null);

export function usePROptimisticComments() {
	const ctx = useContext(PROptimisticCommentsContext);
	if (!ctx)
		throw new Error(
			"usePROptimisticComments must be used within PROptimisticCommentsProvider",
		);
	return ctx;
}

export function PROptimisticCommentsProvider({
	serverCommentCount,
	children,
}: {
	serverCommentCount: number;
	children: React.ReactNode;
}) {
	const [comments, setComments] = useState<OptimisticComment[]>([]);
	const initialCountRef = useRef(serverCommentCount);

	// Clear optimistic comments when server comment count increases
	// (server has caught up after router.refresh())
	useEffect(() => {
		if (serverCommentCount > initialCountRef.current) {
			setComments([]);
			initialCountRef.current = serverCommentCount;
		}
	}, [serverCommentCount]);

	const addComment = useCallback(
		(comment: {
			body: string;
			userAvatarUrl?: string | undefined;
			userName?: string | undefined;
		}) => {
			const id = Date.now();
			setComments((prev) => [
				...prev,
				{ ...comment, id, created_at: new Date().toISOString() },
			]);
			return id;
		},
		[],
	);

	const removeComment = useCallback((id: number) => {
		setComments((prev) => prev.filter((c) => c.id !== id));
	}, []);

	return (
		<PROptimisticCommentsContext.Provider
			value={{ comments, addComment, removeComment }}
		>
			{children}
		</PROptimisticCommentsContext.Provider>
	);
}

/** Renders optimistic comments — place inside the conversation scroll area */
export function PROptimisticCommentsDisplay() {
	const { comments } = usePROptimisticComments();
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (comments.length > 0) {
			endRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "end",
			});
		}
	}, [comments.length]);

	if (comments.length === 0) return null;

	return (
		<div className="space-y-3 mt-3">
			{comments.map((c) => (
				<div
					key={c.id}
					className="border border-border/60 rounded-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
				>
					<div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-card/50">
						{c.userAvatarUrl ? (
							<Image
								src={c.userAvatarUrl}
								alt=""
								width={16}
								height={16}
								className="rounded-full shrink-0"
							/>
						) : (
							<div className="w-4 h-4 rounded-full bg-muted-foreground shrink-0" />
						)}
						<span className="text-xs font-medium text-foreground/80">
							{c.userName || "You"}
						</span>
						<span className="text-[10px] text-muted-foreground ml-auto shrink-0">
							<TimeAgo date={c.created_at} />
						</span>
					</div>
					<div className="px-3 py-2.5 text-sm">
						<ClientMarkdown content={c.body} />
					</div>
				</div>
			))}
			<div ref={endRef} />
		</div>
	);
}
