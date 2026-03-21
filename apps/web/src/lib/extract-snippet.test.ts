import { describe, it, expect } from "vitest";
import { extractSnippetFromPatch } from "./extract-snippet";

function lines(snippet: string): string[] {
	return snippet.split("\n");
}

function bodyLines(snippet: string): string[] {
	return lines(snippet).slice(1);
}

describe("extractSnippetFromPatch", () => {
	// -----------------------------------------------------------
	// Edge cases: empty / undefined
	// -----------------------------------------------------------

	it("returns empty string for undefined patch", () => {
		expect(extractSnippetFromPatch(undefined, 1, 5)).toBe("");
	});

	it("returns empty string for empty patch", () => {
		expect(extractSnippetFromPatch("", 1, 5)).toBe("");
	});

	it("returns empty string when range is outside the hunk", () => {
		const patch = ["@@ -1,3 +1,3 @@", " line1", "-old2", "+new2", " line3"].join("\n");
		expect(extractSnippetFromPatch(patch, 100, 110)).toBe("");
	});

	// -----------------------------------------------------------
	// Pure additions (no removed lines)
	// -----------------------------------------------------------

	it("extracts pure additions", () => {
		const patch = [
			"@@ -5,2 +5,5 @@",
			" context",
			"+added1",
			"+added2",
			"+added3",
			" context2",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 6, 8);
		expect(bodyLines(result)).toEqual(["+added1", "+added2", "+added3"]);
	});

	it("extracts a single added line", () => {
		const patch = ["@@ -1,2 +1,3 @@", " first", "+inserted", " second"].join("\n");
		const result = extractSnippetFromPatch(patch, 2, 2);
		expect(bodyLines(result)).toEqual(["+inserted"]);
	});

	// -----------------------------------------------------------
	// Pure deletions (no added lines)
	// -----------------------------------------------------------

	it("extracts pure deletions within range", () => {
		const patch = [
			"@@ -10,5 +10,2 @@",
			" kept",
			"-removed1",
			"-removed2",
			"-removed3",
			" kept2",
		].join("\n");
		// oldLine: kept=10, removed1=11, removed2=12, removed3=13, kept2=14
		// newLine: kept=10, kept2=11
		// range 10-11 → oldLine in [10,12]: removed1(11)✓ removed2(12)✓ removed3(13)✗
		const result = extractSnippetFromPatch(patch, 10, 11);
		const body = bodyLines(result);
		expect(body).toContain(" kept");
		expect(body).toContain("-removed1");
		expect(body).toContain("-removed2");
		expect(body).not.toContain("-removed3");
		expect(body).toContain(" kept2");
	});

	it("includes removed lines when they fall within old-line range", () => {
		const patch = ["@@ -5,4 +5,1 @@", "-gone1", "-gone2", "-gone3", " survivor"].join(
			"\n",
		);
		// oldLine: gone1=5, gone2=6, gone3=7, survivor=8
		// range 5-5 → oldLine in [5,6]: gone1(5)✓ gone2(6)✓ gone3(7)✗
		const result = extractSnippetFromPatch(patch, 5, 5);
		const body = bodyLines(result);
		expect(body).toContain("-gone1");
		expect(body).toContain("-gone2");
		expect(body).not.toContain("-gone3");
		expect(body).toContain(" survivor");
	});

	// -----------------------------------------------------------
	// Mixed additions and deletions (replacements)
	// -----------------------------------------------------------

	it("extracts a simple replacement (delete + add)", () => {
		const patch = [
			"@@ -10,3 +10,3 @@",
			" before",
			"-oldLine",
			"+newLine",
			" after",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 10, 12);
		const body = bodyLines(result);
		expect(body).toContain(" before");
		expect(body).toContain("-oldLine");
		expect(body).toContain("+newLine");
		expect(body).toContain(" after");
	});

	it("extracts multi-line replacement", () => {
		const patch = [
			"@@ -1,5 +1,4 @@",
			" header",
			"-old1",
			"-old2",
			"+new1",
			" footer",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 1, 3);
		const body = bodyLines(result);
		expect(body).toContain(" header");
		expect(body).toContain("-old1");
		expect(body).toContain("-old2");
		expect(body).toContain("+new1");
		expect(body).toContain(" footer");
	});

	// -----------------------------------------------------------
	// Offset old/new line numbers (old != new start)
	// -----------------------------------------------------------

	it("handles differing old and new start positions", () => {
		const patch = ["@@ -20,3 +30,3 @@", " ctx", "-removed", "+added", " ctx2"].join(
			"\n",
		);
		// startLine/endLine refer to new-file lines (30-32)
		const result = extractSnippetFromPatch(patch, 30, 32);
		const body = bodyLines(result);
		expect(body).toContain(" ctx");
		expect(body).toContain("+added");
		expect(body).toContain(" ctx2");
	});

	it("includes removed lines using old-line coordinates when old/new offsets differ", () => {
		const patch = ["@@ -20,4 +30,2 @@", "-del1", "-del2", "-del3", " kept"].join("\n");
		// old lines are 20,21,22 — new lines start at 30
		// Request new-file range 20-22 to check that removed lines
		// are matched by oldLine (20,21,22) not newLine (30)
		const result = extractSnippetFromPatch(patch, 20, 22);
		const body = bodyLines(result);
		expect(body).toContain("-del1");
		expect(body).toContain("-del2");
		expect(body).toContain("-del3");
	});

	it("does NOT include removed lines when old-line is out of range", () => {
		const patch = ["@@ -100,3 +5,2 @@", "-far_away", "-far_away2", " ctx"].join("\n");
		// new-file range 5-6, old lines are 100-101 — way outside [5, 7]
		const result = extractSnippetFromPatch(patch, 5, 6);
		const body = bodyLines(result);
		expect(body).not.toContain("-far_away");
		expect(body).not.toContain("-far_away2");
		expect(body).toContain(" ctx");
	});

	// -----------------------------------------------------------
	// Multiple hunks
	// -----------------------------------------------------------

	it("only extracts from the relevant hunk", () => {
		const patch = [
			"@@ -1,3 +1,3 @@",
			" a",
			"-b",
			"+B",
			" c",
			"@@ -20,3 +20,3 @@",
			" x",
			"-y",
			"+Y",
			" z",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 20, 22);
		const body = bodyLines(result);
		expect(body).not.toContain("-b");
		expect(body).not.toContain("+B");
		expect(body).toContain(" x");
		expect(body).toContain("-y");
		expect(body).toContain("+Y");
		expect(body).toContain(" z");
	});

	it("can extract from the first of multiple hunks", () => {
		const patch = [
			"@@ -1,3 +1,3 @@",
			" a",
			"-b",
			"+B",
			" c",
			"@@ -50,3 +50,3 @@",
			" x",
			"-y",
			"+Y",
			" z",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 1, 3);
		const body = bodyLines(result);
		expect(body).toContain(" a");
		expect(body).toContain("-b");
		expect(body).toContain("+B");
		expect(body).toContain(" c");
		expect(body).not.toContain("-y");
	});

	// -----------------------------------------------------------
	// Context lines
	// -----------------------------------------------------------

	it("extracts context lines and adjacent deletion at endLine+1", () => {
		const patch = [
			"@@ -1,5 +1,5 @@",
			" line1",
			" line2",
			"-old3",
			"+new3",
			" line4",
			" line5",
		].join("\n");
		// oldLine: line1=1, line2=2, old3=3
		// range 1-2 → old3 at oldLine=3 = endLine+1 → included
		const result = extractSnippetFromPatch(patch, 1, 2);
		const body = bodyLines(result);
		expect(body).toEqual([" line1", " line2", "-old3"]);
	});

	it("prepends space to context lines missing the leading space", () => {
		const patch = ["@@ -1,2 +1,2 @@", "no_space_ctx", "-old", "+new"].join("\n");
		const result = extractSnippetFromPatch(patch, 1, 2);
		const body = bodyLines(result);
		expect(body[0]).toBe(" no_space_ctx");
	});

	// -----------------------------------------------------------
	// Boundary: endLine + 1 for removed lines
	// -----------------------------------------------------------

	it("includes a trailing removed line at endLine + 1 (old-line)", () => {
		const patch = ["@@ -5,4 +5,3 @@", " ctx1", " ctx2", " ctx3", "-trailing"].join(
			"\n",
		);
		// new lines: 5,6,7 — request 5-7
		// old lines: 5,6,7,8 — the "-trailing" is at oldLine=8 = endLine+1
		const result = extractSnippetFromPatch(patch, 5, 7);
		const body = bodyLines(result);
		expect(body).toContain("-trailing");
	});

	it("excludes a removed line beyond endLine + 1 (old-line)", () => {
		const patch = ["@@ -5,5 +5,3 @@", " ctx1", " ctx2", " ctx3", "-del1", "-del2"].join(
			"\n",
		);
		// new lines: 5,6,7 — request range 5-6
		// old lines: 5,6,7,8,9 — del1 at 8 = endLine+2, del2 at 9 = endLine+3
		const result = extractSnippetFromPatch(patch, 5, 6);
		const body = bodyLines(result);
		expect(body).toContain(" ctx1");
		expect(body).toContain(" ctx2");
		// oldLine 7 = endLine+1 — the ctx3 context line is at newLine=7 which is outside range
		expect(body).not.toContain(" ctx3");
	});

	// -----------------------------------------------------------
	// Generated hunk header correctness
	// -----------------------------------------------------------

	it("generates correct hunk header for additions only", () => {
		const patch = ["@@ -1,2 +1,4 @@", " ctx", "+add1", "+add2", " ctx2"].join("\n");
		const result = extractSnippetFromPatch(patch, 2, 3);
		const header = lines(result)[0];
		// No deletions, so oldStart should be 0
		expect(header).toBe("@@ -0,0 +2,2 @@");
	});

	it("generates correct hunk header for deletions only", () => {
		const patch = ["@@ -10,3 +10,1 @@", "-del1", "-del2", " ctx"].join("\n");
		const result = extractSnippetFromPatch(patch, 10, 10);
		const header = lines(result)[0];
		// Has deletions, so oldStart = startLine
		expect(header).toMatch(/^@@ -10,\d+ \+10,\d+ @@$/);
	});

	it("generates correct hunk header for mixed changes", () => {
		const patch = ["@@ -1,3 +1,3 @@", " ctx", "-old", "+new", " ctx2"].join("\n");
		const result = extractSnippetFromPatch(patch, 1, 3);
		const header = lines(result)[0];
		// body: ctx, -old, +new, ctx2 → addCount=3(ctx+new+ctx2), delCount=3(ctx+old+ctx2)
		expect(header).toBe("@@ -1,3 +1,3 @@");
	});

	// -----------------------------------------------------------
	// Consecutive removed lines sharing the same newLine position
	// -----------------------------------------------------------

	it("includes consecutive deletions up to endLine+1 boundary", () => {
		const patch = [
			"@@ -10,6 +10,2 @@",
			" before",
			"-gone1",
			"-gone2",
			"-gone3",
			"-gone4",
			" after",
		].join("\n");
		// oldLine: before=10, gone1=11, gone2=12, gone3=13, gone4=14, after=15
		// range 10-11 → oldLine in [10,12]: gone1(11)✓ gone2(12)✓ gone3(13)✗ gone4(14)✗
		const result = extractSnippetFromPatch(patch, 10, 11);
		const body = bodyLines(result);
		expect(body).toContain(" before");
		expect(body).toContain("-gone1");
		expect(body).toContain("-gone2");
		expect(body).not.toContain("-gone3");
		expect(body).not.toContain("-gone4");
		expect(body).toContain(" after");
	});

	it("includes all consecutive deletions when range is wide enough", () => {
		const patch = [
			"@@ -10,6 +10,2 @@",
			" before",
			"-gone1",
			"-gone2",
			"-gone3",
			"-gone4",
			" after",
		].join("\n");
		// oldLine: gone1=11..gone4=14. Range 10-14 → oldLine in [10,15]: all included
		const result = extractSnippetFromPatch(patch, 10, 14);
		const body = bodyLines(result);
		expect(body).toContain("-gone1");
		expect(body).toContain("-gone2");
		expect(body).toContain("-gone3");
		expect(body).toContain("-gone4");
	});

	// -----------------------------------------------------------
	// Real-world–style patches
	// -----------------------------------------------------------

	it("handles a realistic function rename patch", () => {
		const patch = [
			"@@ -42,7 +42,7 @@",
			" import { foo } from './utils';",
			" ",
			" export function MyComponent() {",
			"-  const result = oldFunctionName();",
			"+  const result = newFunctionName();",
			"   return <div>{result}</div>;",
			" }",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 44, 46);
		const body = bodyLines(result);
		expect(body).toContain(" export function MyComponent() {");
		expect(body).toContain("-  const result = oldFunctionName();");
		expect(body).toContain("+  const result = newFunctionName();");
		expect(body).toContain("   return <div>{result}</div>;");
	});

	it("handles a patch adding an import and using it", () => {
		const patch = [
			"@@ -1,4 +1,5 @@",
			" import React from 'react';",
			"+import { useState } from 'react';",
			" ",
			" export default function App() {",
			"   return <div />;",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 1, 3);
		const body = bodyLines(result);
		expect(body).toContain(" import React from 'react';");
		expect(body).toContain("+import { useState } from 'react';");
	});

	it("handles a patch deleting a block of code", () => {
		const patch = [
			"@@ -8,10 +8,3 @@",
			" function helper() {",
			"-  console.log('debug 1');",
			"-  console.log('debug 2');",
			"-  console.log('debug 3');",
			"-  console.log('debug 4');",
			"-  console.log('debug 5');",
			"-  console.log('debug 6');",
			"-  console.log('debug 7');",
			"   return true;",
			" }",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 8, 10);
		const body = bodyLines(result);
		expect(body).toContain(" function helper() {");
		expect(body).toContain("-  console.log('debug 1');");
		expect(body).toContain("-  console.log('debug 2');");
		expect(body).toContain("   return true;");
		expect(body).toContain(" }");
	});

	// -----------------------------------------------------------
	// Partial range within a hunk
	// -----------------------------------------------------------

	it("extracts only the requested sub-range of a large hunk", () => {
		const patch = [
			"@@ -1,8 +1,8 @@",
			" line1",
			" line2",
			" line3",
			"-old4",
			"+new4",
			" line5",
			" line6",
			" line7",
			" line8",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 3, 5);
		const body = bodyLines(result);
		expect(body).toContain(" line3");
		expect(body).toContain("-old4");
		expect(body).toContain("+new4");
		expect(body).toContain(" line5");
		expect(body).not.toContain(" line1");
		expect(body).not.toContain(" line2");
		expect(body).not.toContain(" line7");
	});

	// -----------------------------------------------------------
	// Hunk header with function name context
	// -----------------------------------------------------------

	it("parses hunk headers that include function context after @@", () => {
		const patch = [
			"@@ -15,3 +15,4 @@ function myFunc() {",
			"   const a = 1;",
			"+  const b = 2;",
			"   return a;",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 15, 17);
		const body = bodyLines(result);
		expect(body.length).toBeGreaterThan(0);
		expect(body).toContain("   const a = 1;");
		expect(body).toContain("+  const b = 2;");
		expect(body).toContain("   return a;");
	});

	// -----------------------------------------------------------
	// Range exactly at hunk start
	// -----------------------------------------------------------

	it("works when startLine equals the hunk new-start", () => {
		const patch = [
			"@@ -7,3 +7,4 @@",
			"+brand_new",
			" existing1",
			" existing2",
			" existing3",
		].join("\n");
		const result = extractSnippetFromPatch(patch, 7, 7);
		const body = bodyLines(result);
		expect(body).toContain("+brand_new");
	});

	// -----------------------------------------------------------
	// Single-line hunk
	// -----------------------------------------------------------

	it("handles a single-line addition hunk", () => {
		const patch = "@@ -3,0 +4,1 @@\n+only_line";
		const result = extractSnippetFromPatch(patch, 4, 4);
		expect(bodyLines(result)).toEqual(["+only_line"]);
	});

	it("handles a single-line deletion hunk", () => {
		const patch = "@@ -4,1 +3,0 @@\n-only_line";
		const result = extractSnippetFromPatch(patch, 4, 4);
		expect(bodyLines(result)).toEqual(["-only_line"]);
	});
});
