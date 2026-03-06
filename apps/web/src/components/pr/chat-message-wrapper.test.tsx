import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
	useRouter: () => ({ refresh: () => {} }),
}));

mock.module("@/components/shared/markdown-editor", () => ({
	MarkdownEditor: () => <div data-testid="markdown-editor" />,
}));

mock.module("@/app/(app)/repos/[owner]/[repo]/issues/issue-actions", () => ({
	updateIssueComment: mock(async () => ({ success: true })),
}));

mock.module("./deleted-comments-context", () => ({
	useDeletedComments: () => null,
}));

mock.module("@/components/shared/mutation-event-provider", () => ({
	useMutationEvents: () => ({ emit: () => {}, subscribe: () => () => {} }),
}));

mock.module("@/lib/comment-quote", () => ({
	formatQuotedReplyMarkdown: (body: string) => `> ${body}\n\n`,
}));

mock.module("./message-actions-menu", () => ({
	MessageActionsMenu: ({
		onEdit,
		contentType,
	}: {
		onEdit?: () => void;
		contentType: string;
	}) => <div data-content-type={contentType} data-can-edit={onEdit ? "true" : "false"} />,
}));

describe("ChatMessageWrapper", () => {
	it("passes edit capability through for PR timeline comments", async () => {
		const { ChatMessageWrapper } = await import("./chat-message-wrapper");

		const html = renderToStaticMarkup(
			<ChatMessageWrapper
				headerContent={<div>header</div>}
				bodyContent={<div>body</div>}
				reactionsContent={<div>reactions</div>}
				owner="acme"
				repo="widgets"
				contentType="pr"
				pullNumber={12}
				commentId={123}
				body="hello"
				canEdit
				canDelete
			/>,
		);

		expect(html).toContain('data-content-type="pr"');
		expect(html).toContain('data-can-edit="true"');
	});
});
