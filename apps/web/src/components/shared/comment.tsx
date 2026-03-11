import Link from "next/link";
import { GithubAvatar } from "./github-avatar";
import { MarkdownRenderer } from "./markdown-renderer";
import { TimeAgo } from "@/components/ui/time-ago";

interface CommentProps {
	author: {
		login: string;
		avatar_url: string;
	} | null;
	body: string;
	createdAt: string;
	association?: string | null;
}

export async function Comment({ author, body, createdAt, association }: CommentProps) {
	return (
		<div className="border border-border">
			<div className="flex items-center gap-2 px-4 py-2 bg-muted/30 dark:bg-white/[0.02] border-b border-border">
				{author ? (
					<Link
						href={`/users/${author.login}`}
						className="flex items-center gap-2 hover:text-foreground transition-colors"
					>
						<GithubAvatar
							src={author.avatar_url}
							alt={author.login}
							size={20}
							className="rounded-full"
						/>
						<span className="text-xs font-mono font-medium">
							{author.login}
						</span>
					</Link>
				) : (
					<span className="text-xs font-mono font-medium">ghost</span>
				)}
				{association && association !== "NONE" && (
					<span className="text-[9px] font-mono px-1 py-0.5 border border-border text-muted-foreground">
						{association.toLowerCase()}
					</span>
				)}
				<span className="text-[11px] text-muted-foreground/50 ml-auto">
					<TimeAgo date={createdAt} />
				</span>
			</div>
			<div className="px-4 py-3">
				{body ? (
					<MarkdownRenderer content={body} />
				) : (
					<p className="text-xs text-muted-foreground/50 italic">
						No description provided.
					</p>
				)}
			</div>
		</div>
	);
}
