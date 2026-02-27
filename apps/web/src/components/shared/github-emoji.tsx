import { cn } from "@/lib/utils";

interface GitHubEmojiProps {
	emoji: string;
	emojiHTML?: string | null;
	className?: string;
}

export function GitHubEmoji({ emoji, emojiHTML, className }: GitHubEmojiProps) {
	if (emojiHTML) {
		return (
			<span
				aria-hidden="true"
				className={cn("inline-flex items-center", className)}
				dangerouslySetInnerHTML={{ __html: emojiHTML }}
			/>
		);
	}

	return (
		<span aria-hidden="true" className={className}>
			{emoji}
		</span>
	);
}
