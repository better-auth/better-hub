import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
	useRouter: () => ({ refresh: () => {} }),
}));

mock.module("@/components/shared/mutation-event-provider", () => ({
	useMutationEvents: () => ({ emit: () => {}, subscribe: () => () => {} }),
}));

mock.module("@/app/(app)/repos/[owner]/[repo]/discussions/discussion-actions", () => ({
	deleteDiscussionCommentAction: mock(async () => ({ success: true })),
}));

mock.module("@/lib/comment-quote", () => ({
	formatQuotedReplyMarkdown: (body: string) => `> ${body}\n\n`,
}));

mock.module("@/components/shared/comment-actions-menu", () => ({
	CommentActionsMenu: ({
		canEdit,
		canDelete,
	}: {
		canEdit?: boolean;
		canDelete?: boolean;
	}) => (
		<div
			aria-label="Discussion comment actions"
			data-can-edit={canEdit ? "true" : "false"}
			data-can-delete={canDelete ? "true" : "false"}
		>
			Copy link Copy text Quote reply
			{canEdit ? "Edit" : ""}
			{canDelete ? "Delete" : ""}
		</div>
	),
}));

mock.module("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: any) => <>{children}</>,
	DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
	DropdownMenuContent: ({ children }: any) => <>{children}</>,
	DropdownMenuItem: ({ children }: any) => <>{children}</>,
	DropdownMenuSeparator: () => <hr />,
}));

describe("DiscussionActionsMenu", () => {
	it("renders the expected actions for deletable comments", async () => {
		const { DiscussionActionsMenu } = await import("./discussion-actions-menu");

		const html = renderToStaticMarkup(
			<DiscussionActionsMenu
				owner="acme"
				repo="widgets"
				discussionNumber={1}
				commentId="comment-node-id"
				body={"hello\nworld"}
				url="https://github.com/acme/widgets/discussions/1#discussioncomment-101"
				canEdit
				canDelete
				onEdit={() => {}}
			/>,
		);

		expect(html).toContain('aria-label="Discussion comment actions"');
		expect(html).toContain("Copy link");
		expect(html).toContain("Copy text");
		expect(html).toContain("Quote reply");
		expect(html).toContain("Edit");
		expect(html).toContain("Delete");
	});
});
