import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/link", () => ({
	default: ({ children, href, ...props }: any) => (
		<a href={typeof href === "string" ? href : "#"} {...props}>
			{children}
		</a>
	),
}));

mock.module("next/image", () => ({
	default: ({ alt, ...props }: any) => <img alt={alt ?? ""} {...props} />,
}));

mock.module("@/components/shared/markdown-copy-handler", () => ({
	MarkdownCopyHandler: ({ children }: any) => <>{children}</>,
}));

mock.module("@/components/shared/reactive-code-blocks", () => ({
	ReactiveCodeBlocks: ({ children }: any) => <>{children}</>,
}));

mock.module("@/components/shared/user-tooltip", () => ({
	UserTooltip: ({ children }: any) => <>{children}</>,
}));

mock.module("@/components/ui/time-ago", () => ({
	TimeAgo: ({ date }: { date: string }) => <time>{date}</time>,
}));

mock.module("@/components/issue/collapsible-body", () => ({
	CollapsibleBody: ({ children }: any) => <>{children}</>,
}));

mock.module("@/components/pr/bot-activity-group", () => ({
	BotActivityGroup: ({ children }: any) => <>{children}</>,
}));

mock.module("@/components/discussion/discussion-reaction-display", () => ({
	DiscussionReactionDisplay: () => <div data-testid="discussion-reactions" />,
}));

mock.module("@/components/shared/markdown-editor", () => ({
	MarkdownEditor: () => <div data-testid="markdown-editor" />,
}));

mock.module("@/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

mock.module("next/navigation", () => ({
	useRouter: () => ({ refresh: () => {} }),
}));

mock.module("@/app/(app)/repos/[owner]/[repo]/discussions/discussion-actions", () => ({
	deleteDiscussionCommentAction: mock(async () => ({ success: true })),
	updateDiscussionCommentAction: mock(async () => ({ success: true })),
}));

mock.module("@/components/discussion/discussion-actions-menu", () => ({
	DiscussionActionsMenu: () => (
		<button type="button" aria-label="Discussion comment actions">
			Actions
		</button>
	),
}));

mock.module("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: any) => <>{children}</>,
	DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
	DropdownMenuContent: ({ children }: any) => <>{children}</>,
	DropdownMenuItem: ({ children }: any) => <>{children}</>,
	DropdownMenuSeparator: () => <hr />,
}));

describe("DiscussionConversation", () => {
	it("renders action triggers for discussion comments and replies", async () => {
		const { DiscussionConversation } = await import("./discussion-conversation");

		const html = renderToStaticMarkup(
			<DiscussionConversation
				owner="acme"
				repo="widgets"
				discussionNumber={1}
				description={{
					body: "Opening post",
					bodyHtml: "<p>Opening post</p>",
					author: {
						login: "author",
						avatar_url: "https://example.com/author.png",
					},
					createdAt: "2026-03-01T00:00:00Z",
				}}
				comments={[
					{
						id: "comment-1",
						databaseId: 101,
						body: "Top level comment",
						bodyHtml: "<p>Top level comment</p>",
						createdAt: "2026-03-02T00:00:00Z",
						author: {
							login: "jake",
							avatar_url: "https://example.com/jake.png",
							type: "User",
						},
						upvoteCount: 0,
						viewerHasUpvoted: false,
						viewerCanUpdate: true,
						isAnswer: false,
						url: "https://github.com/acme/widgets/discussions/1#discussioncomment-101",
						viewerCanDelete: true,
						replies: [
							{
								id: "reply-1",
								databaseId: 102,
								body: "Nested reply",
								bodyHtml: "<p>Nested reply</p>",
								createdAt: "2026-03-03T00:00:00Z",
								author: {
									login: "jake",
									avatar_url: "https://example.com/jake.png",
									type: "User",
								},
								upvoteCount: 0,
								viewerHasUpvoted: false,
								viewerCanUpdate: true,
								isAnswer: false,
								url: "https://github.com/acme/widgets/discussions/1#discussioncomment-102",
								viewerCanDelete: true,
							},
						],
					},
				]}
			/>,
		);

		expect(html.match(/aria-label="Discussion comment actions"/g)?.length).toBe(2);
	});
});
