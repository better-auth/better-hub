import { beforeEach, describe, expect, it, mock } from "bun:test";

const getRepoCommitsMock = mock();

mock.module("@/lib/github", () => ({
	getRepoCommits: getRepoCommitsMock,
	getCommit: mock(),
}));

mock.module("@/lib/shiki", () => ({
	highlightDiffLines: mock(async () => ({})),
}));

describe("fetchLatestCommit", () => {
	beforeEach(() => {
		getRepoCommitsMock.mockReset();
	});

	it("returns null when listing commits fails (empty repository)", async () => {
		getRepoCommitsMock.mockRejectedValueOnce(new Error("Git Repository is empty."));

		const { fetchLatestCommit } = await import("./actions");
		const result = await fetchLatestCommit("owner", "empty-repo");

		expect(result).toBeNull();
		expect(getRepoCommitsMock).toHaveBeenCalledWith(
			"owner",
			"empty-repo",
			undefined,
			1,
			1,
		);
	});
});
