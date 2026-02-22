import { redis } from "./redis";

function repoKey(owner: string, repo: string, suffix: string): string {
	return `${suffix}:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function languagesKey(owner: string, repo: string): string {
	return repoKey(owner, repo, "repo_languages");
}

function contributorAvatarsKey(owner: string, repo: string): string {
	return repoKey(owner, repo, "repo_contributor_avatars");
}

function branchesKey(owner: string, repo: string): string {
	return repoKey(owner, repo, "repo_branches");
}

function tagsKey(owner: string, repo: string): string {
	return repoKey(owner, repo, "repo_tags");
}

export async function getCachedRepoLanguages(
	owner: string,
	repo: string,
): Promise<Record<string, number> | null> {
	return redis.get<Record<string, number>>(languagesKey(owner, repo));
}

export async function setCachedRepoLanguages(
	owner: string,
	repo: string,
	languages: Record<string, number>,
): Promise<void> {
	await redis.set(languagesKey(owner, repo), languages);
}

export interface ContributorAvatar {
	login: string;
	avatar_url: string;
}

export interface ContributorAvatarsData {
	avatars: ContributorAvatar[];
	totalCount: number;
}

export async function getCachedContributorAvatars(
	owner: string,
	repo: string,
): Promise<ContributorAvatarsData | null> {
	const raw = await redis.get<ContributorAvatarsData | ContributorAvatar[]>(
		contributorAvatarsKey(owner, repo),
	);
	if (!raw) return null;
	if (Array.isArray(raw)) return { avatars: raw, totalCount: raw.length };
	return raw;
}

export async function setCachedContributorAvatars(
	owner: string,
	repo: string,
	data: ContributorAvatarsData,
): Promise<void> {
	await redis.set(contributorAvatarsKey(owner, repo), data);
}

export interface BranchRef {
	name: string;
}

export async function getCachedBranches(owner: string, repo: string): Promise<BranchRef[] | null> {
	return redis.get<BranchRef[]>(branchesKey(owner, repo));
}

export async function setCachedBranches(
	owner: string,
	repo: string,
	branches: BranchRef[],
): Promise<void> {
	await redis.set(branchesKey(owner, repo), branches);
}

export async function getCachedTags(owner: string, repo: string): Promise<BranchRef[] | null> {
	return redis.get<BranchRef[]>(tagsKey(owner, repo));
}

export async function setCachedTags(owner: string, repo: string, tags: BranchRef[]): Promise<void> {
	await redis.set(tagsKey(owner, repo), tags);
}

// --- Core page data + file tree (shared across all viewers) ---

export async function getCachedRepoPageData<T>(owner: string, repo: string): Promise<T | null> {
	return redis.get<T>(repoKey(owner, repo, "repo_page_data"));
}

export async function setCachedRepoPageData<T>(
	owner: string,
	repo: string,
	data: T,
): Promise<void> {
	await redis.set(repoKey(owner, repo, "repo_page_data"), data);
}

export async function getCachedRepoTree<T>(owner: string, repo: string): Promise<T | null> {
	return redis.get<T>(repoKey(owner, repo, "repo_file_tree"));
}

export async function setCachedRepoTree<T>(owner: string, repo: string, tree: T): Promise<void> {
	await redis.set(repoKey(owner, repo, "repo_file_tree"), tree);
}

// --- Overview caches (shared across all viewers) ---

export async function getCachedOverviewPRs<T>(owner: string, repo: string): Promise<T[] | null> {
	return redis.get<T[]>(repoKey(owner, repo, "overview_prs"));
}

export async function setCachedOverviewPRs<T>(
	owner: string,
	repo: string,
	data: T[],
): Promise<void> {
	await redis.set(repoKey(owner, repo, "overview_prs"), data);
}

export async function getCachedOverviewIssues<T>(owner: string, repo: string): Promise<T[] | null> {
	return redis.get<T[]>(repoKey(owner, repo, "overview_issues"));
}

export async function setCachedOverviewIssues<T>(
	owner: string,
	repo: string,
	data: T[],
): Promise<void> {
	await redis.set(repoKey(owner, repo, "overview_issues"), data);
}

export async function getCachedOverviewEvents<T>(owner: string, repo: string): Promise<T[] | null> {
	return redis.get<T[]>(repoKey(owner, repo, "overview_events"));
}

export async function setCachedOverviewEvents<T>(
	owner: string,
	repo: string,
	data: T[],
): Promise<void> {
	await redis.set(repoKey(owner, repo, "overview_events"), data);
}

export async function getCachedOverviewCommitActivity<T>(
	owner: string,
	repo: string,
): Promise<T[] | null> {
	return redis.get<T[]>(repoKey(owner, repo, "overview_commit_activity"));
}

export async function setCachedOverviewCommitActivity<T>(
	owner: string,
	repo: string,
	data: T[],
): Promise<void> {
	await redis.set(repoKey(owner, repo, "overview_commit_activity"), data);
}

export async function getCachedOverviewCI<T>(owner: string, repo: string): Promise<T | null> {
	return redis.get<T>(repoKey(owner, repo, "overview_ci"));
}

export async function setCachedOverviewCI<T>(owner: string, repo: string, data: T): Promise<void> {
	await redis.set(repoKey(owner, repo, "overview_ci"), data);
}

// --- Author dossier cache (per author per repo) ---

function authorDossierKey(owner: string, repo: string, login: string): string {
	return `author_dossier:${owner.toLowerCase()}/${repo.toLowerCase()}/${login.toLowerCase()}`;
}

export async function getCachedAuthorDossier<T>(
	owner: string,
	repo: string,
	login: string,
): Promise<T | null> {
	return redis.get<T>(authorDossierKey(owner, repo, login));
}

export async function setCachedAuthorDossier<T>(
	owner: string,
	repo: string,
	login: string,
	data: T,
): Promise<void> {
	await redis.set(authorDossierKey(owner, repo, login), data);
}
