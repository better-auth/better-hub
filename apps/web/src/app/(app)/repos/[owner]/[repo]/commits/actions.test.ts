import { beforeEach, describe, expect, it, vi } from "vitest";

const getRepoCommitsMock = vi.fn();

vi.mock("@/lib/github", () => ({
	getRepoCommits: getRepoCommitsMock,
	getCommit: vi.fn(),
}));

vi.mock("@/lib/shiki", () => ({
	highlightDiffLines: vi.fn(async () => ({})),
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
