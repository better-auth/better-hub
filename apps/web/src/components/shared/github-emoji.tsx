import { cn } from "@/lib/utils";

interface GitHubEmojiProps {
	emojiHTML?: string | null;
	className?: string;
}

export function GitHubEmoji({ emojiHTML, className }: GitHubEmojiProps) {
	if (!emojiHTML) return null;
	return (
		<span
			aria-hidden="true"
			className={cn("inline-flex items-center", className)}
			dangerouslySetInnerHTML={{ __html: emojiHTML }}
		/>
	);
}
