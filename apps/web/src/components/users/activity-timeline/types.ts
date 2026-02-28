import type {
	CommitContributionNode,
	ContributionActivity,
	IssueContributionNode,
	PullRequestContributionNode,
} from "@/lib/github-types";

export type ContributionDay = {
	contributionCount: number;
	date: string;
	color: string;
};

export type ContributionWeek = {
	contributionDays: ContributionDay[];
};

export type ContributionData = {
	totalContributions: number;
	weeks: ContributionWeek[];
	timelineWeeks?: ContributionWeek[];
	activity?: ContributionActivity | null;
};

export type ProfileRepoTimelineItem = {
	full_name: string;
	created_at: string | null;
	language?: string | null;
};

export type CommitMessage = {
	id: string;
	repoName: string;
	sha?: string;
	message: string;
	createdAt: string;
};

export type RepoCommitCount = {
	repoName: string;
	count: number;
};

export type CommitActivityItem = {
	kind: "commits";
	totalCommits: number;
	repositories: RepoCommitCount[];
	commitMessages: CommitMessage[];
};

export type PullRequestStatus = "open" | "closed" | "merged";
export type IssueStatus = "open" | "closed";

export type PullRequestEntry = {
	id: string;
	repoName: string;
	number?: number;
	title?: string;
	createdAt: string;
	href: string;
	status?: PullRequestStatus;
	action: "opened" | "merged" | "closed" | "reviewed";
	comments?: number;
	additions?: number;
	deletions?: number;
	changedFiles?: number;
	commits?: number;
	language?: string | null;
};

export type PullRequestActivityItem = {
	kind: "pull_requests";
	items: PullRequestEntry[];
};

export type IssueEntry = {
	id: string;
	repoName: string;
	number?: number;
	title?: string;
	createdAt: string;
	href: string;
	status?: IssueStatus;
	comments?: number;
};

export type IssuesActivityItem = {
	kind: "issues";
	items: IssueEntry[];
};

export type CreatedRepoEntry = {
	id: string;
	repoName: string;
	createdAt: string;
	href: string;
	language?: string | null;
};

export type CreatedReposActivityItem = {
	kind: "repositories";
	items: CreatedRepoEntry[];
};

export type FallbackActivityItem = {
	kind: "other";
	total: number;
};

export type EventActivityItem =
	| CommitActivityItem
	| PullRequestActivityItem
	| IssuesActivityItem
	| CreatedReposActivityItem
	| FallbackActivityItem;

export type ExpandableItemKind = "pull_requests" | "issues" | "repositories";

export type EventMonthGroup = {
	kind: "events";
	key: string;
	year: number;
	items: EventActivityItem[];
};

export type ContributionMonthGroup = {
	kind: "contributions";
	key: string;
	year: number;
	days: ContributionDay[];
	items: EventActivityItem[];
};

export type TimelineMonthGroup = EventMonthGroup | ContributionMonthGroup;

export type ContributionMonthAccumulator = {
	days: ContributionDay[];
	commitCountByRepo: Map<string, number>;
	pullRequests: PullRequestEntry[];
	issues: IssueEntry[];
	createdRepos: CreatedRepoEntry[];
};

export type { CommitContributionNode, IssueContributionNode, PullRequestContributionNode };
