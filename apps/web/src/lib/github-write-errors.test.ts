import { describe, expect, it } from "bun:test";
import { getGitHubWriteErrorMessage } from "./github-write-errors";

describe("getGitHubWriteErrorMessage", () => {
	it("turns OAuth restriction errors into an actionable Better Hub message", () => {
		const message = getGitHubWriteErrorMessage(
			new Error(
				"Although you appear to have the correct authorization credentials, the `better-auth` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.",
			),
		);

		expect(message).toContain("better-auth");
		expect(message).toContain("approve Better Hub");
		expect(message).toContain("Personal Access Token");
	});

	it("passes through non OAuth restriction messages", () => {
		expect(getGitHubWriteErrorMessage(new Error("Something else failed"))).toBe(
			"Something else failed",
		);
	});
});
