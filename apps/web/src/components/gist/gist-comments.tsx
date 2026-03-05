import { CommentThread } from "@/components/shared/comment-thread";
import type { GistComment, GistDetail } from "@/lib/github-types";

interface GistCommentsProps {
	gist: GistDetail;
	comments: GistComment[];
}

export function GistComments({
	// `gist` is reserved for future use (e.g., to show context or allow adding comments)
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	gist,
	comments,
}: GistCommentsProps) {
	return (
		<div className="border border-border rounded-md overflow-hidden">
			<div className="px-4 py-3 border-b border-border bg-muted/30">
				<h3 className="text-sm font-medium">Comments</h3>
			</div>
			<div className="p-4">
				<CommentThread comments={comments} />
			</div>
		</div>
	);
}
