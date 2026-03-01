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

export type NotificationEntityType = "pull" | "issue" | "repo" | "unknown";

export type NotificationStatusKind =
	| "failed"
	| "running"
	| "passed"
	| "review_requested"
	| "mention"
	| "comment"
	| "security"
	| "state_change"
	| "info";

export interface NotificationEntityRef {
	owner: string;
	repo: string;
	type: NotificationEntityType;
	number?: number;
}

export interface NotificationActor {
	login: string;
	avatarUrl?: string;
}

export interface NotificationCISummary {
	state: "pending" | "success" | "failure" | "error";
	total: number;
	success: number;
	failure: number;
	pending: number;
	primaryRunId?: number | null;
}

export interface NotificationEnrichedItem {
	id: string;
	unread: boolean;
	updatedAt: string;
	reason: string;
	subjectType: string;
	title: string;
	repoFullName: string;
	href: string;
	entity: NotificationEntityRef;
	actor?: NotificationActor | null;
	statusKind: NotificationStatusKind;
	ci?: NotificationCISummary | null;
	contextLine: string;
	primaryAction: {
		label: string;
		href: string;
	};
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
		pull_request?: { title: string; number: number; merged?: boolean };
		issue?: { title: string; number: number };
		comment?: { body?: string };
		size?: number;
		release?: { tag_name?: string; name?: string };
		member?: { login?: string };
	};
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
