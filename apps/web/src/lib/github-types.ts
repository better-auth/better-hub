export interface IssueItem {
	id: number;
	title: string;
	html_url: string;
	number: number;
	state: string;
	created_at: string;
	updated_at: string;
	repository_url: string;
	user: { login: string; avatar_url: string } | null;
	labels: Array<{ name?: string; color?: string }>;
	draft?: boolean;
	pull_request?: { merged_at?: string | null };
	comments: number;
}

export interface RepoItem {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	stargazers_count: number;
	forks_count: number;
	language: string | null;
	updated_at: string | null;
	visibility?: string;
	private: boolean;
	open_issues_count: number;
	owner: { login: string; avatar_url: string };
}

export interface NotificationItem {
	id: string;
	reason: string;
	subject: { title: string; type: string; url?: string | null };
	repository: { full_name: string; html_url?: string };
	updated_at: string;
	unread: boolean;
}

export interface ActivityEvent {
	id: string;
	type: string | null;
	repo: { name: string };
	created_at: string | null;
	payload: {
		action?: string;
		ref?: string | null;
		ref_type?: string;
		commits?: Array<{ message: string; sha: string }>;
		pull_request?: {
			number?: number;
			title?: string;
			body?: string | null;
			url?: string;
			html_url?: string;
			state?: string;
			draft?: boolean;
			merged?: boolean;
			merged_at?: string | null;
			comments?: number;
			additions?: number;
			deletions?: number;
			changed_files?: number;
			commits?: number;
		};
		issue?: {
			number?: number;
			title?: string;
			body?: string | null;
			url?: string;
			html_url?: string;
			state?: string;
			comments?: number;
		};
		comment?: { body?: string; id?: number; url?: string; html_url?: string };
		size?: number;
		release?: { tag_name?: string; name?: string };
		member?: { login?: string };
	};
}

export interface ContributionRepositoryRef {
	nameWithOwner?: string | null;
	url?: string | null;
	primaryLanguage?: { name?: string | null } | null;
}

export interface CommitContributionNode {
	occurredAt?: string | null;
	commitCount?: number | null;
}

export interface PullRequestContributionNode {
	occurredAt?: string | null;
	pullRequest?: {
		number?: number | null;
		title?: string | null;
		url?: string | null;
		state?: "OPEN" | "CLOSED" | "MERGED" | null;
		merged?: boolean | null;
		additions?: number | null;
		deletions?: number | null;
		changedFiles?: number | null;
		comments?: { totalCount?: number | null } | null;
		commits?: { totalCount?: number | null } | null;
	} | null;
}

export interface IssueContributionNode {
	occurredAt?: string | null;
	issue?: {
		number?: number | null;
		title?: string | null;
		url?: string | null;
		state?: "OPEN" | "CLOSED" | null;
		comments?: { totalCount?: number | null } | null;
	} | null;
}

export interface RepositoryContributionNode {
	occurredAt?: string | null;
	repository?: ContributionRepositoryRef | null;
}

export interface ContributionActivityConnection<TNode> {
	repository?: ContributionRepositoryRef | null;
	contributions?: {
		totalCount?: number | null;
		nodes?: TNode[] | null;
	} | null;
}

export interface ContributionActivity {
	commitContributionsByRepository?: Array<
		ContributionActivityConnection<CommitContributionNode>
	>;
	pullRequestContributionsByRepository?: Array<
		ContributionActivityConnection<PullRequestContributionNode>
	>;
	pullRequestReviewContributionsByRepository?: Array<
		ContributionActivityConnection<PullRequestContributionNode>
	>;
	issueContributionsByRepository?: Array<
		ContributionActivityConnection<IssueContributionNode>
	>;
	repositoryContributions?: {
		totalCount?: number | null;
		nodes?: RepositoryContributionNode[] | null;
	} | null;
}

export interface TrendingRepoItem {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	stargazers_count: number;
	forks_count: number;
	language: string | null;
	created_at: string | null;
	owner: { login: string; avatar_url: string } | null;
}

export interface GitHubUser {
	login: string;
	avatar_url: string;
	name: string | null;
	public_repos: number;
	followers: number;
	following: number;
}

export interface SearchResult<T> {
	items: Array<T>;
	total_count: number;
}
