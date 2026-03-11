import { describe, expect, it } from "bun:test";
import { canManageComment } from "./comment-permissions";

describe("canManageComment", () => {
	it("allows authors to manage their own comments", () => {
		expect(
			canManageComment({
				authorLogin: "justjake",
				currentUserLogin: "justjake",
			}),
		).toBe(true);
	});

	it("allows repo writers to manage comments", () => {
		expect(
			canManageComment({
				authorLogin: "someone-else",
				currentUserLogin: "maintainer",
				viewerHasWriteAccess: true,
			}),
		).toBe(true);
	});

	it("rejects anonymous viewers and unrelated readers", () => {
		expect(
			canManageComment({
				authorLogin: "someone-else",
				currentUserLogin: undefined,
			}),
		).toBe(false);
		expect(
			canManageComment({
				authorLogin: "someone-else",
				currentUserLogin: "reader",
				viewerHasWriteAccess: false,
			}),
		).toBe(false);
	});
});
