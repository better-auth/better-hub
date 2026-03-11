import { beforeEach, describe, expect, it, mock } from "bun:test";

const updateMock = mock(async () => {
	throw new Error("blocked by oauth restrictions");
});

mock.module("@/lib/github", () => ({
	getOctokit: mock(async () => ({
		issues: {
			createComment: mock(async () => ({})),
			update: updateMock,
		},
	})),
	getIssueComments: mock(async () => []),
	invalidateIssueCache: mock(async () => {}),
}));

mock.module("@/lib/github-write-errors", () => ({
	getGitHubWriteErrorMessage: mock(() => "friendly write error"),
}));

mock.module("@/components/shared/markdown-renderer", () => ({
	renderMarkdownToHtml: mock(async () => "<p></p>"),
}));

mock.module("next/cache", () => ({
	revalidatePath: mock(() => {}),
}));

mock.module("@/lib/repo-data-cache-vc", () => ({
	invalidateRepoCache: mock(() => {}),
}));

describe("issue actions write errors", () => {
	beforeEach(() => {
		updateMock.mockClear();
	});

	it("maps write failures for close, update, and reopen issue actions", async () => {
		const { closeIssue, reopenIssue, updateIssue } = await import("./issue-actions");

		await expect(closeIssue("acme", "widgets", 1, "completed")).resolves.toEqual({
			error: "friendly write error",
		});
		await expect(updateIssue("acme", "widgets", 1, "Title", "Body")).resolves.toEqual({
			error: "friendly write error",
		});
		await expect(reopenIssue("acme", "widgets", 1)).resolves.toEqual({
			error: "friendly write error",
		});

		expect(updateMock).toHaveBeenCalledTimes(3);
	});
});
