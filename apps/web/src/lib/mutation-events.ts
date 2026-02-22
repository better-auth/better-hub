// ── PR Events ─────────────────────────────────────────────────

export type PRMergedEvent = { type: "pr:merged"; owner: string; repo: string; number: number };
export type PRClosedEvent = { type: "pr:closed"; owner: string; repo: string; number: number };
export type PRReopenedEvent = { type: "pr:reopened"; owner: string; repo: string; number: number };
export type PRCommentedEvent = {
	type: "pr:commented";
	owner: string;
	repo: string;
	number: number;
};
export type PRReviewedEvent = { type: "pr:reviewed"; owner: string; repo: string; number: number };
export type PRRenamedEvent = { type: "pr:renamed"; owner: string; repo: string; number: number };
export type PRBranchUpdatedEvent = {
	type: "pr:branch-updated";
	owner: string;
	repo: string;
	number: number;
};
export type PRSuggestionCommittedEvent = {
	type: "pr:suggestion-committed";
	owner: string;
	repo: string;
	number: number;
};
export type PRFileCommittedEvent = {
	type: "pr:file-committed";
	owner: string;
	repo: string;
	number: number;
};
export type PRThreadResolvedEvent = {
	type: "pr:thread-resolved";
	owner: string;
	repo: string;
	number: number;
};
export type PRThreadUnresolvedEvent = {
	type: "pr:thread-unresolved";
	owner: string;
	repo: string;
	number: number;
};
export type PRConflictResolvedEvent = {
	type: "pr:conflict-resolved";
	owner: string;
	repo: string;
	number: number;
};

// ── Issue Events ──────────────────────────────────────────────

export type IssueClosedEvent = {
	type: "issue:closed";
	owner: string;
	repo: string;
	number: number;
};
export type IssueReopenedEvent = {
	type: "issue:reopened";
	owner: string;
	repo: string;
	number: number;
};
export type IssueCreatedEvent = {
	type: "issue:created";
	owner: string;
	repo: string;
	number: number;
};
export type IssueCommentedEvent = {
	type: "issue:commented";
	owner: string;
	repo: string;
	number: number;
};

// ── Repo Events ───────────────────────────────────────────────

export type RepoStarredEvent = { type: "repo:starred"; owner: string; repo: string };
export type RepoUnstarredEvent = { type: "repo:unstarred"; owner: string; repo: string };
export type RepoCreatedEvent = { type: "repo:created"; owner: string; repo: string };
export type RepoFileCommittedEvent = { type: "repo:file-committed"; owner: string; repo: string };
export type RepoBranchDeletedEvent = { type: "repo:branch-deleted"; owner: string; repo: string };

// ── Prompt Events ─────────────────────────────────────────────

export type PromptCreatedEvent = { type: "prompt:created"; owner: string; repo: string };
export type PromptAcceptedEvent = { type: "prompt:accepted"; owner: string; repo: string };
export type PromptRejectedEvent = { type: "prompt:rejected"; owner: string; repo: string };
export type PromptResetEvent = { type: "prompt:reset"; owner: string; repo: string };
export type PromptDeletedEvent = { type: "prompt:deleted"; owner: string; repo: string };

// ── Pin Events ───────────────────────────────────────────────

export type PinAddedEvent = {
	type: "pin:added";
	owner: string;
	repo: string;
	url: string;
	title: string;
	itemType: string;
};
export type PinRemovedEvent = { type: "pin:removed"; owner: string; repo: string; url: string };

// ── Settings Events ───────────────────────────────────────────

export type SettingsUpdatedEvent = { type: "settings:updated" };
export type CodeThemeCreatedEvent = { type: "code-theme:created" };
export type CodeThemeDeletedEvent = { type: "code-theme:deleted" };
export type GitHubAccountAddedEvent = { type: "github-account:added" };
export type GitHubAccountRemovedEvent = { type: "github-account:removed" };
export type GitHubAccountSwitchedEvent = { type: "github-account:switched" };

// ── Discriminated Union ───────────────────────────────────────

export type MutationEvent =
	| PRMergedEvent
	| PRClosedEvent
	| PRReopenedEvent
	| PRCommentedEvent
	| PRReviewedEvent
	| PRRenamedEvent
	| PRBranchUpdatedEvent
	| PRSuggestionCommittedEvent
	| PRFileCommittedEvent
	| PRThreadResolvedEvent
	| PRThreadUnresolvedEvent
	| PRConflictResolvedEvent
	| IssueClosedEvent
	| IssueReopenedEvent
	| IssueCreatedEvent
	| IssueCommentedEvent
	| RepoStarredEvent
	| RepoUnstarredEvent
	| RepoCreatedEvent
	| RepoFileCommittedEvent
	| RepoBranchDeletedEvent
	| PromptCreatedEvent
	| PromptAcceptedEvent
	| PromptRejectedEvent
	| PromptResetEvent
	| PromptDeletedEvent
	| PinAddedEvent
	| PinRemovedEvent
	| SettingsUpdatedEvent
	| CodeThemeCreatedEvent
	| CodeThemeDeletedEvent
	| GitHubAccountAddedEvent
	| GitHubAccountRemovedEvent
	| GitHubAccountSwitchedEvent;

export type MutationEventType = MutationEvent["type"];

// ── Helpers ───────────────────────────────────────────────────

export function isRepoEvent(event: MutationEvent, owner: string, repo: string): boolean {
	return "owner" in event && "repo" in event && event.owner === owner && event.repo === repo;
}
