const GITHUB_REPORT_CONTENT_BASE_URL = "https://github.com/contact/report-content";
const MAX_REFERENCE_TITLE_LENGTH = 256;

export type ReferenceIssueRepository = {
	owner: string;
	repo: string;
};

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

function normalizeRepositoryKey({ owner, repo }: ReferenceIssueRepository): string {
	return `${owner}/${repo}`.trim().toLowerCase();
}

export function parseReferenceIssueRepositoryQuery(query: string): ReferenceIssueRepository | null {
	const trimmed = query.trim().replace(/^\/+|\/+$/g, "");
	if (!trimmed) return null;

	const parts = trimmed.split("/");
	if (parts.length !== 2) return null;

	const [owner, repo] = parts.map((part) => part.trim());
	if (!owner || !repo) return null;
	if (owner.includes(" ") || repo.includes(" ")) return null;

	return { owner, repo };
}

export function mergeReferenceIssueRepositories(
	currentRepo: ReferenceIssueRepository,
	searchResults: ReferenceIssueRepository[],
	typedRepo?: ReferenceIssueRepository | null,
): ReferenceIssueRepository[] {
	const merged = new Map<string, ReferenceIssueRepository>();
	const addRepository = (repository: ReferenceIssueRepository) => {
		const key = normalizeRepositoryKey(repository);
		if (!merged.has(key)) {
			merged.set(key, repository);
		}
	};

	addRepository(currentRepo);

	if (typedRepo) {
		addRepository(typedRepo);
	}

	for (const item of searchResults) {
		addRepository(item);
	}

	return [...merged.values()];
}
