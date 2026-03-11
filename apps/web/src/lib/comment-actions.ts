const GITHUB_REPORT_CONTENT_BASE_URL = "https://github.com/contact/report-content";
const MAX_REFERENCE_TITLE_LENGTH = 256;

function collapseWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function normalizeReportAuthorType(authorType?: string | null): string | null {
	if (!authorType) return null;
	return authorType.trim().toLowerCase() || null;
}

export function buildReportContentUrl({
	commentUrl,
	authorLogin,
	authorType,
}: {
	commentUrl: string;
	authorLogin?: string | null;
	authorType?: string | null;
}): string {
	const params = new URLSearchParams({ content_url: commentUrl });
	if (authorLogin) {
		const labelType = normalizeReportAuthorType(authorType);
		params.set("report", labelType ? `${authorLogin} (${labelType})` : authorLogin);
	}
	return `${GITHUB_REPORT_CONTENT_BASE_URL}?${params.toString()}`;
}

function buildReferenceTitle(body: string, authorLogin?: string | null): string {
	const firstLine = body.split(/\r?\n/).map(collapseWhitespace).find(Boolean);

	if (!firstLine) {
		return authorLogin ? `Reference from @${authorLogin}` : "Reference in new issue";
	}

	return firstLine.slice(0, MAX_REFERENCE_TITLE_LENGTH);
}

export function buildReferenceIssueDraft({
	body,
	authorLogin,
	commentUrl,
}: {
	body: string;
	authorLogin?: string | null;
	commentUrl: string;
}): { title: string; body: string } {
	const normalizedBody = body.trim();
	const attribution = authorLogin
		? `_Originally posted by @${authorLogin} in ${commentUrl}_`
		: `_Originally posted in ${commentUrl}_`;

	return {
		title: buildReferenceTitle(body, authorLogin),
		body: normalizedBody ? `${normalizedBody}\n\n${attribution}` : attribution,
	};
}
