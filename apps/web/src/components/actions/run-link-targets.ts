interface RepoOwnerRef {
	login?: string | null;
}

interface RepoRef {
	name?: string | null;
	owner?: RepoOwnerRef | null;
}

interface PullRef {
	number?: number;
	url?: string | null;
}

export interface WorkflowRunLinkInput {
	head_branch?: string | null;
	head_sha?: string | null;
	repository?: RepoRef | null;
	head_repository?: RepoRef | null;
	pull_requests?: PullRef[] | null;
}

function encodePathSegment(value: string): string {
	return encodeURIComponent(value).replace(/%2F/g, "/");
}

function pickRepoSlug(
	repoRef: RepoRef | null | undefined,
	fallbackOwner: string,
	fallbackRepo: string,
): { owner: string; repo: string } {
	const owner = repoRef?.owner?.login?.trim();
	const repo = repoRef?.name?.trim();
	if (!owner || !repo) {
		return { owner: fallbackOwner, repo: fallbackRepo };
	}
	return { owner, repo };
}

export function getRunLinkTargets(
	owner: string,
	repo: string,
	run: WorkflowRunLinkInput,
): {
	branchHref: string | null;
	commitHref: string | null;
	prHref: string | null;
	prNumber: number | null;
} {
	const headBranch = run.head_branch?.trim();
	const headSha = run.head_sha?.trim();
	const firstPull = run.pull_requests?.[0];
	const prNumberFromUrl = firstPull?.url?.match(/\/pulls\/(\d+)$/)?.[1];
	const prNumber =
		firstPull?.number ??
		(prNumberFromUrl ? Number.parseInt(prNumberFromUrl, 10) : null);

	const sourceRepo = run.head_repository ?? run.repository;
	const sourceSlug = pickRepoSlug(sourceRepo, owner, repo);
	const branchHref = headBranch
		? `/${sourceSlug.owner}/${sourceSlug.repo}/tree/${encodePathSegment(headBranch)}`
		: null;

	const prHref = prNumber ? `/${owner}/${repo}/pulls/${prNumber}` : null;
	let commitHref: string | null = null;

	if (headSha) {
		if (prNumber) {
			commitHref = `https://github.com/${owner}/${repo}/pull/${prNumber}/commits/${headSha}`;
		} else {
			commitHref = `/${owner}/${repo}/commit/${headSha}`;
		}
	}

	return {
		branchHref,
		commitHref,
		prHref,
		prNumber,
	};
}

export function splitTitleOnPrToken(
	title: string,
	prNumber: number | null,
): { before: string; token: string; after: string } | null {
	if (!prNumber) return null;
	const token = `#${prNumber}`;
	const idx = title.indexOf(token);
	if (idx === -1) return null;

	return {
		before: title.slice(0, idx),
		token,
		after: title.slice(idx + token.length),
	};
}
