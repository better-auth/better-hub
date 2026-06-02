import { describe, expect, it } from "bun:test";
import {
	buildReferenceIssueDraft,
	buildReportContentUrl,
	mergeReferenceIssueRepositories,
	parseReferenceIssueRepositoryQuery,
} from "./comment-actions";

describe("buildReferenceIssueDraft", () => {
	it("uses the first non-empty line as the issue title and appends attribution", () => {
		expect(
			buildReferenceIssueDraft({
				body: "\n\nShip report content next\n\nMore context here.",
				authorLogin: "justjxke",
				commentUrl: "https://github.com/better-auth/better-hub/discussions/277",
			}),
		).toEqual({
			title: "Ship report content next",
			body: "Ship report content next\n\nMore context here.\n\n_Originally posted by @justjxke in https://github.com/better-auth/better-hub/discussions/277_",
		});
	});

	it("collapses multiline whitespace and truncates long titles", () => {
		const draft = buildReferenceIssueDraft({
			body: `  ${"word ".repeat(80)}\n\nBody`,
			authorLogin: "octocat",
			commentUrl: "https://github.com/better-auth/better-hub/pull/238#discussion_r1",
		});

		expect(draft.title.length).toBe(256);
		expect(draft.title.includes("\n")).toBe(false);
		expect(draft.body.endsWith("#discussion_r1_")).toBe(true);
	});

	it("falls back to a generic title when the source body is empty", () => {
		expect(
			buildReferenceIssueDraft({
				body: "   \n\t",
				authorLogin: "ghost",
				commentUrl: "https://github.com/better-auth/better-hub/discussions/277#discussioncomment-1",
			}),
		).toEqual({
			title: "Reference from @ghost",
			body: "_Originally posted by @ghost in https://github.com/better-auth/better-hub/discussions/277#discussioncomment-1_",
		});
	});
});

describe("buildReportContentUrl", () => {
	it("builds a GitHub report-content URL with a typed author label", () => {
		expect(
			buildReportContentUrl({
				commentUrl: "https://github.com/better-auth/better-hub/discussions/277#discussioncomment-16007720",
				authorLogin: "justjxke",
				authorType: "User",
			}),
		).toBe(
			"https://github.com/contact/report-content?content_url=https%3A%2F%2Fgithub.com%2Fbetter-auth%2Fbetter-hub%2Fdiscussions%2F277%23discussioncomment-16007720&report=justjxke+%28user%29",
		);
	});

	it("omits the report parameter when the author is unknown", () => {
		expect(
			buildReportContentUrl({
				commentUrl: "https://github.com/better-auth/better-hub/pull/238#issuecomment-1",
			}),
		).toBe(
			"https://github.com/contact/report-content?content_url=https%3A%2F%2Fgithub.com%2Fbetter-auth%2Fbetter-hub%2Fpull%2F238%23issuecomment-1",
		);
	});

	it("normalizes bot authors to GitHub's lowercase report label", () => {
		expect(
			buildReportContentUrl({
				commentUrl: "https://github.com/better-auth/better-hub/pull/238#discussion_r2",
				authorLogin: "better-hub[bot]",
				authorType: "Bot",
			}),
		).toBe(
			"https://github.com/contact/report-content?content_url=https%3A%2F%2Fgithub.com%2Fbetter-auth%2Fbetter-hub%2Fpull%2F238%23discussion_r2&report=better-hub%5Bbot%5D+%28bot%29",
		);
	});
});

describe("parseReferenceIssueRepositoryQuery", () => {
	it("parses a trimmed owner/repo query", () => {
		expect(parseReferenceIssueRepositoryQuery(" better-auth/better-hub ")).toEqual({
			owner: "better-auth",
			repo: "better-hub",
		});
	});

	it("rejects incomplete or spaced repository queries", () => {
		expect(parseReferenceIssueRepositoryQuery("better-auth")).toBeNull();
		expect(parseReferenceIssueRepositoryQuery("better auth/better-hub")).toBeNull();
		expect(parseReferenceIssueRepositoryQuery("better-auth/better hub")).toBeNull();
	});
});

describe("mergeReferenceIssueRepositories", () => {
	it("keeps the current repo first and dedupes case-insensitively", () => {
		expect(
			mergeReferenceIssueRepositories(
				{ owner: "better-auth", repo: "better-hub" },
				[
					{ owner: "Better-Auth", repo: "Better-Hub" },
					{ owner: "openai", repo: "openai-node" },
				],
				{ owner: "OPENAI", repo: "openai-node" },
			),
		).toEqual([
			{ owner: "better-auth", repo: "better-hub" },
			{ owner: "OPENAI", repo: "openai-node" },
		]);
	});
});
