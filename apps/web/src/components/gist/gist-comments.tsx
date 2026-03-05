import { CommentThread } from "@/components/shared/comment-thread";
import type { GistComment, GistDetail } from "@/lib/github-types";

interface GistCommentsProps {
	gist: GistDetail;
	comments: GistComment[];
}

export function GistComments({ gist, comments }: GistCommentsProps) {
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
