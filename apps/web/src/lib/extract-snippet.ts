/**
 * Extracts a sub-snippet from a unified-diff patch string.
 *
 * `startLine` / `endLine` are 1-based line numbers referring to the **new**
 * file (the `+N` side of the `@@ -O,count +N,count @@` hunk header).
 *
 * Removed lines (`-`) are included when their **old-file** line number falls
 * within `[startLine, endLine + 1]` so that deletions adjacent to the
 * requested range are captured.
 */
export function extractSnippetFromPatch(
	patch: string | undefined,
	startLine: number,
	endLine: number,
): string {
	if (!patch) return "";

	const lines = patch.split("\n");
	const collected: string[] = [];
	let newLine = 0;
	let oldLine = 0;

	for (const line of lines) {
		if (line.startsWith("@@")) {
			const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
			if (match) {
				oldLine = parseInt(match[1], 10);
				newLine = parseInt(match[2], 10);
			}
			continue;
		}

		if (line.startsWith("-")) {
			if (oldLine >= startLine && oldLine <= endLine + 1) {
				collected.push(line);
			}
			oldLine++;
		} else if (line.startsWith("+")) {
			if (newLine >= startLine && newLine <= endLine) {
				collected.push(line);
			}
			newLine++;
		} else {
			if (newLine >= startLine && newLine <= endLine) {
				collected.push(line.startsWith(" ") ? line : ` ${line}`);
			}
			oldLine++;
			newLine++;
		}
	}

	if (collected.length === 0) return "";

	let addCount = 0;
	let delCount = 0;
	for (const l of collected) {
		if (l.startsWith("+")) addCount++;
		else if (l.startsWith("-")) delCount++;
		else {
			addCount++;
			delCount++;
		}
	}

	const oldStart = delCount > 0 ? startLine : 0;
	const header = `@@ -${oldStart},${delCount} +${startLine},${addCount} @@`;
	return `${header}\n${collected.join("\n")}`;
}
