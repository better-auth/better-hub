import { describe, expect, it } from "bun:test";
import { appendQuotedReplyMarkdown, formatQuotedReplyMarkdown } from "./comment-quote";

describe("comment quote helpers", () => {
	it("formats multiline markdown as a GitHub-style quote block", () => {
		expect(formatQuotedReplyMarkdown("line 1\nline 2")).toBe("> line 1\n> line 2\n\n");
	});

	it("appends quoted content after an existing draft with spacing", () => {
		expect(
			appendQuotedReplyMarkdown(
				"Existing draft",
				formatQuotedReplyMarkdown("quoted text"),
			),
		).toBe("Existing draft\n\n> quoted text\n\n");
	});

	it("uses only the quote block when the draft is empty", () => {
		expect(
			appendQuotedReplyMarkdown("   ", formatQuotedReplyMarkdown("quoted text")),
		).toBe("> quoted text\n\n");
	});
});
