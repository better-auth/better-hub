import { Octokit } from "@octokit/rest";
import { headers } from "next/headers";
import { cache } from "react";
import { $Session, getServerSession } from "./auth";
import {
	claimDueGithubSyncJobs,
	deleteGithubCacheByPrefix,
	deleteSharedCacheByPrefix,
	enqueueGithubSyncJob,
	getGithubCacheEntry,
	getSharedCacheEntry,
	markGithubSyncJobFailed,
	markGithubSyncJobSucceeded,
	touchGithubCacheEntrySyncedAt,
	touchSharedCacheEntrySyncedAt,
	upsertGithubCacheEntry,
	upsertSharedCacheEntry,
} from "./github-sync-store";
import { redis } from "./redis";
import { computeContributorScore } from "./contributor-score";
import { getCachedAuthorDossier, setCachedAuthorDossier } from "./repo-data-cache";

export type RepoPermissions = {
	admin: boolean;
	push: boolean;
	pull: boolean;
	maintain: boolean;
	triage: boolean;
};

export function extractRepoPermissions(repoData: {
	permissions?: Partial<RepoPermissions>;
}): RepoPermissions {
	const p = repoData?.permissions;
	return {
		admin: !!p?.admin,
		push: !!p?.push,
		pull: !!p?.pull,
		maintain: !!p?.maintain,
		triage: !!p?.triage,
	};
}

type RepoSort = "updated" | "pushed" | "full_name";
type OrgRepoSort = "created" | "updated" | "pushed" | "full_name";
type OrgRepoType = "all" | "public" | "private" | "forks" | "sources" | "member";

interface GitHubAuthContext {
	userId: string;
	token: string;
	octokit: Octokit;
	forceRefresh: boolean;
	githubUser: $Session["githubUser"];
}

type GitDataSyncJobType =
	| "user_repos"
	| "repo"
	| "repo_contents"
	| "repo_tree"
	| "repo_branches"
	| "repo_tags"
	| "file_content"
	| "repo_readme"
	| "authenticated_user"
	| "user_orgs"
	| "org"
	| "org_repos"
	| "notifications"
	| "search_issues"
	| "user_events"
	| "starred_repos"
	| "contributions"
	| "trending_repos"
	| "repo_issues"
	| "repo_pull_requests"
	| "issue"
	| "issue_comments"
	| "pull_request"
	| "pull_request_files"
	| "pull_request_comments"
	| "pull_request_reviews"
	| "pull_request_commits"
	| "repo_contributors"
	| "user_profile"
	| "user_public_repos"
	| "user_public_orgs"
	| "user_followers"
	| "user_following"
	| "repo_workflows"
	| "repo_workflow_runs"
	| "repo_nav_counts"
	| "org_members"
	| "person_repo_activity"
	| "pr_bundle"
	| "repo_discussions";

// SECURITY: Only cache types that are safe to share across users belong here.
// Any data from repos (issues, PRs, code, branches, etc.) is excluded because
// private-repo data fetched by one authorized user would leak to others via
// the shared cache, bypassing GitHub permission checks.
const SHAREABLE_CACHE_TYPES: ReadonlySet<string> = new Set([
	"user_profile",
	"user_public_repos",
	"user_public_orgs",
	"user_followers",
	"user_following",
	"org",
	"org_repos",
	"org_members",
	"trending_repos",
]);

function isShareableCacheType(jobType: string): boolean {
	return SHAREABLE_CACHE_TYPES.has(jobType);
}

interface GitDataSyncJobPayload {
	owner?: string;
	repo?: string;
	sort?: RepoSort;
	perPage?: number;
	path?: string;
	ref?: string;
	treeSha?: string;
	recursive?: boolean;
	username?: string;
	orgName?: string;
	orgSort?: OrgRepoSort;
	orgType?: OrgRepoType;
	state?: "open" | "closed" | "all";
	query?: string;
	issueNumber?: number;
	pullNumber?: number;
	language?: string;
	since?: "daily" | "weekly" | "monthly";
	openIssuesAndPrs?: number;
}

interface LocalFirstGitReadOptions<T> {
	authCtx: GitHubAuthContext | null;
	cacheKey: string;
	cacheType: string;
	fallback: T;
	jobType: GitDataSyncJobType;
	jobPayload: GitDataSyncJobPayload;
	fetchRemote: (octokit: Octokit) => Promise<T>;
}

const globalForGithubSync = globalThis as typeof globalThis & {
	__githubSyncDrainingUsers?: Set<string>;
};

if (!globalForGithubSync.__githubSyncDrainingUsers) {
	globalForGithubSync.__githubSyncDrainingUsers = new Set<string>();
}

const githubSyncDrainingUsers = globalForGithubSync.__githubSyncDrainingUsers;

// --- Rate Limit Error ---

export class GitHubRateLimitError extends Error {
	readonly resetAt: number; // unix timestamp (seconds)
	readonly limit: number;
	readonly used: number;

	constructor(resetAt: number, limit: number, used: number) {
		super("GitHub API rate limit exceeded");
		this.name = "GitHubRateLimitError";
		this.resetAt = resetAt;
		this.limit = limit;
		this.used = used;
	}
}

// --- OAuth App Access Restriction Error ---

export class GitHubOAuthRestrictedError extends Error {
	readonly digest: string;
	readonly org: string;

	constructor(org: string) {
		super(
			`The ${org} organization has enabled OAuth App access restrictions. An organization admin needs to approve this app.`,
		);
		this.name = "GitHubOAuthRestrictedError";
		this.org = org;
		this.digest = `GITHUB_OAUTH_RESTRICTED:${org}`;
	}
}

function isOAuthRestrictionError(error: unknown): string | null {
	if (typeof error !== "object" || error === null) return null;
	const status = (error as { status?: number }).status;
	if (status !== 403) return null;
	const message = (error as { message?: string }).message ?? "";
	if (!message.includes("OAuth App access restrictions")) return null;
	const match = message.match(/the `([^`]+)` organization/i);
	return match?.[1] ?? "this";
}

function isOctokitNotFound(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const status = (error as { status?: number }).status;
	if (status === 404) return true;
	const message = (error as { message?: string }).message ?? "";
	return message.includes("404");
}

function isRateLimitError(error: unknown): { resetAt: number; limit: number; used: number } | null {
	if (typeof error !== "object" || error === null) return null;
	const status = (error as { status?: number }).status;
	if (status !== 403 && status !== 429) return null;

	const message = (error as { message?: string }).message ?? "";
	if (!message.toLowerCase().includes("rate limit")) return null;

	const response = (error as { response?: { headers?: Record<string, string> } }).response;
	const headers = response?.headers;

	const resetAt = Number(headers?.["x-ratelimit-reset"] ?? 0);
	const limit = Number(headers?.["x-ratelimit-limit"] ?? 5000);
	const remaining = Number(headers?.["x-ratelimit-remaining"] ?? 0);

	return {
		resetAt: resetAt || Math.floor(Date.now() / 1000) + 3600,
		limit,
		used: limit - remaining,
	};
}

/**
 * Rethrows known GitHub API errors (rate limit, OAuth restriction) as typed errors.
 * Should be called in catch blocks for Octokit REST calls.
 */
function rethrowKnownGitHubErrors(error: unknown): void {
	const rl = isRateLimitError(error);
	if (rl) throw new GitHubRateLimitError(rl.resetAt, rl.limit, rl.used);
	const org = isOAuthRestrictionError(error);
	if (org) throw new GitHubOAuthRestrictedError(org);
}

function normalizeRef(ref?: string): string {
	const value = ref?.trim();
	return value ? value : "";
}

function normalizePath(path: string): string {
	return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function normalizeRepoKey(owner: string, repo: string): string {
	return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function keyPart(value: string): string {
	return encodeURIComponent(value === "" ? "~" : value);
}

function buildUserReposCacheKey(sort: RepoSort, perPage: number): string {
	return `user_repos:${sort}:${perPage}`;
}

function buildRepoCacheKey(owner: string, repo: string): string {
	return `repo:${normalizeRepoKey(owner, repo)}`;
}

function buildRepoContentsCacheKey(
	owner: string,
	repo: string,
	path: string,
	ref?: string,
): string {
	return `repo_contents:${normalizeRepoKey(owner, repo)}:${keyPart(
		normalizeRef(ref),
	)}:${keyPart(normalizePath(path))}`;
}

function buildRepoTreeCacheKey(
	owner: string,
	repo: string,
	treeSha: string,
	recursive: boolean,
): string {
	return `repo_tree:${normalizeRepoKey(owner, repo)}:${keyPart(
		treeSha,
	)}:${recursive ? "1" : "0"}`;
}

function buildRepoBranchesCacheKey(owner: string, repo: string): string {
	return `repo_branches:${normalizeRepoKey(owner, repo)}`;
}

function buildRepoTagsCacheKey(owner: string, repo: string): string {
	return `repo_tags:${normalizeRepoKey(owner, repo)}`;
}

function buildFileContentCacheKey(owner: string, repo: string, path: string, ref?: string): string {
	return `file_content:${normalizeRepoKey(owner, repo)}:${keyPart(
		normalizeRef(ref),
	)}:${keyPart(normalizePath(path))}`;
}

function buildRepoReadmeCacheKey(owner: string, repo: string, ref?: string): string {
	return `repo_readme:${normalizeRepoKey(owner, repo)}:${keyPart(normalizeRef(ref))}`;
}

function buildAuthenticatedUserCacheKey(): string {
	return "authenticated_user";
}

function buildUserOrgsCacheKey(perPage: number): string {
	return `user_orgs:${perPage}`;
}

function buildOrgCacheKey(org: string): string {
	return `org:${org.toLowerCase()}`;
}

function buildOrgReposCacheKey(
	org: string,
	sort: OrgRepoSort,
	type: OrgRepoType,
	perPage: number,
): string {
	return `org_repos:${org.toLowerCase()}:${sort}:${type}:${perPage}`;
}

function buildNotificationsCacheKey(perPage: number): string {
	return `notifications:${perPage}`;
}

function buildSearchIssuesCacheKey(query: string, perPage: number): string {
	return `search_issues:${keyPart(query)}:${perPage}`;
}

function buildUserEventsCacheKey(username: string, perPage: number): string {
	return `user_events:${username.toLowerCase()}:${perPage}`;
}

function buildStarredReposCacheKey(perPage: number): string {
	return `starred_repos:${perPage}`;
}

function buildContributionsCacheKey(username: string): string {
	return `contributions:${username.toLowerCase()}`;
}

function buildTrendingReposCacheKey(since: string, perPage: number, language?: string): string {
	return `trending_repos:${since}:${perPage}:${keyPart(language ?? "")}`;
}

function buildRepoIssuesCacheKey(owner: string, repo: string, state: string): string {
	return `repo_issues:${normalizeRepoKey(owner, repo)}:${state}`;
}

function buildRepoPullRequestsCacheKey(owner: string, repo: string, state: string): string {
	return `repo_pull_requests:${normalizeRepoKey(owner, repo)}:${state}`;
}

function buildIssueCacheKey(owner: string, repo: string, issueNumber: number): string {
	return `issue:${normalizeRepoKey(owner, repo)}:${issueNumber}`;
}

function buildIssueCommentsCacheKey(owner: string, repo: string, issueNumber: number): string {
	return `issue_comments:${normalizeRepoKey(owner, repo)}:${issueNumber}`;
}

function buildPullRequestCacheKey(owner: string, repo: string, pullNumber: number): string {
	return `pull_request:${normalizeRepoKey(owner, repo)}:${pullNumber}`;
}

function buildPullRequestFilesCacheKey(owner: string, repo: string, pullNumber: number): string {
	return `pull_request_files:${normalizeRepoKey(owner, repo)}:${pullNumber}`;
}

function buildPullRequestCommentsCacheKey(owner: string, repo: string, pullNumber: number): string {
	return `pull_request_comments:${normalizeRepoKey(owner, repo)}:${pullNumber}`;
}

function buildPullRequestReviewsCacheKey(owner: string, repo: string, pullNumber: number): string {
	return `pull_request_reviews:${normalizeRepoKey(owner, repo)}:${pullNumber}`;
}

function buildPullRequestCommitsCacheKey(owner: string, repo: string, pullNumber: number): string {
	return `pull_request_commits:${normalizeRepoKey(owner, repo)}:${pullNumber}`;
}

function buildRepoContributorsCacheKey(owner: string, repo: string, perPage: number): string {
	return `repo_contributors:${normalizeRepoKey(owner, repo)}:${perPage}`;
}

function buildUserProfileCacheKey(username: string): string {
	return `user_profile:${username.toLowerCase()}`;
}

function buildUserPublicReposCacheKey(username: string, perPage: number): string {
	return `user_public_repos:${username.toLowerCase()}:${perPage}`;
}

function buildUserPublicOrgsCacheKey(username: string): string {
	return `user_public_orgs:${username.toLowerCase()}`;
}

function buildUserFollowersCacheKey(username: string, perPage: number): string {
	return `user_followers:${username.toLowerCase()}:${perPage}`;
}

function buildUserFollowingCacheKey(username: string, perPage: number): string {
	return `user_following:${username.toLowerCase()}:${perPage}`;
}

function buildRepoWorkflowsCacheKey(owner: string, repo: string): string {
	return `repo_workflows:${normalizeRepoKey(owner, repo)}`;
}

function buildRepoWorkflowRunsCacheKey(owner: string, repo: string, perPage: number): string {
	return `repo_workflow_runs:${normalizeRepoKey(owner, repo)}:${perPage}`;
}

function buildRepoNavCountsCacheKey(owner: string, repo: string): string {
	return `repo_nav_counts:${normalizeRepoKey(owner, repo)}`;
}

function buildRepoLanguagesCacheKey(owner: string, repo: string): string {
	return `repo_languages:${normalizeRepoKey(owner, repo)}`;
}

function buildOrgMembersCacheKey(org: string, perPage: number): string {
	return `org_members:${org.toLowerCase()}:${perPage}`;
}

function buildPersonRepoActivityCacheKey(owner: string, repo: string, username: string): string {
	return `person_repo_activity:${normalizeRepoKey(owner, repo)}:${username.toLowerCase()}`;
}

function buildPRBundleCacheKey(owner: string, repo: string, pullNumber: number): string {
	return `pr_bundle:${normalizeRepoKey(owner, repo)}:${pullNumber}`;
}

const DEFAULT_BRANCH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function defaultBranchRedisKey(owner: string, repo: string): string {
	return `repo_default_branch:${normalizeRepoKey(owner, repo)}`;
}

export async function getCachedDefaultBranch(owner: string, repo: string): Promise<string | null> {
	return redis.get<string>(defaultBranchRedisKey(owner, repo));
}

async function cacheDefaultBranch(owner: string, repo: string, branch: string): Promise<void> {
	await redis.set(defaultBranchRedisKey(owner, repo), branch, {
		ex: DEFAULT_BRANCH_TTL_SECONDS,
	});
}

const getGitHubAuthContext = cache(async (): Promise<GitHubAuthContext | null> => {
	const session = await getServerSession();
	const reqHeaders = await headers();
	if (!session) return null;
	const token = session.githubUser.accessToken;

	const cacheControl = reqHeaders.get("cache-control") ?? "";
	const pragma = reqHeaders.get("pragma") ?? "";
	const forceRefresh =
		cacheControl.includes("no-cache") ||
		cacheControl.includes("max-age=0") ||
		pragma.includes("no-cache");

	return {
		userId: session.user.id,
		token,
		octokit: new Octokit({ auth: token }),
		forceRefresh,
		githubUser: session.githubUser,
	};
});

function getSyncErrorMessage(error: unknown): string {
	if (typeof error === "object" && error !== null) {
		const maybeMessage = (error as { message?: unknown }).message;
		if (typeof maybeMessage === "string" && maybeMessage.trim()) {
			return maybeMessage;
		}
	}
	return "Unknown sync error";
}

async function fetchUserReposFromGitHub(octokit: Octokit, sort: RepoSort, perPage: number) {
	const { data } = await octokit.repos.listForAuthenticatedUser({
		sort,
		per_page: perPage,
		affiliation: "owner,collaborator,organization_member",
	});
	return data;
}

async function fetchRepoFromGitHub(octokit: Octokit, owner: string, repo: string) {
	const { data } = await octokit.repos.get({ owner, repo });
	return data;
}

async function fetchRepoContentsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	path: string,
	ref?: string,
) {
	const { data } = await octokit.repos.getContent({
		owner,
		repo,
		path,
		...(ref ? { ref } : {}),
	});
	return data;
}

async function fetchRepoTreeFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	treeSha: string,
	recursive?: boolean,
) {
	const { data } = await octokit.git.getTree({
		owner,
		repo,
		tree_sha: treeSha,
		...(recursive ? { recursive: "1" } : {}),
	});
	return data;
}

async function fetchRepoBranchesFromGitHub(octokit: Octokit, owner: string, repo: string) {
	const branches: Awaited<ReturnType<typeof octokit.repos.listBranches>>["data"] = [];
	let page = 1;
	while (true) {
		const { data } = await octokit.repos.listBranches({
			owner,
			repo,
			per_page: 100,
			page,
		});
		branches.push(...data);
		if (data.length < 100) break;
		page++;
	}
	return branches;
}

async function fetchRepoTagsFromGitHub(octokit: Octokit, owner: string, repo: string) {
	const { data } = await octokit.repos.listTags({
		owner,
		repo,
		per_page: 100,
	});
	return data;
}

async function fetchFileContentFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	path: string,
	ref?: string,
) {
	try {
		const { data } = await octokit.repos.getContent({
			owner,
			repo,
			path,
			...(ref ? { ref } : {}),
		});
		if (Array.isArray(data) || data.type !== "file") return null;

		const content = Buffer.from(data.content, "base64").toString("utf-8");
		return { ...data, content };
	} catch {
		return null;
	}
}

async function fetchRepoReadmeFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	ref?: string,
) {
	try {
		const { data } = await octokit.repos.getReadme({
			owner,
			repo,
			...(ref ? { ref } : {}),
		});
		const content = Buffer.from(data.content, "base64").toString("utf-8");
		return { ...data, content };
	} catch {
		return null;
	}
}

async function fetchUserOrgsFromGitHub(octokit: Octokit, perPage: number) {
	const { data } = await octokit.orgs.listForAuthenticatedUser({ per_page: perPage });
	return data;
}

async function fetchOrgFromGitHub(octokit: Octokit, org: string) {
	try {
		const { data } = await octokit.orgs.get({ org });
		return data;
	} catch (error) {
		// 404
		return null;
	}
}

async function fetchOrgReposFromGitHub(
	octokit: Octokit,
	org: string,
	sort: OrgRepoSort,
	type: OrgRepoType,
	perPage: number,
) {
	const { data } = await octokit.repos.listForOrg({ org, per_page: perPage, sort, type });
	return data;
}

async function fetchNotificationsFromGitHub(octokit: Octokit, perPage: number) {
	const { data } = await octokit.activity.listNotificationsForAuthenticatedUser({
		per_page: perPage,
		all: false,
	});
	return data;
}

async function fetchSearchIssuesFromGitHub(octokit: Octokit, query: string, perPage: number) {
	const { data } = await octokit.search.issuesAndPullRequests({
		q: query,
		per_page: perPage,
		sort: "updated",
		order: "desc",
	});
	return data;
}

async function fetchUserEventsFromGitHub(octokit: Octokit, username: string, perPage: number) {
	const { data } = await octokit.activity.listEventsForAuthenticatedUser({
		username,
		per_page: perPage,
	});
	return data;
}

async function fetchContributionsFromGitHub(token: string, username: string) {
	const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                color
              }
            }
          }
        }
      }
    }
  `;

	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query, variables: { username } }),
	});

	if (!response.ok) return null;
	const json = await response.json();
	return json.data?.user?.contributionsCollection?.contributionCalendar ?? null;
}

async function fetchStarredReposFromGitHub(octokit: Octokit, perPage: number) {
	const { data } = await octokit.activity.listReposStarredByAuthenticatedUser({
		per_page: perPage,
		sort: "updated",
	});
	return data;
}

async function fetchTrendingReposFromGitHub(
	octokit: Octokit,
	since: "daily" | "weekly" | "monthly",
	perPage: number,
	language?: string,
) {
	const dateMap = { daily: 1, weekly: 7, monthly: 30 };
	const daysAgo = dateMap[since];
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	const dateStr = date.toISOString().split("T")[0];

	const q = language
		? `stars:>5 created:>${dateStr} language:${language}`
		: `stars:>5 created:>${dateStr}`;

	const { data } = await octokit.search.repos({
		q,
		sort: "stars",
		order: "desc",
		per_page: perPage,
	});

	return data.items;
}

async function fetchRepoIssuesFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	state: "open" | "closed" | "all",
) {
	const { data } = await octokit.issues.listForRepo({
		owner,
		repo,
		state,
		per_page: 50,
		sort: "updated",
		direction: "desc",
	});
	return data.filter((issue) => !issue.pull_request);
}

async function fetchRepoPullRequestsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	state: "open" | "closed" | "all",
) {
	const { data } = await octokit.pulls.list({
		owner,
		repo,
		state,
		per_page: 50,
		sort: "updated",
		direction: "desc",
	});
	return data;
}

async function fetchIssueFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	issueNumber: number,
) {
	const { data } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
	return data;
}

async function fetchIssueCommentsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	issueNumber: number,
) {
	const { data } = await octokit.issues.listComments({
		owner,
		repo,
		issue_number: issueNumber,
		per_page: 100,
	});
	return data;
}

async function fetchPullRequestFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	pullNumber: number,
) {
	const { data } = await octokit.pulls.get({ owner, repo, pull_number: pullNumber });
	return data;
}

export async function isBranchBehindBase(
	owner: string,
	repo: string,
	baseRef: string,
	headRef: string,
	headOwner?: string | null,
): Promise<boolean> {
	const octokit = await getOctokit();
	if (!octokit) return false;
	try {
		const headPart =
			headOwner && headOwner !== owner ? `${headOwner}:${headRef}` : headRef;
		const basehead = `${headPart}...${baseRef}`;
		const { data } = await octokit.repos.compareCommitsWithBasehead({
			owner,
			repo,
			basehead,
		});
		return (data.behind_by ?? 0) > 0;
	} catch {
		return false;
	}
}

async function fetchPullRequestFilesFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	pullNumber: number,
) {
	const { data } = await octokit.pulls.listFiles({
		owner,
		repo,
		pull_number: pullNumber,
		per_page: 100,
	});
	return data;
}

async function fetchPullRequestCommentsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	pullNumber: number,
) {
	const [issueComments, reviewComments] = await Promise.all([
		octokit.issues
			.listComments({ owner, repo, issue_number: pullNumber, per_page: 100 })
			.then((r) => r.data),
		octokit.pulls
			.listReviewComments({ owner, repo, pull_number: pullNumber, per_page: 100 })
			.then((r) => r.data),
	]);
	return { issueComments, reviewComments };
}

async function fetchPullRequestReviewsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	pullNumber: number,
) {
	const { data } = await octokit.pulls.listReviews({
		owner,
		repo,
		pull_number: pullNumber,
		per_page: 100,
	});
	return data;
}

async function fetchPullRequestCommitsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	pullNumber: number,
) {
	const { data } = await octokit.pulls.listCommits({
		owner,
		repo,
		pull_number: pullNumber,
		per_page: 100,
	});
	return data;
}

async function fetchRepoContributorsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	perPage: number,
) {
	try {
		const response = await octokit.repos.listContributors({
			owner,
			repo,
			per_page: perPage,
		});
		const list = response.data.map((c) => ({
			login: c.login ?? "",
			avatar_url: c.avatar_url ?? "",
			contributions: c.contributions,
			html_url: c.html_url ?? "",
		}));

		let totalCount = list.length;
		const linkHeader = response.headers.link;
		if (linkHeader) {
			const lastMatch = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
			if (lastMatch) {
				totalCount = (parseInt(lastMatch[1], 10) - 1) * perPage + perPage;
			}
		}

		return { list, totalCount };
	} catch {
		return { list: [], totalCount: 0 };
	}
}

async function fetchUserProfileFromGitHub(octokit: Octokit, username: string) {
	// Try direct user lookup first
	try {
		const { data } = await octokit.users.getByUsername({ username });
		return data;
	} catch {
		// continue to fallbacks
	}

	if (!username.endsWith("[bot]")) {
		try {
			const { data } = await octokit.users.getByUsername({
				username: `${username.toLowerCase()}[bot]`,
			});
			return data;
		} catch {
			// continue
		}
	}

	try {
		const { data: app } = await octokit.request("GET /apps/{app_slug}", {
			app_slug: username.toLowerCase(),
		});
		const appData = app as Record<string, unknown>;
		return {
			login: (appData.slug as string) ?? username,
			name: (appData.name as string) ?? username,
			avatar_url:
				((appData.owner as Record<string, unknown>)
					?.avatar_url as string) ?? "",
			html_url:
				(appData.html_url as string) ??
				`https://github.com/apps/${username.toLowerCase()}`,
			bio: (appData.description as string) ?? null,
			blog: (appData.external_url as string) ?? null,
			location: null,
			company: null,
			twitter_username: null,
			public_repos: 0,
			followers: 0,
			following: 0,
			created_at: (appData.created_at as string) ?? new Date().toISOString(),
			type: "Bot",
		};
	} catch {
		// all lookups failed
	}

	return null;
}

async function enrichMissingRepoLanguagesFromGraphQL<
	T extends {
		language?: string | null;
		name: string;
		owner?: { login?: string | null } | null;
	},
>(token: string, repos: T[]): Promise<T[]> {
	const missing = repos
		.map((repo, index) => ({ repo, index }))
		.filter(
			({ repo }) =>
				!repo.language &&
				typeof repo.name === "string" &&
				typeof repo.owner?.login === "string",
		)
		.slice(0, 50);
	if (missing.length === 0) return repos;

	const aliases = missing.map(
		(_item, i) =>
			`r${i}: repository(owner: $owner${i}, name: $name${i}) { primaryLanguage { name } }`,
	);
	const variableDefinitions = missing
		.flatMap((_item, i) => [`$owner${i}: String!`, `$name${i}: String!`])
		.join(", ");
	const variables = Object.fromEntries(
		missing.flatMap(({ repo }, i) => [
			[`owner${i}`, String(repo.owner?.login)],
			[`name${i}`, repo.name],
		]),
	);
	const query = `query(${variableDefinitions}) { ${aliases.join("\n")} }`;

	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables }),
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok) return repos;
		const json = (await response.json()) as {
			data?: Record<
				string,
				{ primaryLanguage?: { name?: string | null } } | null
			>;
		};
		if (!json.data) return repos;

		const languageByIndex = new Map<number, string>();
		for (let i = 0; i < missing.length; i++) {
			const lang = json.data[`r${i}`]?.primaryLanguage?.name;
			if (typeof lang === "string" && lang.trim()) {
				languageByIndex.set(missing[i].index, lang);
			}
		}

		if (languageByIndex.size === 0) return repos;
		return repos.map((repo, idx) =>
			languageByIndex.has(idx)
				? { ...repo, language: languageByIndex.get(idx) ?? repo.language }
				: repo,
		);
	} catch {
		return repos;
	}
}

type UserPublicRepo = Awaited<ReturnType<Octokit["repos"]["listForUser"]>>["data"][number];

async function fetchUserPublicReposFromGitHub(
	octokit: Octokit,
	username: string,
	perPage: number,
	token?: string | null,
): Promise<UserPublicRepo[]> {
	// Fetch recently-updated repos for the listing + top-starred repos via
	// search API for accurate profile scoring (listForUser can't sort by stars).
	const half = Math.ceil(perPage / 2);
	const [byUpdated, topStarred] = await Promise.all([
		octokit.repos.listForUser({ username, sort: "updated", per_page: half }),
		octokit.search
			.repos({
				q: `user:${username} fork:true`,
				sort: "stars",
				order: "desc",
				per_page: half,
			})
			.catch(() => null),
	]);
	if (!topStarred) {
		if (!token) return byUpdated.data;
		return enrichMissingRepoLanguagesFromGraphQL(token, byUpdated.data);
	}
	// Merge and deduplicate — recently-updated first, then top-starred fills gaps
	const seen = new Set<number>();
	const merged: UserPublicRepo[] = [];
	for (const repo of byUpdated.data) {
		seen.add(repo.id);
		merged.push(repo);
	}
	for (const repo of topStarred.data.items) {
		if (!seen.has(repo.id)) {
			seen.add(repo.id);
			merged.push(repo as (typeof byUpdated.data)[number]);
		}
	}
	if (!token) return merged;
	return enrichMissingRepoLanguagesFromGraphQL(token, merged);
}

async function fetchUserPublicOrgsFromGitHub(octokit: Octokit, username: string) {
	const { data } = await octokit.orgs.listForUser({ username, per_page: 100 });
	return data;
}

async function fetchUserOrgTopReposFromGitHub(
	octokit: Octokit,
	orgLogins: string[],
): Promise<
	{
		name: string;
		full_name: string;
		stargazers_count: number;
		forks_count: number;
		language: string | null;
	}[]
> {
	if (orgLogins.length === 0) return [];
	// Search top-starred repos across all the user's orgs in one call
	const orgQuery = orgLogins
		.slice(0, 10)
		.map((o) => `org:${o}`)
		.join(" ");
	try {
		const { data } = await octokit.search.repos({
			q: `${orgQuery} fork:true`,
			sort: "stars",
			order: "desc",
			per_page: 30,
		});
		return data.items.map((r) => ({
			name: r.name,
			full_name: r.full_name,
			stargazers_count: r.stargazers_count ?? 0,
			forks_count: r.forks_count ?? 0,
			language: r.language ?? null,
		}));
	} catch {
		return [];
	}
}

async function fetchRepoWorkflowsFromGitHub(octokit: Octokit, owner: string, repo: string) {
	const { data } = await octokit.actions.listRepoWorkflows({ owner, repo, per_page: 100 });
	return data.workflows;
}

async function fetchRepoWorkflowRunsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	perPage: number,
) {
	const { data } = await octokit.actions.listWorkflowRunsForRepo({
		owner,
		repo,
		per_page: perPage,
	});
	return data.workflow_runs;
}

async function fetchOrgMembersFromGitHub(octokit: Octokit, org: string, perPage: number) {
	const { data } = await octokit.orgs.listMembers({ org, per_page: perPage });
	return data;
}

async function fetchRepoNavCountsFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	openIssuesAndPrs: number,
) {
	const [prSearch, runsResult] = await Promise.all([
		octokit.search
			.issuesAndPullRequests({
				q: `repo:${owner}/${repo} is:open is:pr`,
				per_page: 1,
			})
			.catch(() => ({ data: { total_count: 0 } })),
		octokit.actions
			.listWorkflowRunsForRepo({
				owner,
				repo,
				status: "in_progress",
				per_page: 1,
			})
			.catch(() => ({ data: { total_count: 0 } })),
	]);

	const openPrs = prSearch.data.total_count;
	return {
		openPrs,
		openIssues: Math.max(0, openIssuesAndPrs - openPrs),
		activeRuns: runsResult.data.total_count,
	};
}

/** Conditional GET against the GitHub API — returns {notModified:true} on 304 without throwing. */
async function ghConditionalGet(
	token: string,
	path: string,
	etag: string | null,
): Promise<
	| { notModified: true; data?: undefined; etag?: undefined }
	| { notModified: false; data: unknown; etag: string | null }
> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (etag) headers["If-None-Match"] = etag;
	const resp = await fetch(`https://api.github.com${path}`, { headers, cache: "no-store" });
	if (resp.status === 304) return { notModified: true };
	if (!resp.ok) {
		const body = await resp.text().catch(() => "");
		throw new Error(`GitHub API ${resp.status}: ${path} – ${body.slice(0, 200)}`);
	}
	const data = await resp.json();
	return { notModified: false, data, etag: resp.headers.get("etag") };
}

async function upsertCacheWithShared<T>(
	userId: string,
	cacheKey: string,
	cacheType: string,
	data: T,
	etag: string | null = null,
) {
	await upsertGithubCacheEntry(userId, cacheKey, cacheType, data, etag);
	if (isShareableCacheType(cacheType)) {
		upsertSharedCacheEntry(cacheKey, data, etag).catch(() => {});
	}
}

async function touchCacheWithShared(userId: string, cacheKey: string, cacheType: string) {
	await touchGithubCacheEntrySyncedAt(userId, cacheKey);
	if (isShareableCacheType(cacheType)) {
		touchSharedCacheEntrySyncedAt(cacheKey).catch(() => {});
	}
}

async function processGitDataSyncJob(
	authCtx: GitHubAuthContext,
	jobType: GitDataSyncJobType,
	payload: GitDataSyncJobPayload,
) {
	// Jobs that don't require owner/repo
	switch (jobType) {
		case "user_repos": {
			const sort = payload.sort ?? "updated";
			const perPage = payload.perPage ?? 30;
			const data = await fetchUserReposFromGitHub(authCtx.octokit, sort, perPage);
			await upsertGithubCacheEntry(
				authCtx.userId,
				buildUserReposCacheKey(sort, perPage),
				"user_repos",
				data,
			);
			return;
		}
		case "authenticated_user": {
			const auKey = buildAuthenticatedUserCacheKey();
			const auCached = await getGithubCacheEntry(authCtx.userId, auKey);
			const auResp = await ghConditionalGet(
				authCtx.token,
				"/user",
				auCached?.etag ?? null,
			);
			if (auResp.notModified) {
				await touchGithubCacheEntrySyncedAt(authCtx.userId, auKey);
			} else {
				await upsertGithubCacheEntry(
					authCtx.userId,
					auKey,
					"authenticated_user",
					auResp.data,
					auResp.etag ?? null,
				);
			}
			return;
		}
		case "user_orgs": {
			const perPage = payload.perPage ?? 50;
			const data = await fetchUserOrgsFromGitHub(authCtx.octokit, perPage);
			await upsertGithubCacheEntry(
				authCtx.userId,
				buildUserOrgsCacheKey(perPage),
				"user_orgs",
				data,
			);
			return;
		}
		case "org": {
			if (!payload.orgName) return;
			const data = await fetchOrgFromGitHub(authCtx.octokit, payload.orgName);
			await upsertCacheWithShared(
				authCtx.userId,
				buildOrgCacheKey(payload.orgName),
				"org",
				data,
			);
			return;
		}
		case "org_repos": {
			if (!payload.orgName) return;
			const sort = payload.orgSort ?? "updated";
			const type = payload.orgType ?? "all";
			const perPage = payload.perPage ?? 100;
			const data = await fetchOrgReposFromGitHub(
				authCtx.octokit,
				payload.orgName,
				sort,
				type,
				perPage,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildOrgReposCacheKey(payload.orgName, sort, type, perPage),
				"org_repos",
				data,
			);
			return;
		}
		case "notifications": {
			const perPage = payload.perPage ?? 20;
			const data = await fetchNotificationsFromGitHub(authCtx.octokit, perPage);
			await upsertGithubCacheEntry(
				authCtx.userId,
				buildNotificationsCacheKey(perPage),
				"notifications",
				data,
			);
			return;
		}
		case "search_issues": {
			if (!payload.query) return;
			const perPage = payload.perPage ?? 20;
			const data = await fetchSearchIssuesFromGitHub(
				authCtx.octokit,
				payload.query,
				perPage,
			);
			await upsertGithubCacheEntry(
				authCtx.userId,
				buildSearchIssuesCacheKey(payload.query, perPage),
				"search_issues",
				data,
			);
			return;
		}
		case "user_events": {
			if (!payload.username) return;
			const perPage = payload.perPage ?? 30;
			const data = await fetchUserEventsFromGitHub(
				authCtx.octokit,
				payload.username,
				perPage,
			);
			await upsertGithubCacheEntry(
				authCtx.userId,
				buildUserEventsCacheKey(payload.username, perPage),
				"user_events",
				data,
			);
			return;
		}
		case "starred_repos": {
			const perPage = payload.perPage ?? 10;
			const data = await fetchStarredReposFromGitHub(authCtx.octokit, perPage);
			await upsertGithubCacheEntry(
				authCtx.userId,
				buildStarredReposCacheKey(perPage),
				"starred_repos",
				data,
			);
			return;
		}
		case "contributions": {
			if (!payload.username) return;
			const data = await fetchContributionsFromGitHub(
				authCtx.token,
				payload.username,
			);
			await upsertGithubCacheEntry(
				authCtx.userId,
				buildContributionsCacheKey(payload.username),
				"contributions",
				data,
			);
			return;
		}
		case "trending_repos": {
			const since = payload.since ?? "weekly";
			const perPage = payload.perPage ?? 10;
			const data = await fetchTrendingReposFromGitHub(
				authCtx.octokit,
				since,
				perPage,
				payload.language,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildTrendingReposCacheKey(since, perPage, payload.language),
				"trending_repos",
				data,
			);
			return;
		}
		case "org_members": {
			if (!payload.orgName) return;
			const perPage = payload.perPage ?? 100;
			const data = await fetchOrgMembersFromGitHub(
				authCtx.octokit,
				payload.orgName,
				perPage,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildOrgMembersCacheKey(payload.orgName, perPage),
				"org_members",
				data,
			);
			return;
		}
		case "user_profile": {
			if (!payload.username) return;
			const upKey = buildUserProfileCacheKey(payload.username);
			const upCached = await getGithubCacheEntry(authCtx.userId, upKey);
			const upResp = await ghConditionalGet(
				authCtx.token,
				`/users/${payload.username}`,
				upCached?.etag ?? null,
			);
			if (upResp.notModified) {
				await touchCacheWithShared(authCtx.userId, upKey, "user_profile");
			} else {
				await upsertCacheWithShared(
					authCtx.userId,
					upKey,
					"user_profile",
					upResp.data,
					upResp.etag ?? null,
				);
			}
			return;
		}
		case "user_public_repos": {
			if (!payload.username) return;
			const perPage = payload.perPage ?? 30;
			const data = await fetchUserPublicReposFromGitHub(
				authCtx.octokit,
				payload.username,
				perPage,
				authCtx.token,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildUserPublicReposCacheKey(payload.username, perPage),
				"user_public_repos",
				data,
			);
			return;
		}
		case "user_public_orgs": {
			if (!payload.username) return;
			const data = await fetchUserPublicOrgsFromGitHub(
				authCtx.octokit,
				payload.username,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildUserPublicOrgsCacheKey(payload.username),
				"user_public_orgs",
				data,
			);
			return;
		}
		case "user_followers": {
			if (!payload.username) return;
			const perPage = payload.perPage ?? 100;
			const data = await fetchUserFollowersFromGitHub(
				authCtx.octokit,
				authCtx.token,
				payload.username,
				perPage,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildUserFollowersCacheKey(payload.username, perPage),
				"user_followers",
				data,
			);
			return;
		}
		case "user_following": {
			if (!payload.username) return;
			const perPage = payload.perPage ?? 100;
			const data = await fetchUserFollowingFromGitHub(
				authCtx.octokit,
				authCtx.token,
				payload.username,
				perPage,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildUserFollowingCacheKey(payload.username, perPage),
				"user_following",
				data,
			);
			return;
		}
	}

	// Jobs that require owner/repo
	if (!payload.owner || !payload.repo) return;

	const owner = payload.owner;
	const repo = payload.repo;

	switch (jobType) {
		case "repo": {
			const repoKey = buildRepoCacheKey(owner, repo);
			const repoCached = await getGithubCacheEntry(authCtx.userId, repoKey);
			const repoRes = await ghConditionalGet(
				authCtx.token,
				`/repos/${owner}/${repo}`,
				repoCached?.etag ?? null,
			);
			if (repoRes.notModified) {
				await touchGithubCacheEntrySyncedAt(authCtx.userId, repoKey);
			} else {
				await upsertGithubCacheEntry(
					authCtx.userId,
					repoKey,
					"repo",
					repoRes.data,
					repoRes.etag,
				);
			}
			return;
		}
		case "repo_contents": {
			const path = payload.path ?? "";
			const ref = normalizeRef(payload.ref);
			const data = await fetchRepoContentsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				path,
				ref || undefined,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoContentsCacheKey(owner, repo, path, ref),
				"repo_contents",
				data,
			);
			return;
		}
		case "repo_tree": {
			if (!payload.treeSha) return;
			const recursive = payload.recursive === true;
			const data = await fetchRepoTreeFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				payload.treeSha,
				recursive,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoTreeCacheKey(owner, repo, payload.treeSha, recursive),
				"repo_tree",
				data,
			);
			return;
		}
		case "repo_branches": {
			const data = await fetchRepoBranchesFromGitHub(
				authCtx.octokit,
				owner,
				repo,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoBranchesCacheKey(owner, repo),
				"repo_branches",
				data,
			);
			return;
		}
		case "repo_tags": {
			const data = await fetchRepoTagsFromGitHub(authCtx.octokit, owner, repo);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoTagsCacheKey(owner, repo),
				"repo_tags",
				data,
			);
			return;
		}
		case "file_content": {
			const path = payload.path ?? "";
			const ref = normalizeRef(payload.ref);
			const data = await fetchFileContentFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				path,
				ref || undefined,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildFileContentCacheKey(owner, repo, path, ref),
				"file_content",
				data,
			);
			return;
		}
		case "repo_readme": {
			const ref = normalizeRef(payload.ref);
			const rdKey = buildRepoReadmeCacheKey(owner, repo, ref);
			const rdCached = await getGithubCacheEntry(authCtx.userId, rdKey);
			const rdPath = `/repos/${owner}/${repo}/readme${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
			try {
				const rdRes = await ghConditionalGet(
					authCtx.token,
					rdPath,
					rdCached?.etag ?? null,
				);
				if (rdRes.notModified) {
					await touchCacheWithShared(
						authCtx.userId,
						rdKey,
						"repo_readme",
					);
				} else {
					const rdData = rdRes.data as {
						content: string;
						[key: string]: unknown;
					};
					const content = Buffer.from(
						rdData.content,
						"base64",
					).toString("utf-8");
					await upsertCacheWithShared(
						authCtx.userId,
						rdKey,
						"repo_readme",
						{ ...rdData, content },
						rdRes.etag,
					);
				}
			} catch (e: unknown) {
				if (isOctokitNotFound(e)) {
					await upsertCacheWithShared(
						authCtx.userId,
						rdKey,
						"repo_readme",
						null,
					);
					return;
				}
				throw e;
			}
			return;
		}
		case "repo_issues": {
			const state = payload.state ?? "open";
			const data = await fetchRepoIssuesFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				state,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoIssuesCacheKey(owner, repo, state),
				"repo_issues",
				data,
			);
			return;
		}
		case "repo_pull_requests": {
			const state = payload.state ?? "open";
			const data = await fetchRepoPullRequestsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				state,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoPullRequestsCacheKey(owner, repo, state),
				"repo_pull_requests",
				data,
			);
			return;
		}
		case "issue": {
			if (!payload.issueNumber) return;
			const isKey = buildIssueCacheKey(owner, repo, payload.issueNumber);
			const isCached = await getGithubCacheEntry(authCtx.userId, isKey);
			const isRes = await ghConditionalGet(
				authCtx.token,
				`/repos/${owner}/${repo}/issues/${payload.issueNumber}`,
				isCached?.etag ?? null,
			);
			if (isRes.notModified) {
				await touchCacheWithShared(authCtx.userId, isKey, "issue");
			} else {
				await upsertCacheWithShared(
					authCtx.userId,
					isKey,
					"issue",
					isRes.data,
					isRes.etag,
				);
			}
			return;
		}
		case "issue_comments": {
			if (!payload.issueNumber) return;
			const data = await fetchIssueCommentsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				payload.issueNumber,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildIssueCommentsCacheKey(owner, repo, payload.issueNumber),
				"issue_comments",
				data,
			);
			return;
		}
		case "pull_request": {
			if (!payload.pullNumber) return;
			const prKey = buildPullRequestCacheKey(owner, repo, payload.pullNumber);
			const prCached = await getGithubCacheEntry(authCtx.userId, prKey);
			const prRes = await ghConditionalGet(
				authCtx.token,
				`/repos/${owner}/${repo}/pulls/${payload.pullNumber}`,
				prCached?.etag ?? null,
			);
			if (prRes.notModified) {
				await touchCacheWithShared(authCtx.userId, prKey, "pull_request");
			} else {
				await upsertCacheWithShared(
					authCtx.userId,
					prKey,
					"pull_request",
					prRes.data,
					prRes.etag,
				);
			}
			return;
		}
		case "pull_request_files": {
			if (!payload.pullNumber) return;
			const data = await fetchPullRequestFilesFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				payload.pullNumber,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildPullRequestFilesCacheKey(owner, repo, payload.pullNumber),
				"pull_request_files",
				data,
			);
			return;
		}
		case "pull_request_comments": {
			if (!payload.pullNumber) return;
			const data = await fetchPullRequestCommentsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				payload.pullNumber,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildPullRequestCommentsCacheKey(owner, repo, payload.pullNumber),
				"pull_request_comments",
				data,
			);
			return;
		}
		case "pull_request_reviews": {
			if (!payload.pullNumber) return;
			const data = await fetchPullRequestReviewsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				payload.pullNumber,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildPullRequestReviewsCacheKey(owner, repo, payload.pullNumber),
				"pull_request_reviews",
				data,
			);
			return;
		}
		case "pull_request_commits": {
			if (!payload.pullNumber) return;
			const data = await fetchPullRequestCommitsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				payload.pullNumber,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildPullRequestCommitsCacheKey(owner, repo, payload.pullNumber),
				"pull_request_commits",
				data,
			);
			return;
		}
		case "repo_contributors": {
			const perPage = payload.perPage ?? 20;
			const data = await fetchRepoContributorsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				perPage,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoContributorsCacheKey(owner, repo, perPage),
				"repo_contributors",
				data,
			);
			return;
		}
		case "repo_workflows": {
			const data = await fetchRepoWorkflowsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoWorkflowsCacheKey(owner, repo),
				"repo_workflows",
				data,
			);
			return;
		}
		case "repo_workflow_runs": {
			const perPage = payload.perPage ?? 50;
			const data = await fetchRepoWorkflowRunsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				perPage,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoWorkflowRunsCacheKey(owner, repo, perPage),
				"repo_workflow_runs",
				data,
			);
			return;
		}
		case "repo_nav_counts": {
			const openIssuesAndPrs = payload.openIssuesAndPrs ?? 0;
			const data = await fetchRepoNavCountsFromGitHub(
				authCtx.octokit,
				owner,
				repo,
				openIssuesAndPrs,
			);
			await upsertCacheWithShared(
				authCtx.userId,
				buildRepoNavCountsCacheKey(owner, repo),
				"repo_nav_counts",
				data,
			);
			return;
		}
		case "pr_bundle": {
			if (!payload.pullNumber) return;
			const data = await fetchPRBundleFromGitHub(
				authCtx.token,
				owner,
				repo,
				payload.pullNumber,
			);
			if (data) {
				await upsertCacheWithShared(
					authCtx.userId,
					buildPRBundleCacheKey(owner, repo, payload.pullNumber),
					"pr_bundle",
					data,
				);
			}
			return;
		}
		default:
			return;
	}
}

async function drainGitDataSyncQueue(authCtx: GitHubAuthContext, limit = 4) {
	const jobs = await claimDueGithubSyncJobs<GitDataSyncJobPayload>(authCtx.userId, limit);
	if (jobs.length === 0) return 0;

	for (const job of jobs) {
		try {
			await processGitDataSyncJob(
				authCtx,
				job.jobType as GitDataSyncJobType,
				job.payload,
			);
			await markGithubSyncJobSucceeded(job.id);
		} catch (error) {
			await markGithubSyncJobFailed(
				job.id,
				job.attempts,
				getSyncErrorMessage(error),
			);
		}
	}

	return jobs.length;
}

function triggerGitDataSyncDrain(authCtx: GitHubAuthContext) {
	if (githubSyncDrainingUsers.has(authCtx.userId)) return;

	githubSyncDrainingUsers.add(authCtx.userId);
	void (async () => {
		try {
			for (let round = 0; round < 3; round++) {
				const processed = await drainGitDataSyncQueue(authCtx, 4);
				if (processed === 0) break;
			}
		} finally {
			githubSyncDrainingUsers.delete(authCtx.userId);
		}
	})();
}

async function enqueueGitDataSync(
	authCtx: GitHubAuthContext,
	jobType: GitDataSyncJobType,
	cacheKey: string,
	payload: GitDataSyncJobPayload,
) {
	if (isShareableCacheType(jobType)) {
		const shared = await getSharedCacheEntry(cacheKey);
		if (shared && Date.now() - new Date(shared.syncedAt).getTime() < 2 * 60 * 1000) {
			return; // Another user recently refreshed this data
		}
	}
	await enqueueGithubSyncJob(authCtx.userId, `${jobType}:${cacheKey}`, jobType, payload);
	triggerGitDataSyncDrain(authCtx);
}

async function readLocalFirstGitData<T>({
	authCtx,
	cacheKey,
	cacheType,
	fallback,
	jobType,
	jobPayload,
	fetchRemote,
}: LocalFirstGitReadOptions<T>): Promise<T> {
	if (!authCtx) return fallback;

	const shareable = isShareableCacheType(cacheType);

	if (authCtx.forceRefresh) {
		try {
			const data = await fetchRemote(authCtx.octokit);
			await upsertGithubCacheEntry(authCtx.userId, cacheKey, cacheType, data);
			if (shareable) {
				upsertSharedCacheEntry(cacheKey, data).catch(() => {});
			}
			return data;
		} catch {
			// Fall through to cached data on error
		}
	}

	const cached = await getGithubCacheEntry<T>(authCtx.userId, cacheKey);
	if (cached) {
		await enqueueGitDataSync(authCtx, jobType, cacheKey, jobPayload);
		return cached.data;
	}

	// Check shared cache before hitting GitHub API
	if (shareable) {
		const shared = await getSharedCacheEntry<T>(cacheKey);
		if (shared) {
			upsertGithubCacheEntry(
				authCtx.userId,
				cacheKey,
				cacheType,
				shared.data,
				shared.etag,
			).catch(() => {});
			await enqueueGitDataSync(authCtx, jobType, cacheKey, jobPayload);
			return shared.data;
		}
	}

	try {
		const data = await fetchRemote(authCtx.octokit);
		await upsertGithubCacheEntry(authCtx.userId, cacheKey, cacheType, data);
		if (shareable) {
			upsertSharedCacheEntry(cacheKey, data).catch(() => {});
		}
		return data;
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		await enqueueGitDataSync(authCtx, jobType, cacheKey, jobPayload);
		return fallback;
	}
}

export async function getGitHubToken(): Promise<string | null> {
	const authCtx = await getGitHubAuthContext();
	return authCtx?.token ?? null;
}

export async function getOctokit(): Promise<Octokit | null> {
	const authCtx = await getGitHubAuthContext();
	return authCtx?.octokit ?? null;
}

export async function getAuthenticatedUser() {
	const authCtx = await getGitHubAuthContext();
	return authCtx?.githubUser ?? null;
}

export async function getUserRepos(sort: RepoSort = "updated", perPage = 30) {
	const authCtx = await getGitHubAuthContext();
	const cacheKey = buildUserReposCacheKey(sort, perPage);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "user_repos",
		fallback: [],
		jobType: "user_repos",
		jobPayload: { sort, perPage },
		fetchRemote: (octokit) => fetchUserReposFromGitHub(octokit, sort, perPage),
	});
}

export async function getUserOrgs(perPage = 50) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildUserOrgsCacheKey(perPage),
		cacheType: "user_orgs",
		fallback: [],
		jobType: "user_orgs",
		jobPayload: { perPage },
		fetchRemote: (octokit) => fetchUserOrgsFromGitHub(octokit, perPage),
	});
}

export async function getOrgRepos(
	org: string,
	{
		perPage = 100,
		sort = "updated",
		type = "all",
	}: {
		perPage?: number;
		sort?: OrgRepoSort;
		type?: OrgRepoType;
	} = {},
) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildOrgReposCacheKey(org, sort, type, perPage),
		cacheType: "org_repos",
		fallback: [],
		jobType: "org_repos",
		jobPayload: { orgName: org, orgSort: sort, orgType: type, perPage },
		fetchRemote: (octokit) =>
			fetchOrgReposFromGitHub(octokit, org, sort, type, perPage),
	});
}

export async function getOrg(org: string) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildOrgCacheKey(org),
		cacheType: "org",
		fallback: null,
		jobType: "org",
		jobPayload: { orgName: org },
		fetchRemote: (octokit) => fetchOrgFromGitHub(octokit, org),
	});
}

export async function getNotifications(perPage = 20) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildNotificationsCacheKey(perPage),
		cacheType: "notifications",
		fallback: [],
		jobType: "notifications",
		jobPayload: { perPage },
		fetchRemote: (octokit) => fetchNotificationsFromGitHub(octokit, perPage),
	});
}

export async function searchIssues(query: string, perPage = 20) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildSearchIssuesCacheKey(query, perPage),
		cacheType: "search_issues",
		fallback: { items: [], total_count: 0, incomplete_results: false },
		jobType: "search_issues",
		jobPayload: { query, perPage },
		fetchRemote: (octokit) => fetchSearchIssuesFromGitHub(octokit, query, perPage),
	});
}

export async function getUserEvents(username: string, perPage = 30) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildUserEventsCacheKey(username, perPage),
		cacheType: "user_events",
		fallback: [],
		jobType: "user_events",
		jobPayload: { username, perPage },
		fetchRemote: (octokit) => fetchUserEventsFromGitHub(octokit, username, perPage),
	});
}

export async function getContributionData(username: string) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildContributionsCacheKey(username),
		cacheType: "contributions",
		fallback: null,
		jobType: "contributions",
		jobPayload: { username },
		fetchRemote: async () => {
			if (!authCtx) return null;
			return fetchContributionsFromGitHub(authCtx.token, username);
		},
	});
}

export async function getStarredRepos(perPage = 10) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildStarredReposCacheKey(perPage),
		cacheType: "starred_repos",
		fallback: [],
		jobType: "starred_repos",
		jobPayload: { perPage },
		fetchRemote: (octokit) => fetchStarredReposFromGitHub(octokit, perPage),
	});
}

export async function getTrendingRepos(
	language?: string,
	since: "daily" | "weekly" | "monthly" = "weekly",
	perPage = 10,
) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildTrendingReposCacheKey(since, perPage, language),
		cacheType: "trending_repos",
		fallback: [],
		jobType: "trending_repos",
		jobPayload: { since, perPage, language },
		fetchRemote: (octokit) =>
			fetchTrendingReposFromGitHub(octokit, since, perPage, language),
	});
}

export async function getRepo(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	const cacheKey = buildRepoCacheKey(owner, repo);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "repo",
		fallback: null,
		jobType: "repo",
		jobPayload: { owner, repo },
		fetchRemote: (octokit) => fetchRepoFromGitHub(octokit, owner, repo),
	});
}

export async function checkIsStarred(owner: string, repo: string): Promise<boolean> {
	const token = await getGitHubToken();
	if (!token) return false;
	try {
		const res = await fetch(
			`https://api.github.com/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
				cache: "no-store",
			},
		);
		return res.status === 204;
	} catch {
		return false;
	}
}

export async function getRepoContents(owner: string, repo: string, path: string, ref?: string) {
	const authCtx = await getGitHubAuthContext();
	const normalizedRef = normalizeRef(ref);
	const cacheKey = buildRepoContentsCacheKey(owner, repo, path, normalizedRef);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "repo_contents",
		fallback: null,
		jobType: "repo_contents",
		jobPayload: { owner, repo, path, ref: normalizedRef },
		fetchRemote: (octokit) =>
			fetchRepoContentsFromGitHub(
				octokit,
				owner,
				repo,
				path,
				normalizedRef || undefined,
			),
	});
}

export async function getRepoTree(
	owner: string,
	repo: string,
	treeSha: string,
	recursive?: boolean,
) {
	const authCtx = await getGitHubAuthContext();
	const recursiveFlag = recursive === true;
	const cacheKey = buildRepoTreeCacheKey(owner, repo, treeSha, recursiveFlag);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "repo_tree",
		fallback: null,
		jobType: "repo_tree",
		jobPayload: { owner, repo, treeSha, recursive: recursiveFlag },
		fetchRemote: (octokit) =>
			fetchRepoTreeFromGitHub(octokit, owner, repo, treeSha, recursiveFlag),
	});
}

export async function getRepoBranches(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	const cacheKey = buildRepoBranchesCacheKey(owner, repo);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "repo_branches",
		fallback: [],
		jobType: "repo_branches",
		jobPayload: { owner, repo },
		fetchRemote: (octokit) => fetchRepoBranchesFromGitHub(octokit, owner, repo),
	});
}

export async function getRepoTags(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	const cacheKey = buildRepoTagsCacheKey(owner, repo);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "repo_tags",
		fallback: [],
		jobType: "repo_tags",
		jobPayload: { owner, repo },
		fetchRemote: (octokit) => fetchRepoTagsFromGitHub(octokit, owner, repo),
	});
}

export async function getFileContent(owner: string, repo: string, path: string, ref?: string) {
	const authCtx = await getGitHubAuthContext();
	const normalizedRef = normalizeRef(ref);
	const cacheKey = buildFileContentCacheKey(owner, repo, path, normalizedRef);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "file_content",
		fallback: null,
		jobType: "file_content",
		jobPayload: { owner, repo, path, ref: normalizedRef },
		fetchRemote: (octokit) =>
			fetchFileContentFromGitHub(
				octokit,
				owner,
				repo,
				path,
				normalizedRef || undefined,
			),
	});
}

export async function getRepoReadme(owner: string, repo: string, ref?: string) {
	const authCtx = await getGitHubAuthContext();
	const normalizedRef = normalizeRef(ref);
	const cacheKey = buildRepoReadmeCacheKey(owner, repo, normalizedRef);

	return readLocalFirstGitData({
		authCtx,
		cacheKey,
		cacheType: "repo_readme",
		fallback: null,
		jobType: "repo_readme",
		jobPayload: { owner, repo, ref: normalizedRef },
		fetchRemote: (octokit) =>
			fetchRepoReadmeFromGitHub(octokit, owner, repo, normalizedRef || undefined),
	});
}

export async function getPullRequest(owner: string, repo: string, pullNumber: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildPullRequestCacheKey(owner, repo, pullNumber),
		cacheType: "pull_request",
		fallback: null,
		jobType: "pull_request",
		jobPayload: { owner, repo, pullNumber },
		fetchRemote: (octokit) =>
			fetchPullRequestFromGitHub(octokit, owner, repo, pullNumber),
	});
}

export async function getPullRequestFiles(owner: string, repo: string, pullNumber: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildPullRequestFilesCacheKey(owner, repo, pullNumber),
		cacheType: "pull_request_files",
		fallback: [],
		jobType: "pull_request_files",
		jobPayload: { owner, repo, pullNumber },
		fetchRemote: (octokit) =>
			fetchPullRequestFilesFromGitHub(octokit, owner, repo, pullNumber),
	});
}

export async function getPullRequestComments(owner: string, repo: string, pullNumber: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildPullRequestCommentsCacheKey(owner, repo, pullNumber),
		cacheType: "pull_request_comments",
		fallback: { issueComments: [], reviewComments: [] },
		jobType: "pull_request_comments",
		jobPayload: { owner, repo, pullNumber },
		fetchRemote: (octokit) =>
			fetchPullRequestCommentsFromGitHub(octokit, owner, repo, pullNumber),
	});
}

export async function getPullRequestReviews(owner: string, repo: string, pullNumber: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildPullRequestReviewsCacheKey(owner, repo, pullNumber),
		cacheType: "pull_request_reviews",
		fallback: [],
		jobType: "pull_request_reviews",
		jobPayload: { owner, repo, pullNumber },
		fetchRemote: (octokit) =>
			fetchPullRequestReviewsFromGitHub(octokit, owner, repo, pullNumber),
	});
}

export async function getPullRequestCommits(owner: string, repo: string, pullNumber: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildPullRequestCommitsCacheKey(owner, repo, pullNumber),
		cacheType: "pull_request_commits",
		fallback: [],
		jobType: "pull_request_commits",
		jobPayload: { owner, repo, pullNumber },
		fetchRemote: (octokit) =>
			fetchPullRequestCommitsFromGitHub(octokit, owner, repo, pullNumber),
	});
}

export interface ReviewThread {
	id: string;
	isResolved: boolean;
	isOutdated: boolean;
	path: string;
	line: number | null;
	startLine: number | null;
	diffSide: string;
	resolvedBy: { login: string } | null;
	comments: {
		id: string;
		databaseId: number;
		body: string;
		createdAt: string;
		author: { login: string; avatarUrl: string } | null;
		reviewState: string | null;
	}[];
}

export async function getPullRequestReviewThreads(
	owner: string,
	repo: string,
	pullNumber: number,
): Promise<ReviewThread[]> {
	const token = await getGitHubToken();
	if (!token) return [];

	const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              startLine
              diffSide
              resolvedBy {
                login
              }
              comments(first: 30) {
                nodes {
                  id
                  databaseId
                  body
                  createdAt
                  author {
                    login
                    avatarUrl
                  }
                  pullRequestReview {
                    state
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				variables: { owner, repo, number: pullNumber },
			}),
		});

		if (!response.ok) return [];
		const json = await response.json();
		const nodes = json.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];

		return nodes.map((thread: Record<string, unknown>) => ({
			id: thread.id,
			isResolved: (thread.isResolved as boolean) ?? false,
			isOutdated: (thread.isOutdated as boolean) ?? false,
			path: (thread.path as string) ?? "",
			line: (thread.line as number | null) ?? null,
			startLine: (thread.startLine as number | null) ?? null,
			diffSide: (thread.diffSide as string) ?? "RIGHT",
			resolvedBy: thread.resolvedBy
				? { login: (thread.resolvedBy as { login: string }).login }
				: null,
			comments: (
				(thread.comments as { nodes?: Record<string, unknown>[] })?.nodes ??
				[]
			).map((c: Record<string, unknown>) => ({
				id: c.id,
				databaseId: c.databaseId,
				body: c.body ?? "",
				createdAt: (c.createdAt as string) ?? "",
				author: c.author
					? {
							login: (
								c.author as {
									login: string;
									avatarUrl: string;
								}
							).login,
							avatarUrl: (
								c.author as {
									login: string;
									avatarUrl: string;
								}
							).avatarUrl,
						}
					: null,
				reviewState:
					(c.pullRequestReview as { state?: string })?.state ?? null,
			})),
		}));
	} catch {
		return [];
	}
}

// --- PR Bundle (GraphQL) ---

export interface PRBundleData {
	pr: {
		number: number;
		title: string;
		body: string | null;
		state: string;
		draft: boolean;
		created_at: string;
		merged_at: string | null;
		mergeable: boolean | null;
		additions: number;
		deletions: number;
		changed_files: number;
		user: { login: string; avatar_url: string; type?: string } | null;
		head: { ref: string; sha: string };
		head_repo_owner?: string | null;
		base: { ref: string; sha: string };
		labels: { name: string; color: string | null; description: string | null }[];
		reactions: ReactionSummary | undefined;
	};
	issueComments: {
		id: number;
		body: string;
		created_at: string;
		user: { login: string; avatar_url: string; type?: string } | null;
		author_association: string;
		reactions: ReactionSummary | undefined;
	}[];
	reviewComments: {
		id: number;
		body: string;
		path: string;
		line: number | null;
		diff_hunk: string | null;
		created_at: string;
		user: { login: string; avatar_url: string; type?: string } | null;
		pull_request_review_id: number;
		reactions: ReactionSummary | undefined;
	}[];
	reviews: {
		id: number;
		body: string | null;
		state: string;
		created_at: string;
		submitted_at: string | null;
		user: { login: string; avatar_url: string; type?: string } | null;
	}[];
	reviewThreads: ReviewThread[];
	commits: {
		sha: string;
		commit: {
			message: string;
			author: { name: string; date: string } | null;
			committer: { name: string; date: string } | null;
		};
		author: { login: string; avatar_url: string } | null;
	}[];
	stateEvents: {
		id: string;
		event: "closed" | "reopened" | "merged" | "ready_for_review" | "convert_to_draft";
		actor: { login: string; avatar_url: string } | null;
		created_at: string;
		merge_ref_name?: string;
	}[];
}

const PR_BUNDLE_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        number
        title
        body
        state
        isDraft
        createdAt
        mergedAt
        mergeable
        additions
        deletions
        changedFiles
        author { __typename login avatarUrl }
        headRefName
        headRefOid
        headRepository { owner { login } }
        baseRefName
        baseRefOid
        labels(first: 20) {
          nodes { name color description }
        }
        reactions(first: 1) { totalCount }
        reactionGroups {
          content
          reactors { totalCount }
        }
        comments(first: 100) {
          nodes {
            databaseId
            body
            createdAt
            author { __typename login avatarUrl }
            authorAssociation
            reactionGroups {
              content
              reactors { totalCount }
            }
          }
        }
        reviews(first: 100) {
          nodes {
            databaseId
            body
            state
            createdAt
            submittedAt
            author { __typename login avatarUrl }
            comments(first: 50) {
              nodes {
                databaseId
                body
                path
                line
                originalLine
                diffHunk
                createdAt
                author { __typename login avatarUrl }
                reactionGroups {
                  content
                  reactors { totalCount }
                }
              }
            }
          }
        }
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            startLine
            diffSide
            resolvedBy { login }
            comments(first: 30) {
              nodes {
                id
                databaseId
                body
                createdAt
                author { __typename login avatarUrl }
                pullRequestReview { state }
              }
            }
          }
        }
        commits(first: 100) {
          nodes {
            commit {
              oid
              message
              author { name date }
              committer { name date }
            }
            resourcePath
          }
        }
        timelineItems(first: 100, itemTypes: [CLOSED_EVENT, REOPENED_EVENT, MERGED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]) {
          nodes {
            __typename
            ... on ClosedEvent { id createdAt actor { login avatarUrl } }
            ... on ReopenedEvent { id createdAt actor { login avatarUrl } }
            ... on MergedEvent { id createdAt actor { login avatarUrl } mergeRefName }
            ... on ReadyForReviewEvent { id createdAt actor { login avatarUrl } }
            ... on ConvertToDraftEvent { id createdAt actor { login avatarUrl } }
          }
        }
      }
    }
  }
`;

interface ReactionSummary extends Record<string, number> {
	total_count: number;
}

interface GraphQLReactionGroup {
	content: string;
	reactors: { totalCount: number };
}

function mapReactionGroups(
	groups: GraphQLReactionGroup[] | undefined,
): ReactionSummary | undefined {
	if (!groups) return undefined;
	const map: Record<string, number> = {};
	let total = 0;
	for (const g of groups) {
		const count = g.reactors?.totalCount ?? 0;
		if (count > 0) {
			const key = (g.content as string)
				.toLowerCase()
				.replace("thumbs_up", "+1")
				.replace("thumbs_down", "-1");
			map[key] = count;
			total += count;
		}
	}
	return { ...map, total_count: total };
}

// ── GraphQL PR Bundle response node types ──

interface GQLAuthor {
	login: string;
	avatarUrl: string;
	__typename: string;
}

interface GQLReactionGroup {
	content: string;
	reactors: { totalCount: number };
}

interface GQLLabel {
	name: string;
	color: string | null;
	description: string | null;
}

interface GQLIssueComment {
	databaseId: number;
	body: string;
	createdAt: string;
	author: GQLAuthor | null;
	authorAssociation: string;
	reactionGroups?: GQLReactionGroup[];
}

interface GQLReviewComment {
	databaseId: number;
	body: string;
	path: string;
	line: number | null;
	originalLine: number | null;
	diffHunk: string | null;
	createdAt: string;
	author: GQLAuthor | null;
	reactionGroups?: GQLReactionGroup[];
}

interface GQLReview {
	databaseId: number;
	body: string | null;
	state: string;
	createdAt: string;
	submittedAt: string | null;
	author: GQLAuthor | null;
	comments?: { nodes: GQLReviewComment[] };
}

interface GQLThreadComment {
	id: string;
	databaseId: number;
	body: string;
	createdAt: string;
	author: { login: string; avatarUrl: string } | null;
	pullRequestReview?: { state: string } | null;
}

interface GQLReviewThread {
	id: string;
	isResolved: boolean;
	isOutdated: boolean;
	path: string;
	line: number | null;
	startLine: number | null;
	diffSide: string;
	resolvedBy: { login: string } | null;
	comments?: { nodes: GQLThreadComment[] };
}

interface GQLCommitNode {
	commit: {
		oid: string;
		message: string;
		author: { name: string; date: string } | null;
		committer: { name: string; date: string } | null;
	};
	resourcePath: string;
}

interface GQLTimelineItem {
	__typename: string;
	id: string;
	createdAt: string;
	actor?: { login: string; avatarUrl: string } | null;
	mergeRefName?: string;
}

interface GQLPRNode {
	number: number;
	title: string;
	body: string;
	state: string;
	isDraft: boolean;
	createdAt: string;
	mergedAt: string | null;
	mergeable: string;
	additions: number;
	deletions: number;
	changedFiles: number;
	author: GQLAuthor | null;
	headRefName: string;
	headRefOid: string;
	headRepository?: { owner: { login: string } } | null;
	baseRefName: string;
	baseRefOid: string;
	labels?: { nodes: GQLLabel[] };
	reactionGroups?: GQLReactionGroup[];
	comments?: { nodes: GQLIssueComment[] };
	reviews?: { nodes: GQLReview[] };
	reviewThreads?: { nodes: GQLReviewThread[] };
	commits?: { nodes: GQLCommitNode[] };
	timelineItems?: { nodes: GQLTimelineItem[] };
}

function transformGraphQLPRBundle(node: GQLPRNode): PRBundleData {
	const stateMap: Record<string, string> = {
		OPEN: "open",
		CLOSED: "closed",
		MERGED: "closed",
	};
	const mergeableMap: Record<string, boolean | null> = {
		MERGEABLE: true,
		CONFLICTING: false,
		UNKNOWN: null,
	};

	const pr = {
		number: node.number,
		title: node.title,
		body: node.body,
		state: stateMap[node.state] ?? "open",
		draft: node.isDraft ?? false,
		created_at: node.createdAt,
		merged_at: node.mergedAt ?? null,
		mergeable: mergeableMap[node.mergeable] ?? null,
		additions: node.additions ?? 0,
		deletions: node.deletions ?? 0,
		changed_files: node.changedFiles ?? 0,
		user: node.author
			? {
					login: node.author.login,
					avatar_url: node.author.avatarUrl,
					type: node.author.__typename,
				}
			: null,
		head: { ref: node.headRefName, sha: node.headRefOid },
		head_repo_owner: node.headRepository?.owner?.login ?? null,
		base: { ref: node.baseRefName, sha: node.baseRefOid },
		labels: (node.labels?.nodes ?? []).map((l) => ({
			name: l.name,
			color: l.color ?? null,
			description: l.description ?? null,
		})),
		reactions: mapReactionGroups(node.reactionGroups),
	};

	const issueComments = (node.comments?.nodes ?? []).map((c) => ({
		id: c.databaseId,
		body: c.body ?? "",
		created_at: c.createdAt,
		user: c.author
			? {
					login: c.author.login,
					avatar_url: c.author.avatarUrl,
					type: c.author.__typename,
				}
			: null,
		author_association: c.authorAssociation ?? "NONE",
		reactions: mapReactionGroups(c.reactionGroups),
	}));

	const reviewComments: PRBundleData["reviewComments"] = [];
	const reviews = (node.reviews?.nodes ?? []).map((r) => {
		const reviewId = r.databaseId;
		for (const rc of r.comments?.nodes ?? []) {
			reviewComments.push({
				id: rc.databaseId,
				body: rc.body ?? "",
				path: rc.path ?? "",
				line: rc.line ?? rc.originalLine ?? null,
				diff_hunk: rc.diffHunk ?? null,
				created_at: rc.createdAt,
				user: rc.author
					? {
							login: rc.author.login,
							avatar_url: rc.author.avatarUrl,
							type: rc.author.__typename,
						}
					: null,
				pull_request_review_id: reviewId,
				reactions: mapReactionGroups(rc.reactionGroups),
			});
		}
		return {
			id: reviewId,
			body: r.body || null,
			state: r.state,
			created_at: r.createdAt,
			submitted_at: r.submittedAt ?? null,
			user: r.author
				? {
						login: r.author.login,
						avatar_url: r.author.avatarUrl,
						type: r.author.__typename,
					}
				: null,
		};
	});

	const reviewThreads: ReviewThread[] = (node.reviewThreads?.nodes ?? []).map((thread) => ({
		id: thread.id,
		isResolved: thread.isResolved ?? false,
		isOutdated: thread.isOutdated ?? false,
		path: thread.path ?? "",
		line: thread.line ?? null,
		startLine: thread.startLine ?? null,
		diffSide: thread.diffSide ?? "RIGHT",
		resolvedBy: thread.resolvedBy ? { login: thread.resolvedBy.login } : null,
		comments: (thread.comments?.nodes ?? []).map((c) => ({
			id: c.id,
			databaseId: c.databaseId,
			body: c.body ?? "",
			createdAt: c.createdAt ?? "",
			author: c.author
				? { login: c.author.login, avatarUrl: c.author.avatarUrl }
				: null,
			reviewState: c.pullRequestReview?.state ?? null,
		})),
	}));

	const commits = (node.commits?.nodes ?? []).map((n) => {
		const c = n.commit;
		return {
			sha: c.oid,
			commit: {
				message: c.message,
				author: c.author
					? { name: c.author.name, date: c.author.date }
					: null,
				committer: c.committer
					? { name: c.committer.name, date: c.committer.date }
					: null,
			},
			author: null,
		};
	});
	type PRStateEvent = PRBundleData["stateEvents"][number]["event"];
	const typenameToEvent: Record<string, PRStateEvent> = {
		ClosedEvent: "closed",
		ReopenedEvent: "reopened",
		MergedEvent: "merged",
		ReadyForReviewEvent: "ready_for_review",
		ConvertToDraftEvent: "convert_to_draft",
	};
	const stateEvents: PRBundleData["stateEvents"] = (node.timelineItems?.nodes ?? [])
		.filter((n) => n && typenameToEvent[n.__typename])
		.map((n) => ({
			id: n.id,
			event: typenameToEvent[n.__typename],
			actor: n.actor
				? { login: n.actor.login, avatar_url: n.actor.avatarUrl }
				: null,
			created_at: n.createdAt,
			...(n.mergeRefName ? { merge_ref_name: n.mergeRefName } : {}),
		}));

	return { pr, issueComments, reviewComments, reviews, reviewThreads, commits, stateEvents };
}

async function fetchPRBundleFromGitHub(
	token: string,
	owner: string,
	repo: string,
	pullNumber: number,
): Promise<PRBundleData | null> {
	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: PR_BUNDLE_QUERY,
				variables: { owner, repo, number: pullNumber },
			}),
		});

		if (!response.ok) return null;
		const json = await response.json();
		const prNode = json.data?.repository?.pullRequest;
		if (!prNode) return null;

		return transformGraphQLPRBundle(prNode);
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return null;
	}
}

export async function getPullRequestBundle(
	owner: string,
	repo: string,
	pullNumber: number,
): Promise<PRBundleData | null> {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildPRBundleCacheKey(owner, repo, pullNumber),
		cacheType: "pr_bundle",
		fallback: null,
		jobType: "pr_bundle",
		jobPayload: { owner, repo, pullNumber },
		fetchRemote: () => fetchPRBundleFromGitHub(authCtx!.token, owner, repo, pullNumber),
	});
}

export async function getIssue(owner: string, repo: string, issueNumber: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildIssueCacheKey(owner, repo, issueNumber),
		cacheType: "issue",
		fallback: null,
		jobType: "issue",
		jobPayload: { owner, repo, issueNumber },
		fetchRemote: (octokit) => fetchIssueFromGitHub(octokit, owner, repo, issueNumber),
	});
}

export async function getIssueComments(owner: string, repo: string, issueNumber: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildIssueCommentsCacheKey(owner, repo, issueNumber),
		cacheType: "issue_comments",
		fallback: [],
		jobType: "issue_comments",
		jobPayload: { owner, repo, issueNumber },
		fetchRemote: (octokit) =>
			fetchIssueCommentsFromGitHub(octokit, owner, repo, issueNumber),
	});
}

export interface LinkedPullRequest {
	number: number;
	title: string;
	state: "open" | "closed";
	merged: boolean;
	user: { login: string; avatar_url: string } | null;
	html_url: string;
	repoOwner: string;
	repoName: string;
}

export interface CrossReference {
	number: number;
	title: string;
	state: "open" | "closed";
	/** Only set for PRs */
	merged: boolean;
	isPullRequest: boolean;
	user: { login: string; avatar_url: string } | null;
	html_url: string;
	repoOwner: string;
	repoName: string;
	created_at: string;
}

/**
 * Fetches all cross-references for an issue or PR.
 * Returns both linked PRs and linked issues from any repo.
 */
export async function getCrossReferences(
	owner: string,
	repo: string,
	issueNumber: number,
): Promise<CrossReference[]> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		const events = await octokit.paginate(octokit.issues.listEventsForTimeline, {
			owner,
			repo,
			issue_number: issueNumber,
			per_page: 100,
		});

		const seen = new Set<string>();
		const refs: CrossReference[] = [];

		for (const event of events) {
			if (event.event !== "cross-referenced") continue;
			const typedEvent = event as {
				created_at?: string;
				source?: {
					issue?: {
						pull_request?: {
							merged_at?: string | null;
						};
						repository?: { full_name?: string };
						number: number;
						title: string;
						state: string;
						user?: {
							login: string;
							avatar_url: string;
						} | null;
						html_url: string;
					};
				};
			};
			const source = typedEvent.source?.issue;
			if (!source) continue;

			const repoFullName = source.repository?.full_name;
			const key = repoFullName
				? `${repoFullName}#${source.number}`
				: `${source.number}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const [refOwner, refName] = repoFullName
				? repoFullName.split("/")
				: [owner, repo];

			refs.push({
				number: source.number,
				title: source.title,
				state: source.state as "open" | "closed",
				merged: !!source.pull_request?.merged_at,
				isPullRequest: !!source.pull_request,
				user: source.user
					? {
							login: source.user.login,
							avatar_url: source.user.avatar_url,
						}
					: null,
				html_url: source.html_url,
				repoOwner: refOwner,
				repoName: refName,
				created_at: typedEvent.created_at ?? "",
			});
		}

		return refs;
	} catch {
		return [];
	}
}

/** @deprecated Use getCrossReferences instead */
export async function getLinkedPullRequests(
	owner: string,
	repo: string,
	issueNumber: number,
): Promise<LinkedPullRequest[]> {
	const refs = await getCrossReferences(owner, repo, issueNumber);
	return refs
		.filter((r) => r.isPullRequest)
		.map((r) => ({
			number: r.number,
			title: r.title,
			state: r.state,
			merged: r.merged,
			user: r.user,
			html_url: r.html_url,
			repoOwner: r.repoOwner,
			repoName: r.repoName,
		}));
}

export async function getRepoIssues(
	owner: string,
	repo: string,
	state: "open" | "closed" | "all" = "open",
) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoIssuesCacheKey(owner, repo, state),
		cacheType: "repo_issues",
		fallback: [],
		jobType: "repo_issues",
		jobPayload: { owner, repo, state },
		fetchRemote: (octokit) => fetchRepoIssuesFromGitHub(octokit, owner, repo, state),
	});
}

// --- Combined issues page data via single GraphQL call ---

export interface RepoIssuesPageData {
	openIssues: RepoIssueNode[];
	closedIssues: RepoIssueNode[];
	openCount: number;
	closedCount: number;
}

export interface RepoIssueNode {
	id: number;
	number: number;
	title: string;
	state: string;
	state_reason?: string | null;
	updated_at: string;
	created_at: string;
	closed_at: string | null;
	comments: number;
	user: { login: string; avatar_url: string } | null;
	labels: Array<{ name?: string; color?: string | null }>;
	assignees: Array<{ login: string; avatar_url: string }>;
	milestone: { title: string } | null;
	reactions: { total_count: number; "+1": number };
	pull_request?: { url?: string; html_url?: string } | null;
}

// ── Discussion types ──

export interface DiscussionCategory {
	id: string;
	name: string;
	emoji: string;
	description: string;
	isAnswerable: boolean;
}

export interface RepoDiscussionNode {
	id: string;
	number: number;
	title: string;
	createdAt: string;
	updatedAt: string;
	author: { login: string; avatar_url: string } | null;
	category: { name: string; emoji: string; isAnswerable: boolean };
	commentsCount: number;
	upvoteCount: number;
	isAnswered: boolean;
	labels: Array<{ name?: string; color?: string | null }>;
	bodyText: string;
}

export interface RepoDiscussionsPageData {
	discussions: RepoDiscussionNode[];
	totalCount: number;
	categories: DiscussionCategory[];
	hasNextPage: boolean;
	endCursor: string | null;
	repositoryId: string;
}

export interface DiscussionReply {
	id: string;
	databaseId: number;
	body: string;
	bodyHtml?: string;
	createdAt: string;
	author: { login: string; avatar_url: string; type?: string } | null;
	upvoteCount: number;
	isAnswer: boolean;
}

export interface DiscussionComment {
	id: string;
	databaseId: number;
	body: string;
	bodyHtml?: string;
	createdAt: string;
	author: { login: string; avatar_url: string; type?: string } | null;
	upvoteCount: number;
	isAnswer: boolean;
	replies: DiscussionReply[];
}

export interface DiscussionDetail {
	id: string;
	number: number;
	title: string;
	body: string;
	createdAt: string;
	updatedAt: string;
	author: { login: string; avatar_url: string } | null;
	category: { name: string; emoji: string; isAnswerable: boolean };
	commentsCount: number;
	upvoteCount: number;
	isAnswered: boolean;
	answerChosenAt: string | null;
	labels: Array<{ name?: string; color?: string | null }>;
}

// ── Discussion GraphQL queries ──

const DISCUSSIONS_PAGE_GRAPHQL = `
	query($owner: String!, $repo: String!, $after: String) {
		repository(owner: $owner, name: $repo) {
			id
			discussions(first: 30, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
				totalCount
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					id
					number
					title
					createdAt
					updatedAt
					author { login avatarUrl }
					category { name emoji isAnswerable }
					comments { totalCount }
					upvoteCount
					isAnswered
					labels(first: 20) { nodes { name color } }
					bodyText
				}
			}
			discussionCategories(first: 25) {
				nodes {
					id
					name
					emoji
					description
					isAnswerable
				}
			}
		}
	}
`;

const DISCUSSION_DETAIL_GRAPHQL = `
	query($owner: String!, $repo: String!, $number: Int!) {
		repository(owner: $owner, name: $repo) {
			discussion(number: $number) {
				id
				number
				title
				body
				createdAt
				updatedAt
				author { __typename login avatarUrl }
				category { name emoji isAnswerable }
				comments(first: 50) {
					totalCount
					nodes {
						id
						databaseId
						body
						createdAt
						author { __typename login avatarUrl }
						upvoteCount
						isAnswer
						replies(first: 20) {
							nodes {
								id
								databaseId
								body
								createdAt
								author { __typename login avatarUrl }
								upvoteCount
								isAnswer
							}
						}
					}
				}
				upvoteCount
				isAnswered
				answerChosenAt
				labels(first: 20) { nodes { name color } }
			}
		}
	}
`;

const ADD_DISCUSSION_COMMENT_MUTATION = `
	mutation($discussionId: ID!, $body: String!, $replyToId: ID) {
		addDiscussionComment(input: { discussionId: $discussionId, body: $body, replyToId: $replyToId }) {
			comment {
				id
				databaseId
				body
				createdAt
				author { login avatarUrl }
			}
		}
	}
`;

// ── Discussion GraphQL types ──

interface GQLDiscussionNode {
	id: string;
	number: number;
	title: string;
	createdAt: string;
	updatedAt: string;
	author: { login: string; avatarUrl: string } | null;
	category: { name: string; emoji: string; isAnswerable: boolean };
	comments?: { totalCount: number };
	upvoteCount: number;
	isAnswered: boolean;
	labels?: { nodes: { name: string; color: string }[] };
	bodyText: string;
}

interface GQLDiscussionCommentNode {
	id: string;
	databaseId: number;
	body: string;
	createdAt: string;
	author: { login: string; avatarUrl: string; __typename?: string } | null;
	upvoteCount: number;
	isAnswer: boolean;
	replies?: {
		nodes: {
			id: string;
			databaseId: number;
			body: string;
			createdAt: string;
			author: { login: string; avatarUrl: string; __typename?: string } | null;
			upvoteCount: number;
			isAnswer: boolean;
		}[];
	};
}

function mapGQLAuthor(author: { login: string; avatarUrl: string; __typename?: string } | null) {
	return author
		? {
				login: author.login,
				avatar_url: author.avatarUrl,
				type: author.__typename === "Bot" ? "Bot" : "User",
			}
		: null;
}

function mapGQLDiscussionNode(node: GQLDiscussionNode): RepoDiscussionNode {
	return {
		id: node.id,
		number: node.number,
		title: node.title,
		createdAt: node.createdAt,
		updatedAt: node.updatedAt,
		author: mapGQLAuthor(node.author),
		category: node.category,
		commentsCount: node.comments?.totalCount ?? 0,
		upvoteCount: node.upvoteCount,
		isAnswered: node.isAnswered,
		labels: (node.labels?.nodes ?? []).map((l) => ({ name: l.name, color: l.color })),
		bodyText: node.bodyText,
	};
}

function mapGQLDiscussionComment(node: GQLDiscussionCommentNode): DiscussionComment {
	return {
		id: node.id,
		databaseId: node.databaseId,
		body: node.body,
		createdAt: node.createdAt,
		author: mapGQLAuthor(node.author),
		upvoteCount: node.upvoteCount,
		isAnswer: node.isAnswer,
		replies: (node.replies?.nodes ?? []).map((r) => ({
			id: r.id,
			databaseId: r.databaseId,
			body: r.body,
			createdAt: r.createdAt,
			author: mapGQLAuthor(r.author),
			upvoteCount: r.upvoteCount,
			isAnswer: r.isAnswer,
		})),
	};
}

// ── Discussion fetchers ──

async function fetchRepoDiscussionsPageGraphQL(
	token: string,
	owner: string,
	repo: string,
	after?: string | null,
): Promise<RepoDiscussionsPageData> {
	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: DISCUSSIONS_PAGE_GRAPHQL,
			variables: { owner, repo, after: after ?? null },
		}),
	});

	if (!response.ok) {
		throw new Error(`GraphQL request failed: ${response.status}`);
	}
	const json = await response.json();
	const r = json.data?.repository;
	if (!r) {
		return {
			discussions: [],
			totalCount: 0,
			categories: [],
			hasNextPage: false,
			endCursor: null,
			repositoryId: "",
		};
	}

	return {
		discussions: (r.discussions?.nodes ?? []).map(mapGQLDiscussionNode),
		totalCount: r.discussions?.totalCount ?? 0,
		categories: (r.discussionCategories?.nodes ?? []).map(
			(c: {
				id: string;
				name: string;
				emoji: string;
				description: string;
				isAnswerable: boolean;
			}) => ({
				id: c.id,
				name: c.name,
				emoji: c.emoji,
				description: c.description,
				isAnswerable: c.isAnswerable,
			}),
		),
		hasNextPage: r.discussions?.pageInfo?.hasNextPage ?? false,
		endCursor: r.discussions?.pageInfo?.endCursor ?? null,
		repositoryId: r.id ?? "",
	};
}

async function fetchDiscussionDetailGraphQL(
	token: string,
	owner: string,
	repo: string,
	number: number,
): Promise<{ detail: DiscussionDetail; comments: DiscussionComment[] } | null> {
	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: DISCUSSION_DETAIL_GRAPHQL,
			variables: { owner, repo, number },
		}),
	});

	if (!response.ok) {
		throw new Error(`GraphQL request failed: ${response.status}`);
	}
	const json = await response.json();
	const d = json.data?.repository?.discussion;
	if (!d) return null;

	const detail: DiscussionDetail = {
		id: d.id,
		number: d.number,
		title: d.title,
		body: d.body ?? "",
		createdAt: d.createdAt,
		updatedAt: d.updatedAt,
		author: mapGQLAuthor(d.author),
		category: d.category,
		commentsCount: d.comments?.totalCount ?? 0,
		upvoteCount: d.upvoteCount,
		isAnswered: d.isAnswered,
		answerChosenAt: d.answerChosenAt ?? null,
		labels: (d.labels?.nodes ?? []).map((l: { name: string; color: string }) => ({
			name: l.name,
			color: l.color,
		})),
	};

	const comments: DiscussionComment[] = (d.comments?.nodes ?? []).map(
		mapGQLDiscussionComment,
	);

	return { detail, comments };
}

// ── Discussion exported functions ──

function buildRepoDiscussionsCacheKey(owner: string, repo: string): string {
	return `repo_discussions:${normalizeRepoKey(owner, repo)}`;
}

export async function getRepoDiscussionsPage(
	owner: string,
	repo: string,
): Promise<RepoDiscussionsPageData> {
	const authCtx = await getGitHubAuthContext();
	const fallback: RepoDiscussionsPageData = {
		discussions: [],
		totalCount: 0,
		categories: [],
		hasNextPage: false,
		endCursor: null,
		repositoryId: "",
	};
	const data = await readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoDiscussionsCacheKey(owner, repo),
		cacheType: "repo_discussions",
		fallback,
		jobType: "repo_discussions" as GitDataSyncJobType,
		jobPayload: { owner, repo },
		fetchRemote: async () => {
			if (!authCtx) return fallback;
			return fetchRepoDiscussionsPageGraphQL(authCtx.token, owner, repo);
		},
	});
	// Old cached entries may lack pagination fields
	return {
		...data,
		hasNextPage: data.hasNextPage ?? false,
		endCursor: data.endCursor ?? null,
		repositoryId: data.repositoryId ?? "",
	};
}

export async function fetchMoreDiscussions(
	owner: string,
	repo: string,
	cursor: string,
): Promise<{ discussions: RepoDiscussionNode[]; hasNextPage: boolean; endCursor: string | null }> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return { discussions: [], hasNextPage: false, endCursor: null };
	const data = await fetchRepoDiscussionsPageGraphQL(authCtx.token, owner, repo, cursor);
	return {
		discussions: data.discussions,
		hasNextPage: data.hasNextPage,
		endCursor: data.endCursor,
	};
}

export async function getDiscussion(
	owner: string,
	repo: string,
	number: number,
): Promise<DiscussionDetail | null> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return null;
	const result = await fetchDiscussionDetailGraphQL(authCtx.token, owner, repo, number);
	return result?.detail ?? null;
}

export async function getDiscussionComments(
	owner: string,
	repo: string,
	number: number,
): Promise<DiscussionComment[]> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return [];
	const result = await fetchDiscussionDetailGraphQL(authCtx.token, owner, repo, number);
	return result?.comments ?? [];
}

export async function addDiscussionCommentViaGraphQL(
	discussionId: string,
	body: string,
	replyToId?: string,
): Promise<{ id: string; databaseId: number } | null> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return null;

	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${authCtx.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: ADD_DISCUSSION_COMMENT_MUTATION,
			variables: { discussionId, body, replyToId: replyToId ?? null },
		}),
	});

	if (!response.ok) {
		throw new Error(`GraphQL mutation failed: ${response.status}`);
	}
	const json = await response.json();
	if (json.errors?.length) {
		throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
	}
	const comment = json.data?.addDiscussionComment?.comment;
	return comment ? { id: comment.id, databaseId: comment.databaseId } : null;
}

const CREATE_DISCUSSION_MUTATION = `
	mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
		createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) {
			discussion { id number title }
		}
	}
`;

export async function createDiscussionViaGraphQL(
	repositoryId: string,
	categoryId: string,
	title: string,
	body: string,
): Promise<{ id: string; number: number; title: string } | null> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return null;

	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${authCtx.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: CREATE_DISCUSSION_MUTATION,
			variables: { repositoryId, categoryId, title, body },
		}),
	});

	if (!response.ok) {
		throw new Error(`GraphQL mutation failed: ${response.status}`);
	}
	const json = await response.json();
	if (json.errors?.length) {
		throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
	}
	const discussion = json.data?.createDiscussion?.discussion;
	return discussion
		? { id: discussion.id, number: discussion.number, title: discussion.title }
		: null;
}

export async function invalidateRepoDiscussionsCache(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return;
	const prefix = buildRepoDiscussionsCacheKey(owner, repo);
	await deleteGithubCacheByPrefix(authCtx.userId, prefix);
}

const ISSUES_PAGE_GRAPHQL = `
	query($owner: String!, $repo: String!) {
		repository(owner: $owner, name: $repo) {
			openIssues: issues(states: [OPEN], first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
				totalCount
				nodes {
					databaseId
					number
					title
					state
					stateReason
					updatedAt
					createdAt
					closedAt
					author { login avatarUrl }
					labels(first: 20) { nodes { name color } }
					assignees(first: 10) { nodes { login avatarUrl } }
					milestone { title }
					comments { totalCount }
					reactions { totalCount }
					thumbsUp: reactions(content: THUMBS_UP) { totalCount }
					timelineItems(first: 10, itemTypes: [CROSS_REFERENCED_EVENT]) {
						nodes {
							... on CrossReferencedEvent {
								source {
									... on PullRequest { number url }
								}
							}
						}
					}
				}
			}
			closedIssues: issues(states: [CLOSED], first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
				totalCount
				nodes {
					databaseId
					number
					title
					state
					stateReason
					updatedAt
					createdAt
					closedAt
					author { login avatarUrl }
					labels(first: 20) { nodes { name color } }
					assignees(first: 10) { nodes { login avatarUrl } }
					milestone { title }
					comments { totalCount }
					reactions { totalCount }
					thumbsUp: reactions(content: THUMBS_UP) { totalCount }
					timelineItems(first: 10, itemTypes: [CROSS_REFERENCED_EVENT]) {
						nodes {
							... on CrossReferencedEvent {
								source {
									... on PullRequest { number url }
								}
							}
						}
					}
				}
			}
		}
	}
`;

// ── GraphQL Issue node types ──

interface GQLIssueNode {
	databaseId: number;
	number: number;
	title: string;
	state: string;
	stateReason: string | null;
	updatedAt: string;
	createdAt: string;
	closedAt: string | null;
	author: { login: string; avatarUrl: string } | null;
	comments?: { totalCount: number };
	labels?: { nodes: { name: string; color: string }[] };
	assignees?: { nodes: { login: string; avatarUrl: string }[] };
	milestone?: { title: string } | null;
	reactions?: { totalCount: number };
	thumbsUp?: { totalCount: number };
	timelineItems?: {
		nodes: Array<{
			source?: { number?: number; url?: string };
		}>;
	};
}

function mapGraphQLIssueNode(node: GQLIssueNode): RepoIssueNode {
	const author = node.author;
	const stateReasonMap: Record<string, string> = {
		COMPLETED: "completed",
		NOT_PLANNED: "not_planned",
		REOPENED: "reopened",
	};
	return {
		id: node.databaseId,
		number: node.number,
		title: node.title,
		state: node.state.toLowerCase(),
		state_reason: node.stateReason ? (stateReasonMap[node.stateReason] ?? null) : null,
		updated_at: node.updatedAt,
		created_at: node.createdAt,
		closed_at: node.closedAt ?? null,
		comments: node.comments?.totalCount ?? 0,
		user: author ? { login: author.login, avatar_url: author.avatarUrl } : null,
		labels: (node.labels?.nodes ?? []).map((l) => ({
			name: l.name,
			color: l.color,
		})),
		assignees: (node.assignees?.nodes ?? []).map((a) => ({
			login: a.login,
			avatar_url: a.avatarUrl,
		})),
		milestone: node.milestone ? { title: node.milestone.title } : null,
		reactions: {
			total_count: node.reactions?.totalCount ?? 0,
			"+1": node.thumbsUp?.totalCount ?? 0,
		},
		pull_request: (() => {
			const pr = node.timelineItems?.nodes?.find((n) => n.source?.number);
			if (!pr?.source?.url) return null;
			return { url: pr.source.url, html_url: pr.source.url };
		})(),
	};
}

async function fetchRepoIssuesPageGraphQL(
	token: string,
	owner: string,
	repo: string,
): Promise<RepoIssuesPageData> {
	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			query: ISSUES_PAGE_GRAPHQL,
			variables: { owner, repo },
		}),
	});

	if (!response.ok) {
		throw new Error(`GraphQL request failed: ${response.status}`);
	}
	const json = await response.json();
	const r = json.data?.repository;
	if (!r) {
		return { openIssues: [], closedIssues: [], openCount: 0, closedCount: 0 };
	}

	return {
		openIssues: (r.openIssues?.nodes ?? []).map(mapGraphQLIssueNode),
		closedIssues: (r.closedIssues?.nodes ?? []).map(mapGraphQLIssueNode),
		openCount: r.openIssues?.totalCount ?? 0,
		closedCount: r.closedIssues?.totalCount ?? 0,
	};
}

function buildRepoIssuesPageCacheKey(owner: string, repo: string): string {
	return `repo_issues_page:${normalizeRepoKey(owner, repo)}`;
}

export async function getRepoIssuesPage(owner: string, repo: string): Promise<RepoIssuesPageData> {
	const authCtx = await getGitHubAuthContext();
	const fallback: RepoIssuesPageData = {
		openIssues: [],
		closedIssues: [],
		openCount: 0,
		closedCount: 0,
	};
	const data = await readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoIssuesPageCacheKey(owner, repo),
		cacheType: "repo_issues_page",
		fallback,
		jobType: "repo_issues",
		jobPayload: { owner, repo, state: "all" },
		fetchRemote: async () => {
			if (!authCtx) return fallback;
			return fetchRepoIssuesPageGraphQL(authCtx.token, owner, repo);
		},
	});

	if (authCtx) {
		const { updateCachedRepoPageDataNavCounts } = await import("@/lib/repo-data-cache");
		updateCachedRepoPageDataNavCounts(authCtx.userId, owner, repo, {
			openIssues: data.openCount,
		}).catch(() => {});
	}

	return data;
}

export async function invalidateRepoPullRequestsCache(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return;
	const prefix = `repo_pull_requests:${normalizeRepoKey(owner, repo)}`;
	await deleteGithubCacheByPrefix(authCtx.userId, prefix);
}

export async function invalidateAllPRBundlesForRepo(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return;
	const key = normalizeRepoKey(owner, repo);
	await deleteGithubCacheByPrefix(authCtx.userId, `pr_bundle:${key}`);
	await deleteGithubCacheByPrefix(authCtx.userId, `pull_request:${key}`);
	await deleteSharedCacheByPrefix(`pr_bundle:${key}`);
}

export async function invalidatePullRequestCache(owner: string, repo: string, pullNumber: number) {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return;
	// Invalidate the PR detail + list caches
	const key = normalizeRepoKey(owner, repo);
	await deleteGithubCacheByPrefix(authCtx.userId, `pr_bundle:${key}:${pullNumber}`);
	await deleteGithubCacheByPrefix(authCtx.userId, `pull_request:${key}:${pullNumber}`);
	await deleteGithubCacheByPrefix(
		authCtx.userId,
		`pull_request_comments:${key}:${pullNumber}`,
	);
	await deleteGithubCacheByPrefix(
		authCtx.userId,
		`pull_request_reviews:${key}:${pullNumber}`,
	);
	await deleteGithubCacheByPrefix(
		authCtx.userId,
		`pull_request_commits:${key}:${pullNumber}`,
	);
	await deleteGithubCacheByPrefix(authCtx.userId, `pull_request_files:${key}:${pullNumber}`);
	await deleteGithubCacheByPrefix(authCtx.userId, `repo_pull_requests:${key}`);
	// Also invalidate nav counts and search counts so PR count updates immediately
	const navCountsKey = buildRepoNavCountsCacheKey(owner, repo);
	await deleteGithubCacheByPrefix(authCtx.userId, navCountsKey);
	await deleteGithubCacheByPrefix(
		authCtx.userId,
		`search_issues:${keyPart(`is:pr is:open repo:${owner}/${repo}`)}`,
	);
	await deleteGithubCacheByPrefix(
		authCtx.userId,
		`search_issues:${keyPart(`is:pr is:closed repo:${owner}/${repo}`)}`,
	);
	// Also invalidate the shared cache so all users see the updated state
	await deleteSharedCacheByPrefix(`pr_bundle:${key}:${pullNumber}`);
	await deleteSharedCacheByPrefix(navCountsKey);
}

export async function invalidateFileContentCache(
	owner: string,
	repo: string,
	path: string,
	ref?: string,
) {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return;
	const key = buildFileContentCacheKey(owner, repo, path, ref);
	await deleteGithubCacheByPrefix(authCtx.userId, key);
}

export async function invalidateRepoIssuesCache(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return;
	const prefix = `repo_issues:${normalizeRepoKey(owner, repo)}`;
	await deleteGithubCacheByPrefix(authCtx.userId, prefix);
	// Also invalidate nav counts so issue count updates immediately
	const navCountsKey = buildRepoNavCountsCacheKey(owner, repo);
	await deleteGithubCacheByPrefix(authCtx.userId, navCountsKey);
	await deleteSharedCacheByPrefix(navCountsKey);
}

export async function invalidateIssueCache(owner: string, repo: string, issueNumber: number) {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return;
	const key = normalizeRepoKey(owner, repo);
	await deleteGithubCacheByPrefix(authCtx.userId, `issue:${key}:${issueNumber}`);
	await deleteGithubCacheByPrefix(authCtx.userId, `issue_comments:${key}:${issueNumber}`);
	await deleteGithubCacheByPrefix(authCtx.userId, `repo_issues:${key}`);
	// Also invalidate nav counts so issue count updates immediately
	const navCountsKey = buildRepoNavCountsCacheKey(owner, repo);
	await deleteGithubCacheByPrefix(authCtx.userId, navCountsKey);
	await deleteSharedCacheByPrefix(navCountsKey);
}

export async function getRepoPullRequests(
	owner: string,
	repo: string,
	state: "open" | "closed" | "all" = "open",
) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoPullRequestsCacheKey(owner, repo, state),
		cacheType: "repo_pull_requests",
		fallback: [],
		jobType: "repo_pull_requests",
		jobPayload: { owner, repo, state },
		fetchRemote: (octokit) =>
			fetchRepoPullRequestsFromGitHub(octokit, owner, repo, state),
	});
}

export async function enrichPRsWithStats(owner: string, repo: string, prs: { number: number }[]) {
	if (prs.length === 0)
		return new Map<
			number,
			{ additions: number; deletions: number; changed_files: number }
		>();

	const token = await getGitHubToken();
	if (!token)
		return new Map<
			number,
			{ additions: number; deletions: number; changed_files: number }
		>();

	const prFragments = prs.map(
		(pr, i) =>
			`pr${i}: pullRequest(number: ${pr.number}) { number additions deletions changedFiles }`,
	);

	const query = `query { repository(owner: "${owner}", name: "${repo}") { ${prFragments.join(" ")} } }`;

	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query }),
		});

		if (!response.ok)
			return new Map<
				number,
				{ additions: number; deletions: number; changed_files: number }
			>();

		const json = await response.json();
		const repoData = json.data?.repository;
		if (!repoData)
			return new Map<
				number,
				{ additions: number; deletions: number; changed_files: number }
			>();

		const map = new Map<
			number,
			{ additions: number; deletions: number; changed_files: number }
		>();
		for (let i = 0; i < prs.length; i++) {
			const pr = repoData[`pr${i}`];
			if (pr) {
				map.set(pr.number, {
					additions: pr.additions,
					deletions: pr.deletions,
					changed_files: pr.changedFiles,
				});
			}
		}
		return map;
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return new Map<
			number,
			{ additions: number; deletions: number; changed_files: number }
		>();
	}
}

const PR_LIST_GRAPHQL_STATES = {
	open: "OPEN",
	closed: "CLOSED",
	merged: "MERGED",
} as const;

const PR_NODE_FRAGMENT = `
	id: databaseId
	number
	title
	state
	isDraft
	updatedAt
	createdAt
	comments { totalCount }
	reviewThreads { totalCount }
	author { login avatarUrl }
	labels(first: 10) { nodes { name color } }
	mergedAt
	headRefName
	headRefOid
	baseRefName
	reviewRequests(first: 10) {
		nodes { requestedReviewer { ... on User { login avatarUrl } } }
	}
	assignees(first: 10) { nodes { login avatarUrl } }
	additions
	deletions
	changedFiles
`;

function mapGraphQLPRNode(pr: Record<string, unknown>) {
	const author = pr.author as { login: string; avatarUrl: string } | null;
	const labels = (
		(pr.labels as { nodes: { name: string; color: string }[] })?.nodes ?? []
	).map((l) => ({ name: l.name, color: l.color?.replace("#", "") }));
	const reviewRequests = (
		(
			pr.reviewRequests as {
				nodes: {
					requestedReviewer: {
						login: string;
						avatarUrl: string;
					} | null;
				}[];
			}
		)?.nodes ?? []
	)
		.filter((r) => r.requestedReviewer)
		.map((r) => ({
			login: r.requestedReviewer!.login,
			avatar_url: r.requestedReviewer!.avatarUrl,
		}));
	const assignees = (
		(pr.assignees as { nodes: { login: string; avatarUrl: string }[] })?.nodes ?? []
	).map((a) => ({ login: a.login, avatar_url: a.avatarUrl }));

	const gqlState = pr.state as string;

	return {
		id: pr.id as number,
		number: pr.number as number,
		title: pr.title as string,
		state: gqlState === "MERGED" ? "closed" : gqlState.toLowerCase(),
		draft: pr.isDraft as boolean,
		updated_at: pr.updatedAt as string,
		created_at: pr.createdAt as string,
		comments: (pr.comments as { totalCount: number })?.totalCount ?? 0,
		review_comments: (pr.reviewThreads as { totalCount: number })?.totalCount ?? 0,
		user: author ? { login: author.login, avatar_url: author.avatarUrl } : null,
		labels,
		merged_at: (pr.mergedAt as string) ?? null,
		head: { ref: pr.headRefName as string, sha: pr.headRefOid as string },
		base: { ref: pr.baseRefName as string },
		requested_reviewers: reviewRequests,
		assignees,
		additions: pr.additions as number,
		deletions: pr.deletions as number,
		changed_files: pr.changedFiles as number,
	};
}

const EMPTY_COUNTS = { open: 0, merged: 0, closed: 0 };

export interface PRPageResult {
	prs: ReturnType<typeof mapGraphQLPRNode>[];
	pageInfo: { hasNextPage: boolean; endCursor: string | null };
	counts: { open: number; merged: number; closed: number };
	mergedPreview: ReturnType<typeof mapGraphQLPRNode>[];
	closedPreview: ReturnType<typeof mapGraphQLPRNode>[];
}

const EMPTY_PAGE_RESULT: PRPageResult = {
	prs: [],
	pageInfo: { hasNextPage: false, endCursor: null },
	counts: EMPTY_COUNTS,
	mergedPreview: [],
	closedPreview: [],
};

export async function getRepoPullRequestsWithStats(
	owner: string,
	repo: string,
	state: "open" | "closed" | "all" = "open",
	opts?: {
		includeCounts?: boolean;
		previewClosed?: number;
		perPage?: number;
		cursor?: string | null;
	},
): Promise<PRPageResult> {
	const token = await getGitHubToken();
	if (!token) return EMPTY_PAGE_RESULT;

	const states =
		state === "all"
			? ["OPEN", "CLOSED", "MERGED"]
			: state === "closed"
				? ["CLOSED", "MERGED"]
				: [PR_LIST_GRAPHQL_STATES[state] ?? "OPEN"];
	const statesArg = `[${states.join(", ")}]`;
	const limit = opts?.perPage ?? 20;

	const previewCount = opts?.previewClosed ?? 0;
	const wantCounts = !!opts?.includeCounts;

	const countFields = wantCounts
		? `
			openCount: pullRequests(states: [OPEN]) { totalCount }
			mergedCount: pullRequests(states: [MERGED]) { totalCount }
			closedCount: pullRequests(states: [CLOSED]) { totalCount }
		`
		: "";

	const previewFields =
		previewCount > 0
			? `
			mergedPreview: pullRequests(first: ${previewCount}, states: [MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) {
				nodes { ${PR_NODE_FRAGMENT} }
			}
			closedPreview: pullRequests(first: ${previewCount}, states: [CLOSED], orderBy: { field: UPDATED_AT, direction: DESC }) {
				nodes { ${PR_NODE_FRAGMENT} }
			}
		`
			: "";

	const afterArg = opts?.cursor ? `, after: "${opts.cursor}"` : "";

	const query = `query($owner: String!, $name: String!) {
		repository(owner: $owner, name: $name) {
			${countFields}
			${previewFields}
			pullRequests(first: ${limit}, states: ${statesArg}, orderBy: { field: UPDATED_AT, direction: DESC }${afterArg}) {
				pageInfo { hasNextPage endCursor }
				nodes { ${PR_NODE_FRAGMENT} }
			}
		}
	}`;

	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables: { owner, name: repo } }),
		});

		if (!response.ok) return EMPTY_PAGE_RESULT;
		const json = await response.json();
		const repo_data = json.data?.repository;
		const prConnection = repo_data?.pullRequests;
		const nodes = prConnection?.nodes;
		if (!nodes) return EMPTY_PAGE_RESULT;

		const counts = wantCounts
			? {
					open: repo_data.openCount?.totalCount ?? 0,
					merged: repo_data.mergedCount?.totalCount ?? 0,
					closed: repo_data.closedCount?.totalCount ?? 0,
				}
			: EMPTY_COUNTS;

		const pageInfo = {
			hasNextPage: prConnection.pageInfo?.hasNextPage ?? false,
			endCursor: prConnection.pageInfo?.endCursor ?? null,
		};

		const prs = (nodes as Record<string, unknown>[]).map(mapGraphQLPRNode);

		const mergedPreview =
			previewCount > 0
				? (
						(repo_data.mergedPreview?.nodes ?? []) as Record<
							string,
							unknown
						>[]
					).map(mapGraphQLPRNode)
				: [];
		const closedPreview =
			previewCount > 0
				? (
						(repo_data.closedPreview?.nodes ?? []) as Record<
							string,
							unknown
						>[]
					).map(mapGraphQLPRNode)
				: [];

		if (wantCounts) {
			getGitHubAuthContext().then(async (authCtx) => {
				if (!authCtx) return;
				const { updateCachedRepoPageDataNavCounts } =
					await import("@/lib/repo-data-cache");
				updateCachedRepoPageDataNavCounts(authCtx.userId, owner, repo, {
					openPrs: counts.open,
				}).catch(() => {});
			});
		}

		return { prs, pageInfo, counts, mergedPreview, closedPreview };
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return EMPTY_PAGE_RESULT;
	}
}

export interface CheckRun {
	name: string;
	state: "success" | "failure" | "pending" | "error" | "neutral" | "skipped";
	url: string | null;
	runId: number | null;
}

export interface CheckStatus {
	state: "pending" | "success" | "failure" | "error";
	total: number;
	success: number;
	failure: number;
	pending: number;
	checks: CheckRun[];
}

function normalizeCheckConclusion(status: string, conclusion: string | null): CheckRun["state"] {
	if (status === "completed") {
		if (conclusion === "success") return "success";
		if (
			conclusion === "failure" ||
			conclusion === "timed_out" ||
			conclusion === "cancelled"
		)
			return "failure";
		if (conclusion === "skipped") return "skipped";
		if (conclusion === "neutral") return "neutral";
		if (conclusion === "action_required" || conclusion === "stale") return "pending";
		return "failure";
	}
	return "pending";
}

async function fetchCheckStatusForRef(
	octokit: Awaited<ReturnType<typeof getOctokit>>,
	owner: string,
	repo: string,
	ref: string,
): Promise<CheckStatus | null> {
	if (!octokit) return null;

	let commitStatuses: Awaited<
		ReturnType<typeof octokit.repos.getCombinedStatusForRef>
	> | null = null;
	let checkRuns: Awaited<ReturnType<typeof octokit.checks.listForRef>> | null = null;

	try {
		commitStatuses = await octokit.repos.getCombinedStatusForRef({ owner, repo, ref });
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		// Token may lack repo status permissions
	}

	try {
		checkRuns = await octokit.checks.listForRef({ owner, repo, ref, per_page: 100 });
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		// Token may lack checks permission (403 for some repos)
	}

	const checks: CheckRun[] = [];

	if (commitStatuses?.data.statuses) {
		for (const s of commitStatuses.data.statuses) {
			checks.push({
				name: s.context,
				state:
					s.state === "success"
						? "success"
						: s.state === "pending"
							? "pending"
							: "failure",
				url: s.target_url || null,
				runId: null,
			});
		}
	}

	if (checkRuns?.data.check_runs) {
		for (const cr of checkRuns.data.check_runs) {
			const runIdMatch = cr.html_url?.match(/\/actions\/runs\/(\d+)/);
			checks.push({
				name: cr.name,
				state: normalizeCheckConclusion(cr.status, cr.conclusion),
				url: cr.html_url || (cr.details_url as string | null) || null,
				runId: runIdMatch ? Number(runIdMatch[1]) : null,
			});
		}
	}

	if (checks.length === 0) return null;

	const success = checks.filter(
		(c) => c.state === "success" || c.state === "neutral" || c.state === "skipped",
	).length;
	const failure = checks.filter((c) => c.state === "failure" || c.state === "error").length;
	const pending = checks.filter((c) => c.state === "pending").length;

	const state: CheckStatus["state"] =
		failure > 0 ? "failure" : pending > 0 ? "pending" : "success";

	return { state, total: checks.length, success, failure, pending, checks };
}

export async function enrichPRsWithCheckStatus(
	owner: string,
	repo: string,
	prs: { number: number; head: { sha: string } }[],
): Promise<Map<number, CheckStatus>> {
	const octokit = await getOctokit();
	if (!octokit) return new Map();

	const results = await Promise.allSettled(
		prs.map((pr) =>
			fetchCheckStatusForRef(octokit, owner, repo, pr.head.sha).then((cs) => ({
				number: pr.number,
				checkStatus: cs,
			})),
		),
	);

	const map = new Map<number, CheckStatus>();
	for (const result of results) {
		if (result.status === "fulfilled" && result.value.checkStatus) {
			map.set(result.value.number, result.value.checkStatus);
		}
	}
	return map;
}

export { fetchCheckStatusForRef };

const CHECK_STATUS_REDIS_TTL = 300; // 5 minutes

function checkStatusRedisKey(owner: string, repo: string) {
	return `check_statuses:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export async function batchFetchCheckStatuses(
	owner: string,
	repo: string,
	prs: { number: number }[],
): Promise<Record<number, CheckStatus>> {
	if (prs.length === 0) return {};

	const rKey = checkStatusRedisKey(owner, repo);
	try {
		const cached = await redis.get<Record<number, CheckStatus>>(rKey);
		if (cached && typeof cached === "object") {
			if (prs.every((p) => p.number in cached)) return cached;
		}
	} catch {
		// Redis miss — continue to fetch
	}

	const token = await getGitHubToken();
	if (!token) return {};

	const fragments = prs.map(
		(pr, i) => `pr${i}: pullRequest(number: ${pr.number}) {
			number
			commits(last: 1) {
				nodes {
					commit {
						statusCheckRollup {
							state
							contexts(first: 100) {
								nodes {
									__typename
									... on CheckRun {
										name
										status
										conclusion
										detailsUrl
										databaseId
									}
									... on StatusContext {
										context
										state
										targetUrl
									}
								}
							}
						}
					}
				}
			}
		}`,
	);

	const query = `query($owner: String!, $name: String!) {
		repository(owner: $owner, name: $name) { ${fragments.join("\n")} }
	}`;

	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables: { owner, name: repo } }),
		});

		if (!response.ok) return {};
		const json = await response.json();
		const repoData = json.data?.repository;
		if (!repoData) return {};

		const result: Record<number, CheckStatus> = {};
		for (let i = 0; i < prs.length; i++) {
			const prData = repoData[`pr${i}`];
			if (!prData) continue;
			const commit = prData.commits?.nodes?.[0]?.commit;
			const rollup = commit?.statusCheckRollup;
			if (!rollup) continue;

			const contexts = rollup.contexts?.nodes ?? [];
			const checks: CheckRun[] = [];

			for (const ctx of contexts) {
				if (ctx.__typename === "CheckRun") {
					const runIdMatch =
						ctx.detailsUrl?.match(/\/actions\/runs\/(\d+)/);
					checks.push({
						name: ctx.name,
						state: normalizeCheckConclusion(
							ctx.status?.toLowerCase() ?? "",
							ctx.conclusion?.toLowerCase() ?? null,
						),
						url: ctx.detailsUrl || null,
						runId: runIdMatch
							? Number(runIdMatch[1])
							: ctx.databaseId
								? null
								: null,
					});
				} else if (ctx.__typename === "StatusContext") {
					const stateStr = (ctx.state ?? "").toUpperCase();
					checks.push({
						name: ctx.context,
						state:
							stateStr === "SUCCESS"
								? "success"
								: stateStr === "PENDING" ||
									  stateStr === "EXPECTED"
									? "pending"
									: "failure",
						url: ctx.targetUrl || null,
						runId: null,
					});
				}
			}

			if (checks.length === 0) continue;

			const success = checks.filter(
				(c) =>
					c.state === "success" ||
					c.state === "neutral" ||
					c.state === "skipped",
			).length;
			const failure = checks.filter(
				(c) => c.state === "failure" || c.state === "error",
			).length;
			const pending = checks.filter((c) => c.state === "pending").length;
			const state: CheckStatus["state"] =
				failure > 0 ? "failure" : pending > 0 ? "pending" : "success";

			result[prData.number] = {
				state,
				total: checks.length,
				success,
				failure,
				pending,
				checks,
			};
		}

		if (Object.keys(result).length > 0) {
			redis.set(rKey, result, { ex: CHECK_STATUS_REDIS_TTL }).catch(() => {});
		}

		return result;
	} catch {
		return {};
	}
}

export async function getCachedCheckStatus(
	owner: string,
	repo: string,
	prNumber: number,
): Promise<CheckStatus | null> {
	try {
		const cached = await redis.get<Record<number, CheckStatus>>(
			checkStatusRedisKey(owner, repo),
		);
		if (cached && typeof cached === "object" && prNumber in cached) {
			return cached[prNumber];
		}
	} catch {
		// Cache miss
	}
	return null;
}

export async function prefetchPRData(
	owner: string,
	repo: string,
	opts?: { prefetchIssues?: boolean },
) {
	try {
		const rKey = checkStatusRedisKey(owner, repo);
		const cached = await redis.get(rKey);
		const prPrefetch = cached
			? Promise.resolve()
			: getRepoPullRequestsWithStats(owner, repo, "open").then(({ prs }) =>
					prs.length > 0
						? batchFetchCheckStatuses(
								owner,
								repo,
								prs.map((pr) => ({
									number: pr.number,
								})),
							).then(() => {})
						: undefined,
				);

		const issuesPrefetch = opts?.prefetchIssues
			? getRepoIssues(owner, repo, "open").then(() => {})
			: Promise.resolve();

		await Promise.all([prPrefetch, issuesPrefetch]);
	} catch {
		// Background prefetch — swallow errors
	}
}

export type SecurityFeatureStatus = "enabled" | "disabled" | "not_set" | "unknown";

export interface RepoSecurityFeatures {
	advancedSecurity: SecurityFeatureStatus;
	dependabotAlerts: SecurityFeatureStatus;
	dependabotSecurityUpdates: SecurityFeatureStatus;
	codeScanning: SecurityFeatureStatus;
	secretScanning: SecurityFeatureStatus;
	secretScanningPushProtection: SecurityFeatureStatus;
	privateVulnerabilityReporting: SecurityFeatureStatus;
}

export interface DependabotAlertSummary {
	number: number;
	state: string;
	severity: string | null;
	packageName: string | null;
	ecosystem: string | null;
	summary: string;
	createdAt: string;
	htmlUrl: string;
}

export interface CodeScanningAlertSummary {
	number: number;
	state: string;
	severity: string | null;
	ruleId: string | null;
	ruleDescription: string | null;
	toolName: string | null;
	path: string | null;
	createdAt: string;
	htmlUrl: string;
}

export interface SecretScanningAlertSummary {
	number: number;
	state: string;
	secretType: string | null;
	secretTypeDisplayName: string | null;
	resolution: string | null;
	createdAt: string;
	htmlUrl: string;
}

export interface SecurityReportSummary {
	ghsaId: string;
	cveId: string | null;
	state: string;
	severity: string | null;
	summary: string;
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
	closedAt: string | null;
	htmlUrl: string;
	acceptedPrivateReport: boolean;
}

export interface RepoSecurityAlertsResult<T> {
	alerts: T[];
	error: string | null;
}

export interface RepoSecurityTabData {
	features: RepoSecurityFeatures | null;
	featuresError: string | null;
	reports: RepoSecurityAlertsResult<SecurityReportSummary>;
	dependabot: RepoSecurityAlertsResult<DependabotAlertSummary>;
	secretScanning: RepoSecurityAlertsResult<SecretScanningAlertSummary>;
	permissions: RepoPermissions;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function normalizeSecurityStatus(status: unknown): SecurityFeatureStatus {
	if (status === "enabled" || status === "disabled" || status === "not_set") {
		return status;
	}
	return "unknown";
}

function readFeatureStatus(
	settings: Record<string, unknown> | null,
	key: string,
): SecurityFeatureStatus {
	if (!settings) return "unknown";
	const setting = asRecord(settings[key]);
	return normalizeSecurityStatus(setting?.status);
}

function getErrorStatus(error: unknown): number | null {
	if (typeof error !== "object" || error === null) return null;
	const value = (error as { status?: unknown }).status;
	return typeof value === "number" ? value : null;
}

function getErrorMessage(error: unknown): string {
	if (typeof error !== "object" || error === null) {
		return "Unknown error";
	}
	const value = (error as { message?: unknown }).message;
	return typeof value === "string" && value.trim() ? value : "Unknown error";
}

function formatSecurityError(feature: string, error: unknown): string {
	const status = getErrorStatus(error);
	if (status === 403) {
		return `${feature}: permission denied. Reconnect GitHub with the security_events scope.`;
	}
	if (status === 404) {
		return `${feature}: not available for this repository or your access level.`;
	}
	return `${feature}: ${getErrorMessage(error)}`;
}

function mapDependabotAlert(alert: unknown): DependabotAlertSummary {
	const row = asRecord(alert);
	const vulnerability = asRecord(row?.security_vulnerability);
	const dependency = asRecord(row?.dependency);
	const packageInfo = asRecord(dependency?.package) ?? asRecord(vulnerability?.package);
	const advisory = asRecord(row?.security_advisory);

	return {
		number: asNumber(row?.number) ?? 0,
		state: asString(row?.state) ?? "unknown",
		severity: asString(vulnerability?.severity),
		packageName: asString(packageInfo?.name),
		ecosystem: asString(packageInfo?.ecosystem),
		summary: asString(advisory?.summary) ?? "No summary available",
		createdAt: asString(row?.created_at) ?? "",
		htmlUrl: asString(row?.html_url) ?? "",
	};
}

function mapCodeScanningAlert(alert: unknown): CodeScanningAlertSummary {
	const row = asRecord(alert);
	const rule = asRecord(row?.rule);
	const tool = asRecord(row?.tool);
	const instance = asRecord(row?.most_recent_instance);
	const location = asRecord(instance?.location);

	return {
		number: asNumber(row?.number) ?? 0,
		state: asString(row?.state) ?? "unknown",
		severity: asString(rule?.severity) ?? asString(rule?.security_severity_level),
		ruleId: asString(rule?.id),
		ruleDescription: asString(rule?.description) ?? asString(rule?.name),
		toolName: asString(tool?.name),
		path: asString(location?.path),
		createdAt: asString(row?.created_at) ?? "",
		htmlUrl: asString(row?.html_url) ?? "",
	};
}

function mapSecretScanningAlert(alert: unknown): SecretScanningAlertSummary {
	const row = asRecord(alert);

	return {
		number: asNumber(row?.number) ?? 0,
		state: asString(row?.state) ?? "unknown",
		secretType: asString(row?.secret_type),
		secretTypeDisplayName: asString(row?.secret_type_display_name),
		resolution: asString(row?.resolution),
		createdAt: asString(row?.created_at) ?? "",
		htmlUrl: asString(row?.html_url) ?? "",
	};
}

function mapSecurityReport(report: unknown): SecurityReportSummary {
	const row = asRecord(report);
	const submission = asRecord(row?.submission);

	return {
		ghsaId: asString(row?.ghsa_id) ?? "",
		cveId: asString(row?.cve_id),
		state: asString(row?.state) ?? "unknown",
		severity: asString(row?.severity),
		summary: asString(row?.summary) ?? "No summary available",
		createdAt: asString(row?.created_at) ?? "",
		updatedAt: asString(row?.updated_at) ?? "",
		publishedAt: asString(row?.published_at),
		closedAt: asString(row?.closed_at),
		htmlUrl: asString(row?.html_url) ?? "",
		acceptedPrivateReport: submission?.accepted === true,
	};
}

function extractRepoSecurityFeatures(repoData: unknown): RepoSecurityFeatures | null {
	const repo = asRecord(repoData);
	const settings = asRecord(repo?.security_and_analysis);
	if (!settings) return null;

	return {
		advancedSecurity: readFeatureStatus(settings, "advanced_security"),
		dependabotAlerts: readFeatureStatus(settings, "dependabot_alerts"),
		dependabotSecurityUpdates: readFeatureStatus(
			settings,
			"dependabot_security_updates",
		),
		codeScanning: readFeatureStatus(settings, "code_scanning"),
		secretScanning: readFeatureStatus(settings, "secret_scanning"),
		secretScanningPushProtection: readFeatureStatus(
			settings,
			"secret_scanning_push_protection",
		),
		privateVulnerabilityReporting: readFeatureStatus(
			settings,
			"private_vulnerability_reporting",
		),
	};
}

export async function getRepoSecurityTabData(
	owner: string,
	repo: string,
	perPage = 20,
): Promise<RepoSecurityTabData | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	const [repoResult, reports, dependabot, secretScanning] = await Promise.all([
		octokit.repos
			.get({ owner, repo })
			.then((result) => ({
				data: result.data,
				error: null as string | null,
			}))
			.catch((error: unknown) => ({
				data: null,
				error: formatSecurityError("Security settings", error),
			})),
		octokit.securityAdvisories
			.listRepositoryAdvisories({
				owner,
				repo,
				per_page: perPage,
				sort: "updated",
				direction: "desc",
			})
			.then((result) => ({
				alerts: result.data.map((advisory) => mapSecurityReport(advisory)),
				error: null as string | null,
			}))
			.catch((error: unknown) => ({
				alerts: [] as SecurityReportSummary[],
				error: formatSecurityError("Security reports", error),
			})),
		octokit.dependabot
			.listAlertsForRepo({ owner, repo, per_page: perPage, state: "open" })
			.then((result) => ({
				alerts: result.data.map((alert) => mapDependabotAlert(alert)),
				error: null as string | null,
			}))
			.catch((error: unknown) => ({
				alerts: [] as DependabotAlertSummary[],
				error: formatSecurityError("Dependabot alerts", error),
			})),
		octokit.secretScanning
			.listAlertsForRepo({ owner, repo, per_page: perPage, state: "open" })
			.then((result) => ({
				alerts: result.data.map((alert) => mapSecretScanningAlert(alert)),
				error: null as string | null,
			}))
			.catch((error: unknown) => ({
				alerts: [] as SecretScanningAlertSummary[],
				error: formatSecurityError("Secret scanning alerts", error),
			})),
	]);

	return {
		features: extractRepoSecurityFeatures(repoResult.data),
		featuresError: repoResult.error,
		reports,
		dependabot,
		secretScanning,
		permissions: extractRepoPermissions(repoResult.data ?? {}),
	};
}

export interface SecurityAdvisoryDetail {
	ghsaId: string;
	cveId: string | null;
	state: string;
	severity: string | null;
	cvss: { score: number; vectorString: string } | null;
	cwes: { cweId: string; name: string }[];
	summary: string;
	description: string | null;
	vulnerabilities: {
		packageName: string | null;
		ecosystem: string | null;
		vulnerableVersionRange: string | null;
		patchedVersions: string | null;
	}[];
	credits: { login: string; avatarUrl: string; type: string }[];
	author: { login: string; avatarUrl: string } | null;
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
	closedAt: string | null;
	htmlUrl: string;
}

function mapAdvisoryDetail(data: unknown): SecurityAdvisoryDetail {
	const row = asRecord(data);
	const cvss = asRecord(row?.cvss);
	const cwes = Array.isArray(row?.cwes)
		? (row.cwes as unknown[]).map((c) => {
				const cwe = asRecord(c);
				return {
					cweId: asString(cwe?.cwe_id) ?? "",
					name: asString(cwe?.name) ?? "",
				};
			})
		: [];
	const vulnerabilities = Array.isArray(row?.vulnerabilities)
		? (row.vulnerabilities as unknown[]).map((v) => {
				const vuln = asRecord(v);
				const pkg = asRecord(vuln?.package);
				const firstPatched = asRecord(vuln?.first_patched_version);
				return {
					packageName: asString(pkg?.name),
					ecosystem: asString(pkg?.ecosystem),
					vulnerableVersionRange: asString(
						vuln?.vulnerable_version_range,
					),
					patchedVersions: asString(firstPatched?.identifier),
				};
			})
		: [];
	const credits = Array.isArray(row?.credits)
		? (row.credits as unknown[]).map((c) => {
				const credit = asRecord(c);
				const user = asRecord(credit?.user);
				return {
					login: asString(user?.login) ?? "",
					avatarUrl: asString(user?.avatar_url) ?? "",
					type: asString(credit?.type) ?? "",
				};
			})
		: [];
	const authorRaw = asRecord(row?.author);

	const cvssScore = asNumber(cvss?.score);
	const cvssVector = asString(cvss?.vector_string);

	return {
		ghsaId: asString(row?.ghsa_id) ?? "",
		cveId: asString(row?.cve_id),
		state: asString(row?.state) ?? "unknown",
		severity: asString(row?.severity),
		cvss:
			cvssScore !== null && cvssVector
				? { score: cvssScore, vectorString: cvssVector }
				: null,
		cwes,
		summary: asString(row?.summary) ?? "No summary available",
		description: asString(row?.description),
		vulnerabilities,
		credits,
		author: authorRaw
			? {
					login: asString(authorRaw.login) ?? "",
					avatarUrl: asString(authorRaw.avatar_url) ?? "",
				}
			: null,
		createdAt: asString(row?.created_at) ?? "",
		updatedAt: asString(row?.updated_at) ?? "",
		publishedAt: asString(row?.published_at),
		closedAt: asString(row?.closed_at),
		htmlUrl: asString(row?.html_url) ?? "",
	};
}

export async function getRepositoryAdvisory(
	owner: string,
	repo: string,
	ghsaId: string,
): Promise<SecurityAdvisoryDetail | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		const { data } = await octokit.request(
			"GET /repos/{owner}/{repo}/security-advisories/{ghsa_id}",
			{
				owner,
				repo,
				ghsa_id: ghsaId,
			},
		);
		return mapAdvisoryDetail(data);
	} catch {
		return null;
	}
}

export async function searchGitHubRepos(
	query: string,
	language?: string,
	sort: "stars" | "updated" | "best-match" = "best-match",
	perPage = 20,
) {
	const octokit = await getOctokit();
	if (!octokit) return { items: [], total_count: 0 };

	const q = language ? `${query} language:${language}` : query;

	const { data } = await octokit.search.repos({
		q,
		sort: sort === "best-match" ? undefined : sort,
		order: "desc",
		per_page: perPage,
	});

	return { items: data.items, total_count: data.total_count };
}

export async function getRepoNavCounts(owner: string, repo: string, openIssuesAndPrs: number) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoNavCountsCacheKey(owner, repo),
		cacheType: "repo_nav_counts",
		fallback: { openPrs: 0, openIssues: 0, activeRuns: 0 },
		jobType: "repo_nav_counts",
		jobPayload: { owner, repo, openIssuesAndPrs },
		fetchRemote: (octokit) =>
			fetchRepoNavCountsFromGitHub(octokit, owner, repo, openIssuesAndPrs),
	});
}

export async function getRepoWorkflows(owner: string, repo: string) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoWorkflowsCacheKey(owner, repo),
		cacheType: "repo_workflows",
		fallback: [],
		jobType: "repo_workflows",
		jobPayload: { owner, repo },
		fetchRemote: (octokit) => fetchRepoWorkflowsFromGitHub(octokit, owner, repo),
	});
}

export async function getRepoWorkflowRuns(owner: string, repo: string, perPage = 50) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoWorkflowRunsCacheKey(owner, repo, perPage),
		cacheType: "repo_workflow_runs",
		fallback: [],
		jobType: "repo_workflow_runs",
		jobPayload: { owner, repo, perPage },
		fetchRemote: (octokit) =>
			fetchRepoWorkflowRunsFromGitHub(octokit, owner, repo, perPage),
	});
}

export async function getWorkflowRun(owner: string, repo: string, runId: number) {
	const octokit = await getOctokit();
	if (!octokit) return null;
	const { data } = await octokit.actions.getWorkflowRun({
		owner,
		repo,
		run_id: runId,
	});
	return data;
}

export async function getWorkflowRunJobs(owner: string, repo: string, runId: number) {
	const octokit = await getOctokit();
	if (!octokit) return [];
	const { data } = await octokit.actions.listJobsForWorkflowRun({
		owner,
		repo,
		run_id: runId,
		per_page: 100,
	});
	return data.jobs;
}

export async function getRepoContributors(
	owner: string,
	repo: string,
	perPage = 20,
): Promise<{
	list: { login: string; avatar_url: string; contributions: number; html_url: string }[];
	totalCount: number;
}> {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildRepoContributorsCacheKey(owner, repo, perPage),
		cacheType: "repo_contributors",
		fallback: { list: [], totalCount: 0 },
		jobType: "repo_contributors",
		jobPayload: { owner, repo, perPage },
		fetchRemote: (octokit) =>
			fetchRepoContributorsFromGitHub(octokit, owner, repo, perPage),
	});
}

export async function getUser(username: string) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildUserProfileCacheKey(username),
		cacheType: "user_profile",
		fallback: null,
		jobType: "user_profile",
		jobPayload: { username },
		fetchRemote: (octokit) => fetchUserProfileFromGitHub(octokit, username),
	});
}

export async function getUserPublicRepos(username: string, perPage = 30) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildUserPublicReposCacheKey(username, perPage),
		cacheType: "user_public_repos",
		fallback: [],
		jobType: "user_public_repos",
		jobPayload: { username, perPage },
		fetchRemote: (octokit) =>
			fetchUserPublicReposFromGitHub(
				octokit,
				username,
				perPage,
				authCtx?.token ?? null,
			),
	});
}

export async function getUserPublicOrgs(username: string) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildUserPublicOrgsCacheKey(username),
		cacheType: "user_public_orgs",
		fallback: [],
		jobType: "user_public_orgs",
		jobPayload: { username },
		fetchRemote: (octokit) => fetchUserPublicOrgsFromGitHub(octokit, username),
	});
}

export interface UserFollow {
	login: string;
	avatar_url: string;
	html_url: string;
	name?: string | null;
	bio?: string | null;
	company?: string | null;
	location?: string | null;
	type?: string;
	site_admin?: boolean;
}

async function fetchUserFollowsFromGitHubGraphQL(
	username: string,
	kind: "followers" | "following",
	first: number,
	tokenOverride?: string | null,
): Promise<UserFollow[] | null> {
	try {
		const token = tokenOverride ?? (await getGitHubToken());
		if (!token) return null;

		const connectionField = kind === "followers" ? "followers" : "following";
		const query = `
			query($login: String!, $first: Int!) {
				user(login: $login) {
					${connectionField}(first: $first) {
						nodes {
							login
							avatarUrl
							url
							name
							bio
							company
							location
							__typename
						}
					}
				}
			}
		`;
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables: { login: username, first } }),
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok) return null;
		const json = (await response.json()) as {
			data?: {
				user?: {
					followers?: { nodes?: Array<Record<string, unknown>> };
					following?: { nodes?: Array<Record<string, unknown>> };
				};
			};
		};
		const nodes =
			kind === "followers"
				? (json.data?.user?.followers?.nodes ?? [])
				: (json.data?.user?.following?.nodes ?? []);
		if (nodes.length === 0 && !json.data?.user) return null;
		return nodes
			.filter((n) => typeof n.login === "string")
			.map((n) => ({
				login: String(n.login),
				avatar_url: String(n.avatarUrl ?? ""),
				html_url: String(n.url ?? `https://github.com/${String(n.login)}`),
				name: typeof n.name === "string" ? n.name : null,
				bio: typeof n.bio === "string" ? n.bio : null,
				company: typeof n.company === "string" ? n.company : null,
				location: typeof n.location === "string" ? n.location : null,
				type:
					n.__typename === "Bot"
						? "Bot"
						: n.__typename === "Organization"
							? "Organization"
							: "User",
				site_admin: false,
			}));
	} catch {
		return null;
	}
}

async function fetchUserFollowsFromPublicRest(
	username: string,
	kind: "followers" | "following",
	perPage: number,
): Promise<UserFollow[] | null> {
	try {
		const endpoint = kind === "followers" ? "followers" : "following";
		const response = await fetch(
			`https://api.github.com/users/${encodeURIComponent(username)}/${endpoint}?per_page=${perPage}`,
			{
				signal: AbortSignal.timeout(8_000),
				headers: {
					Accept: "application/vnd.github+json",
				},
			},
		);
		if (!response.ok) return null;
		const data = (await response.json()) as Array<Record<string, unknown>>;
		if (!Array.isArray(data)) return null;
		return data
			.filter((u) => typeof u.login === "string")
			.map((u) => ({
				login: String(u.login),
				avatar_url: String(u.avatar_url ?? ""),
				html_url: String(
					u.html_url ?? `https://github.com/${String(u.login)}`,
				),
				type: typeof u.type === "string" ? u.type : undefined,
				site_admin:
					typeof u.site_admin === "boolean" ? u.site_admin : false,
			}));
	} catch {
		return null;
	}
}

async function enrichUserFollowsWithPublicProfiles(
	items: UserFollow[],
	limit = 100,
	tokenOverride?: string | null,
): Promise<UserFollow[]> {
	if (items.length === 0) return items;

	const token = tokenOverride ?? (await getGitHubToken());
	const enrichSlice = items.slice(0, Math.min(items.length, limit));

	if (token) {
		const enriched = await enrichViaGraphQL(token, enrichSlice);
		if (enriched) return mergeEnrichedDetails(items, enriched);
	}

	return items;
}

async function fetchUserFollowersFromGitHub(
	octokit: Octokit | null,
	token: string | null,
	username: string,
	perPage: number,
): Promise<UserFollow[]> {
	const gql = await fetchUserFollowsFromGitHubGraphQL(username, "followers", perPage, token);
	if (gql) return gql;
	const publicFollowers = await fetchUserFollowsFromPublicRest(
		username,
		"followers",
		perPage,
	);
	if (publicFollowers) {
		return enrichUserFollowsWithPublicProfiles(publicFollowers, perPage, token);
	}
	if (!octokit) return [];
	try {
		const { data } = await octokit.users.listFollowersForUser({
			username,
			per_page: perPage,
		});
		const mapped = data.map((u) => ({
			login: u.login,
			avatar_url: u.avatar_url,
			html_url: u.html_url,
			type: u.type,
			site_admin: u.site_admin,
		}));
		return enrichUserFollowsWithPublicProfiles(mapped, perPage, token);
	} catch {
		return [];
	}
}

async function fetchUserFollowingFromGitHub(
	octokit: Octokit | null,
	token: string | null,
	username: string,
	perPage: number,
): Promise<UserFollow[]> {
	const gql = await fetchUserFollowsFromGitHubGraphQL(username, "following", perPage, token);
	if (gql) return gql;
	const publicFollowing = await fetchUserFollowsFromPublicRest(
		username,
		"following",
		perPage,
	);
	if (publicFollowing) {
		return enrichUserFollowsWithPublicProfiles(publicFollowing, perPage, token);
	}
	if (!octokit) return [];
	try {
		const { data } = await octokit.users.listFollowingForUser({
			username,
			per_page: perPage,
		});
		const mapped = data.map((u) => ({
			login: u.login,
			avatar_url: u.avatar_url,
			html_url: u.html_url,
			type: u.type,
			site_admin: u.site_admin,
		}));
		return enrichUserFollowsWithPublicProfiles(mapped, perPage, token);
	} catch {
		return [];
	}
}

async function enrichViaGraphQL(
	token: string,
	slice: UserFollow[],
): Promise<Map<string, Partial<UserFollow> & { login: string }> | null> {
	try {
		const aliases = slice.map(
			(_u, i) =>
				`u${i}: user(login: $login${i}) { login name bio company location __typename }`,
		);
		const variableDefinitions = slice.map((_u, i) => `$login${i}: String!`).join(", ");
		const variables = Object.fromEntries(slice.map((u, i) => [`login${i}`, u.login]));
		const query =
			variableDefinitions.length > 0
				? `query (${variableDefinitions}) { ${aliases.join("\n")} }`
				: `query { ${aliases.join("\n")} }`;
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables }),
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) return null;
		const json = (await response.json()) as {
			data?: Record<string, Record<string, unknown> | null>;
		};
		if (!json.data) return null;
		const map = new Map<string, Partial<UserFollow> & { login: string }>();
		for (const value of Object.values(json.data)) {
			if (!value || typeof value.login !== "string") continue;
			map.set(value.login.toLowerCase(), {
				login: String(value.login),
				name: typeof value.name === "string" ? value.name : null,
				bio: typeof value.bio === "string" ? value.bio : null,
				company: typeof value.company === "string" ? value.company : null,
				location:
					typeof value.location === "string" ? value.location : null,
				type:
					value.__typename === "Bot"
						? "Bot"
						: value.__typename === "Organization"
							? "Organization"
							: "User",
			});
		}
		return map;
	} catch {
		return null;
	}
}

function mergeEnrichedDetails(
	items: UserFollow[],
	detailByLogin: Map<string, Partial<UserFollow> & { login: string }>,
): UserFollow[] {
	return items.map((item) => {
		const detail = detailByLogin.get(item.login.toLowerCase());
		if (!detail) return item;
		return {
			...item,
			name: detail.name ?? item.name ?? null,
			bio: detail.bio ?? item.bio ?? null,
			company: detail.company ?? item.company ?? null,
			location: detail.location ?? item.location ?? null,
			type: detail.type ?? item.type,
			site_admin: item.site_admin,
		};
	});
}

export async function getUserFollowers(username: string, perPage = 100): Promise<UserFollow[]> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) {
		return fetchUserFollowersFromGitHub(null, null, username, perPage);
	}
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildUserFollowersCacheKey(username, perPage),
		cacheType: "user_followers",
		fallback: [],
		jobType: "user_followers",
		jobPayload: { username, perPage },
		fetchRemote: (octokit) =>
			fetchUserFollowersFromGitHub(octokit, authCtx.token, username, perPage),
	});
}

export async function getUserFollowing(username: string, perPage = 100): Promise<UserFollow[]> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) {
		return fetchUserFollowingFromGitHub(null, null, username, perPage);
	}
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildUserFollowingCacheKey(username, perPage),
		cacheType: "user_following",
		fallback: [],
		jobType: "user_following",
		jobPayload: { username, perPage },
		fetchRemote: (octokit) =>
			fetchUserFollowingFromGitHub(octokit, authCtx.token, username, perPage),
	});
}

export async function getUserOrgTopRepos(orgLogins: string[]) {
	if (orgLogins.length === 0) return [];
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return [];
	return fetchUserOrgTopReposFromGitHub(authCtx.octokit, orgLogins);
}

export async function getOrgMembers(org: string, perPage = 100) {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildOrgMembersCacheKey(org, perPage),
		cacheType: "org_members",
		fallback: [],
		jobType: "org_members",
		jobPayload: { orgName: org, perPage },
		fetchRemote: (octokit) => fetchOrgMembersFromGitHub(octokit, org, perPage),
	});
}

export interface ContributorWeek {
	w: number; // unix timestamp (start of week)
	a: number; // additions
	d: number; // deletions
	c: number; // commits
}

export interface ContributorStats {
	login: string;
	avatar_url: string;
	total: number;
	weeks: ContributorWeek[];
}

export async function getRepoContributorStats(
	owner: string,
	repo: string,
): Promise<ContributorStats[]> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		// GitHub may return 202 while computing stats - retry once
		let response = await octokit.repos.getContributorsStats({ owner, repo });
		if (response.status === 202) {
			await new Promise((r) => setTimeout(r, 2000));
			response = await octokit.repos.getContributorsStats({ owner, repo });
		}
		if (!Array.isArray(response.data)) return [];
		return response.data.map((entry) => ({
			login: entry.author?.login ?? "",
			avatar_url: entry.author?.avatar_url ?? "",
			total: entry.total ?? 0,
			weeks: (entry.weeks ?? []).map((w) => ({
				w: w.w ?? 0,
				a: w.a ?? 0,
				d: w.d ?? 0,
				c: w.c ?? 0,
			})),
		}));
	} catch {
		return [];
	}
}

export interface CommitActivityWeek {
	total: number;
	week: number;
	days: number[];
}

export async function getCommitActivity(
	owner: string,
	repo: string,
): Promise<CommitActivityWeek[]> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		let response = await octokit.request(
			"GET /repos/{owner}/{repo}/stats/commit_activity",
			{ owner, repo },
		);
		if (response.status === 202) {
			await new Promise((r) => setTimeout(r, 2000));
			response = await octokit.request(
				"GET /repos/{owner}/{repo}/stats/commit_activity",
				{ owner, repo },
			);
		}
		if (!Array.isArray(response.data)) return [];
		return (response.data as { total: number; week: number; days: number[] }[]).map(
			(w) => ({
				total: w.total ?? 0,
				week: w.week ?? 0,
				days: w.days ?? [],
			}),
		);
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return [];
	}
}

export interface CodeFrequencyWeek {
	week: number;
	additions: number;
	deletions: number;
}

export async function getCodeFrequency(owner: string, repo: string): Promise<CodeFrequencyWeek[]> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		let response = await octokit.request(
			"GET /repos/{owner}/{repo}/stats/code_frequency",
			{ owner, repo },
		);
		if (response.status === 202) {
			await new Promise((r) => setTimeout(r, 2000));
			response = await octokit.request(
				"GET /repos/{owner}/{repo}/stats/code_frequency",
				{ owner, repo },
			);
		}
		if (!Array.isArray(response.data)) return [];
		return (response.data as [number, number, number][]).map((entry) => ({
			week: entry[0] ?? 0,
			additions: entry[1] ?? 0,
			deletions: Math.abs(entry[2] ?? 0),
		}));
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return [];
	}
}

export interface WeeklyParticipation {
	all: number[];
	owner: number[];
}

export async function getWeeklyParticipation(
	owner: string,
	repo: string,
): Promise<WeeklyParticipation | null> {
	const octokit = await getOctokit();
	if (!octokit) return null;

	try {
		let response = await octokit.request(
			"GET /repos/{owner}/{repo}/stats/participation",
			{ owner, repo },
		);
		if ((response.status as number) === 202) {
			await new Promise((r) => setTimeout(r, 2000));
			response = await octokit.request(
				"GET /repos/{owner}/{repo}/stats/participation",
				{ owner, repo },
			);
		}
		const data = response.data as { all?: number[]; owner?: number[] };
		if (!data.all) return null;
		return {
			all: data.all ?? [],
			owner: data.owner ?? [],
		};
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return null;
	}
}

export async function getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
	const octokit = await getOctokit();
	if (!octokit) return {};

	try {
		const response = await octokit.repos.listLanguages({ owner, repo });
		return response.data ?? {};
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return {};
	}
}

// --- Combined repo page data via single GraphQL call ---

export type RepoPageDataResult =
	| { success: true; data: RepoPageData }
	| { success: false; error: string };

export interface RepoPageData {
	repoData: {
		description?: string;
		topics: string[];
		stargazers_count: number;
		forks_count: number;
		subscribers_count: number;
		watchers_count: number;
		default_branch: string;
		owner: { avatar_url: string; login: string; type: string };
		permissions: RepoPermissions;
		private: boolean;
		archived: boolean;
		fork: boolean;
		language: string | null;
		license: { name: string; spdx_id: string | null } | null;
		pushed_at: string;
		size: number;
		html_url: string;
		homepage: string | null;
		parent: { full_name: string; owner: { login: string }; name: string } | null;
		open_issues_count: number;
		has_discussions: boolean;
	};
	navCounts: { openPrs: number; openIssues: number; activeRuns: number; discussions: number };
	languages: Record<string, number>;
	viewerLogin: string | null;
	viewerHasStarred: boolean;
	viewerIsOrgMember: boolean;
	latestCommit: {
		sha: string;
		message: string;
		date: string;
		author: { login: string; avatarUrl: string } | null;
	} | null;
}

function mapViewerPermission(perm: string | null): RepoPermissions {
	const level = perm ?? "READ";
	return {
		admin: level === "ADMIN",
		maintain: level === "ADMIN" || level === "MAINTAIN",
		push: level === "ADMIN" || level === "MAINTAIN" || level === "WRITE",
		triage:
			level === "ADMIN" ||
			level === "MAINTAIN" ||
			level === "WRITE" ||
			level === "TRIAGE",
		pull: true,
	};
}

async function fetchRepoPageDataGraphQL(
	token: string,
	owner: string,
	repo: string,
): Promise<RepoPageData | null> {
	const query = `
		query($owner: String!, $repo: String!) {
			viewer { login }
			organization(login: $owner) {
				viewerIsAMember
			}
			repository(owner: $owner, name: $repo) {
				description
				stargazerCount
				forkCount
				watchers { totalCount }
				isInOrganization
				isPrivate
				isArchived
				isFork
				hasDiscussionsEnabled
				owner { login avatarUrl }
				defaultBranchRef {
					name
					target {
						... on Commit {
							history(first: 1) {
								nodes {
									oid
									message
									committedDate
									author {
										user { login avatarUrl }
										name
									}
								}
							}
						}
					}
				}
				viewerPermission
				viewerHasStarred
				primaryLanguage { name }
				licenseInfo { name spdxId }
				pushedAt
				diskUsage
				url
				homepageUrl
				repositoryTopics(first: 20) {
					nodes { topic { name } }
				}
				pullRequests(states: [OPEN]) { totalCount }
				issues(states: [OPEN]) { totalCount }
				discussions { totalCount }
				languages(first: 20, orderBy: { field: SIZE, direction: DESC }) {
					edges { size node { name } }
				}
				parent { nameWithOwner owner { login } name }
			}
		}
	`;

	const response = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ query, variables: { owner, repo } }),
	});

	if (!response.ok) {
		if (response.status === 403) {
			const text = await response.text().catch(() => "");
			if (text.includes("OAuth App access restrictions")) {
				const match = text.match(/`([^`]+)` organization/);
				throw new GitHubOAuthRestrictedError(match?.[1] ?? owner);
			}
		}
		throw new Error(`GraphQL request failed: ${response.status}`);
	}
	const json = await response.json();

	if (json.errors?.length) {
		const errorMessages = json.errors
			.map((e: { message: string }) => e.message)
			.join("; ");
		// GraphQL returns partial data when only the organization query fails
		// (e.g. owner is a user, not an org). Only throw if repository data is missing.
		if (!json.data?.repository) {
			console.error(
				`[fetchRepoPageDataGraphQL] GitHub API error for ${owner}/${repo}:`,
				errorMessages,
			);
			if (errorMessages.includes("OAuth App access restrictions")) {
				throw new GitHubOAuthRestrictedError(owner);
			}
			throw new Error(errorMessages);
		}
	}

	const r = json.data?.repository;
	if (!r) {
		console.warn(`[fetchRepoPageDataGraphQL] Repository not found: ${owner}/${repo}`);
		return null;
	}

	const viewerIsOrgMember: boolean = json.data?.organization?.viewerIsAMember ?? false;
	const viewerLogin: string | null = json.data?.viewer?.login ?? null;

	const languages: Record<string, number> = {};
	for (const edge of r.languages?.edges ?? []) {
		languages[edge.node.name] = edge.size;
	}

	const latestNode = r.defaultBranchRef?.target?.history?.nodes?.[0];
	const latestCommit = latestNode
		? {
				sha: latestNode.oid,
				message: latestNode.message?.split("\n")[0] ?? "",
				date: latestNode.committedDate ?? "",
				author: latestNode.author?.user
					? {
							login: latestNode.author.user.login,
							avatarUrl: latestNode.author.user.avatarUrl,
						}
					: latestNode.author?.name
						? { login: latestNode.author.name, avatarUrl: "" }
						: null,
			}
		: null;

	const parentNode = r.parent;

	return {
		repoData: {
			description: r.description ?? undefined,
			topics: (r.repositoryTopics?.nodes ?? []).map(
				(n: { topic: { name: string } }) => n.topic.name,
			),
			stargazers_count: r.stargazerCount ?? 0,
			forks_count: r.forkCount ?? 0,
			subscribers_count: r.watchers?.totalCount ?? 0,
			watchers_count: r.stargazerCount ?? 0,
			default_branch: r.defaultBranchRef?.name ?? "main",
			owner: {
				avatar_url: r.owner?.avatarUrl ?? "",
				login: r.owner?.login ?? owner,
				type: r.isInOrganization ? "Organization" : "User",
			},
			permissions: mapViewerPermission(r.viewerPermission),
			private: r.isPrivate ?? false,
			archived: r.isArchived ?? false,
			fork: r.isFork ?? false,
			language: r.primaryLanguage?.name ?? null,
			license: r.licenseInfo
				? {
						name: r.licenseInfo.name,
						spdx_id: r.licenseInfo.spdxId ?? null,
					}
				: null,
			pushed_at: r.pushedAt ?? "",
			size: r.diskUsage ?? 0,
			html_url: r.url ?? `https://github.com/${owner}/${repo}`,
			homepage: r.homepageUrl || null,
			parent: parentNode
				? {
						full_name: parentNode.nameWithOwner,
						owner: { login: parentNode.owner.login },
						name: parentNode.name,
					}
				: null,
			open_issues_count: r.issues?.totalCount ?? 0,
			has_discussions: r.hasDiscussionsEnabled ?? false,
		},
		navCounts: {
			openPrs: r.pullRequests?.totalCount ?? 0,
			openIssues: r.issues?.totalCount ?? 0,
			activeRuns: 0,
			discussions: r.discussions?.totalCount ?? 0,
		},
		languages,
		viewerLogin,
		viewerHasStarred: r.viewerHasStarred ?? false,
		viewerIsOrgMember,
		latestCommit,
	};
}

export const getRepoPageData = cache(
	async (owner: string, repo: string): Promise<RepoPageDataResult> => {
		const authCtx = await getGitHubAuthContext();
		if (!authCtx) return { success: false, error: "Not authenticated" };

		const { getCachedRepoPageData } = await import("@/lib/repo-data-cache-vc");
		const cached = await getCachedRepoPageData<RepoPageData>(
			authCtx.userId,
			owner,
			repo,
		);
		if (cached) return { success: true, data: cached };

		return fetchAndCacheRepoPageData(owner, repo);
	},
);

export async function fetchAndCacheRepoPageData(
	owner: string,
	repo: string,
): Promise<RepoPageDataResult> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return { success: false, error: "Not authenticated" };

	try {
		const result = await fetchRepoPageDataGraphQL(authCtx.token, owner, repo);
		if (!result) return { success: false, error: "Repository not found" };

		const { setCachedRepoPageData } = await import("@/lib/repo-data-cache");
		const navCountsKey = buildRepoNavCountsCacheKey(owner, repo);
		const languagesKey = buildRepoLanguagesCacheKey(owner, repo);
		await Promise.all([
			setCachedRepoPageData(authCtx.userId, owner, repo, result),
			upsertGithubCacheEntry(
				authCtx.userId,
				navCountsKey,
				"repo_nav_counts",
				result.navCounts,
			),
			upsertGithubCacheEntry(
				authCtx.userId,
				languagesKey,
				"repo_languages",
				result.languages,
			),
			cacheDefaultBranch(owner, repo, result.repoData.default_branch),
		]);

		return { success: true, data: result };
	} catch (error) {
		console.error(`[fetchAndCacheRepoPageData] Failed for ${owner}/${repo}:`, error);
		const message = error instanceof Error ? error.message : "Unknown error";
		return { success: false, error: message };
	}
}

export async function getRepoOverviewData(
	owner: string,
	repo: string,
): Promise<{
	navCounts: RepoPageData["navCounts"];
	languages: Record<string, number>;
}> {
	const result = await getRepoPageData(owner, repo);
	if (result.success)
		return { navCounts: result.data.navCounts, languages: result.data.languages };
	return {
		navCounts: { openPrs: 0, openIssues: 0, activeRuns: 0, discussions: 0 },
		languages: {},
	};
}

export async function getRepoEvents(owner: string, repo: string, perPage = 30) {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		const { data } = await octokit.activity.listRepoEvents({
			owner,
			repo,
			per_page: perPage,
		});
		return data;
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		return [];
	}
}

export interface PersonRepoActivity {
	commits: { sha: string; message: string; date: string }[];
	prs: { number: number; title: string; state: string; created_at: string }[];
	issues: { number: number; title: string; state: string; created_at: string }[];
	reviews: { pr_number: number; pr_title: string; submitted_at: string }[];
}

async function fetchPersonRepoActivityFromGitHub(
	octokit: Octokit,
	owner: string,
	repo: string,
	username: string,
): Promise<PersonRepoActivity> {
	const [commitsResult, prsResult, issuesResult, reviewsResult] = await Promise.allSettled([
		octokit.repos
			.listCommits({ owner, repo, author: username, per_page: 30 })
			.then((r) =>
				r.data.map((c) => ({
					sha: c.sha,
					message: c.commit.message.split("\n")[0],
					date:
						c.commit.author?.date ??
						c.commit.committer?.date ??
						"",
				})),
			),
		octokit.search
			.issuesAndPullRequests({
				q: `repo:${owner}/${repo} is:pr author:${username}`,
				per_page: 30,
				sort: "created",
				order: "desc",
			})
			.then((r) =>
				r.data.items.map((item) => ({
					number: item.number,
					title: item.title,
					state: item.pull_request?.merged_at ? "merged" : item.state,
					created_at: item.created_at,
				})),
			),
		octokit.search
			.issuesAndPullRequests({
				q: `repo:${owner}/${repo} is:issue author:${username}`,
				per_page: 30,
				sort: "created",
				order: "desc",
			})
			.then((r) =>
				r.data.items.map((item) => ({
					number: item.number,
					title: item.title,
					state: item.state,
					created_at: item.created_at,
				})),
			),
		octokit.search
			.issuesAndPullRequests({
				q: `repo:${owner}/${repo} is:pr reviewed-by:${username}`,
				per_page: 30,
				sort: "created",
				order: "desc",
			})
			.then((r) =>
				r.data.items.map((item) => ({
					pr_number: item.number,
					pr_title: item.title,
					submitted_at: item.updated_at,
				})),
			),
	]);

	return {
		commits: commitsResult.status === "fulfilled" ? commitsResult.value : [],
		prs: prsResult.status === "fulfilled" ? prsResult.value : [],
		issues: issuesResult.status === "fulfilled" ? issuesResult.value : [],
		reviews: reviewsResult.status === "fulfilled" ? reviewsResult.value : [],
	};
}

export async function getPersonRepoActivity(
	owner: string,
	repo: string,
	username: string,
): Promise<PersonRepoActivity> {
	const authCtx = await getGitHubAuthContext();
	return readLocalFirstGitData({
		authCtx,
		cacheKey: buildPersonRepoActivityCacheKey(owner, repo, username),
		cacheType: "person_repo_activity",
		fallback: { commits: [], prs: [], issues: [], reviews: [] },
		jobType: "person_repo_activity",
		jobPayload: { owner, repo, username },
		fetchRemote: (octokit) =>
			fetchPersonRepoActivityFromGitHub(octokit, owner, repo, username),
	});
}

export async function getRepoCommits(
	owner: string,
	repo: string,
	sha?: string,
	page = 1,
	perPage = 30,
	since?: string,
	until?: string,
) {
	const octokit = await getOctokit();
	if (!octokit) return [];
	try {
		const { data } = await octokit.repos.listCommits({
			owner,
			repo,
			sha,
			per_page: perPage,
			page,
			...(since ? { since } : {}),
			...(until ? { until } : {}),
		});
		return data;
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		throw error;
	}
}

export async function getCommit(owner: string, repo: string, ref: string) {
	const octokit = await getOctokit();
	if (!octokit) return null;
	try {
		const { data } = await octokit.repos.getCommit({ owner, repo, ref });
		return data;
	} catch (error) {
		rethrowKnownGitHubErrors(error);
		throw error;
	}
}

export interface AuthorDossierResult {
	author: {
		login: string;
		name: string | null;
		avatar_url: string;
		bio: string | null;
		company: string | null;
		location: string | null;
		blog: string | null;
		twitter_username: string | null;
		public_repos: number;
		followers: number;
		following: number;
		created_at: string;
		type: string;
	};
	orgs: { login: string; avatar_url: string }[];
	topRepos: {
		name: string;
		full_name: string;
		stargazers_count: number;
		language: string | null;
	}[];
	isOrgMember: boolean;
	score: ReturnType<typeof computeContributorScore>;
	contributionCount: number;
	repoActivity: {
		commits: number;
		prs: number;
		reviews: number;
		issues: number;
	};
}

// ── GraphQL Author Dossier response types ──

interface GQLDossierUser {
	login: string;
	name: string | null;
	avatarUrl: string;
	bio: string | null;
	company: string | null;
	location: string | null;
	websiteUrl: string | null;
	twitterUsername: string | null;
	repositories: { totalCount: number };
	followers: { totalCount: number };
	following: { totalCount: number };
	createdAt: string;
	__typename: string;
	topRepositories?: {
		nodes: {
			name: string;
			nameWithOwner: string;
			stargazerCount: number;
			primaryLanguage?: { name: string } | null;
		}[];
	};
	organizations?: { nodes: { login: string; avatarUrl: string }[] };
}

interface GQLDossierResponse {
	data?: {
		user?: GQLDossierUser;
		openPrs?: { issueCount: number };
		mergedPrs?: { issueCount: number };
		closedPrs?: { issueCount: number };
		issues?: { issueCount: number };
		reviews?: { issueCount: number };
	};
}

export async function getAuthorDossier(
	owner: string,
	repo: string,
	authorLogin: string,
): Promise<AuthorDossierResult | null> {
	try {
		const cached = await getCachedAuthorDossier<AuthorDossierResult>(
			owner,
			repo,
			authorLogin,
		);
		if (cached) return cached;

		const token = await getGitHubToken();
		if (!token) return null;

		const slug = `${owner}/${repo}`;
		const query = `
			query($login: String!) {
				user(login: $login) {
					login
					name
					avatarUrl
					bio
					company
					location
					websiteUrl
					twitterUsername
					repositories { totalCount }
					followers { totalCount }
					following { totalCount }
					createdAt
					__typename
					topRepositories(first: 6, orderBy: {field: STARGAZERS, direction: DESC}) {
						nodes { name nameWithOwner stargazerCount primaryLanguage { name } }
					}
					organizations(first: 10) {
						nodes { login avatarUrl }
					}
				}
				openPrs: search(query: "repo:${slug} author:${authorLogin} type:pr is:open", type: ISSUE, first: 0) { issueCount }
				mergedPrs: search(query: "repo:${slug} author:${authorLogin} type:pr is:merged", type: ISSUE, first: 0) { issueCount }
				closedPrs: search(query: "repo:${slug} author:${authorLogin} type:pr is:unmerged is:closed", type: ISSUE, first: 0) { issueCount }
				issues: search(query: "repo:${slug} author:${authorLogin} type:issue", type: ISSUE, first: 0) { issueCount }
				reviews: search(query: "repo:${slug} reviewed-by:${authorLogin} type:pr", type: ISSUE, first: 0) { issueCount }
			}
		`;

		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables: { login: authorLogin } }),
			signal: AbortSignal.timeout(8_000),
		});

		if (!response.ok) return null;
		const json: GQLDossierResponse = await response.json();
		const u = json.data?.user;
		if (!u) return null;

		const orgs: { login: string; avatar_url: string }[] = (
			u.organizations?.nodes ?? []
		).map((o) => ({
			login: o.login,
			avatar_url: o.avatarUrl,
		}));
		const topRepos = (u.topRepositories?.nodes ?? []).map((r) => ({
			name: r.name,
			full_name: r.nameWithOwner,
			stargazers_count: r.stargazerCount ?? 0,
			language: r.primaryLanguage?.name ?? null,
		}));
		const isOrgMember = orgs.some(
			(o) => o.login?.toLowerCase() === owner.toLowerCase(),
		);

		const openPrs = json.data?.openPrs?.issueCount ?? 0;
		const mergedPrs = json.data?.mergedPrs?.issueCount ?? 0;
		const closedPrs = json.data?.closedPrs?.issueCount ?? 0;
		const totalPrs = openPrs + mergedPrs + closedPrs;
		const issueCount = json.data?.issues?.issueCount ?? 0;
		const reviewCount = json.data?.reviews?.issueCount ?? 0;

		const prsInRepo: { state: string }[] = [
			...Array(mergedPrs).fill({ state: "merged" }),
			...Array(closedPrs).fill({ state: "closed" }),
			...Array(openPrs).fill({ state: "open" }),
		];

		const contributionCount = mergedPrs + reviewCount;
		const isContributor = contributionCount > 0;

		const score = computeContributorScore({
			followers: u.followers?.totalCount ?? 0,
			publicRepos: u.repositories?.totalCount ?? 0,
			accountCreated: u.createdAt ?? "",
			commitsInRepo: mergedPrs,
			prsInRepo,
			reviewsInRepo: reviewCount,
			isContributor,
			contributionCount,
			isOrgMember,
			isOwner: authorLogin.toLowerCase() === owner.toLowerCase(),
			topRepoStars: topRepos.map((r) => r.stargazers_count),
		});

		const result = {
			author: {
				login: u.login,
				name: u.name,
				avatar_url: u.avatarUrl,
				bio: u.bio,
				company: u.company,
				location: u.location,
				blog: u.websiteUrl,
				twitter_username: u.twitterUsername,
				public_repos: u.repositories?.totalCount ?? 0,
				followers: u.followers?.totalCount ?? 0,
				following: u.following?.totalCount ?? 0,
				created_at: u.createdAt,
				type: u.__typename === "Bot" ? "Bot" : "User",
			},
			orgs,
			topRepos: topRepos.slice(0, 3),
			isOrgMember,
			score,
			contributionCount,
			repoActivity: {
				commits: mergedPrs,
				prs: totalPrs,
				reviews: reviewCount,
				issues: issueCount,
			},
		};

		await setCachedAuthorDossier(owner, repo, authorLogin, result);
		return result;
	} catch (e) {
		console.error("[getAuthorDossier] failed:", e);
		return null;
	}
}
