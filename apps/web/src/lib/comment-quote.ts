export function formatQuotedReplyMarkdown(body: string): string {
	return `${body
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n")}\n\n`;
}

export function appendQuotedReplyMarkdown(currentDraft: string, quotedBody: string): string {
	const trimmedDraft = currentDraft.trim();
	if (!trimmedDraft) return quotedBody;
	return `${trimmedDraft}\n\n${quotedBody}`;
}
