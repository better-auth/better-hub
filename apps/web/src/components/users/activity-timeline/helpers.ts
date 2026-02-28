import { cn } from "@/lib/utils";
import type {
	CommitActivityItem,
	CommitMessage,
	EventActivityItem,
	ExpandableItemKind,
	IssueEntry,
	IssueStatus,
	PullRequestContributionNode,
	PullRequestEntry,
	PullRequestStatus,
} from "./types";

export const DEFAULT_VISIBLE_ROWS: Record<ExpandableItemKind, number> = {
	pull_requests: 8,
	issues: 6,
	repositories: 6,
};

export const SHOW_MORE_INCREMENT: Record<ExpandableItemKind, number> = {
	pull_requests: 8,
	issues: 6,
	repositories: 6,
};

export function monthLabel(monthKey: string): string {
	return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

export function getPullRequestStatusFromContribution(
	node: PullRequestContributionNode,
): PullRequestStatus {
	if (node.pullRequest?.merged) return "merged";
	if (node.pullRequest?.state === "CLOSED") return "closed";
	return "open";
}

export function statusTextClass(status: PullRequestStatus | IssueStatus): string {
	switch (status) {
		case "merged":
			return "text-alert-important";
		case "closed":
			return "text-destructive";
		default:
			return "text-success";
	}
}

export function statusDotClass(status: PullRequestStatus | IssueStatus): string {
	return status === "merged"
		? "bg-alert-important"
		: status === "closed"
			? "bg-destructive"
			: "bg-success";
}

export function timelineItemHeading(item: EventActivityItem): string {
	if (item.kind === "commits") return `Commits (${item.totalCommits})`;
	if (item.kind === "repositories") return "Repositories created";
	if (item.kind === "pull_requests") return "Pull requests";
	if (item.kind === "issues") return "Issues opened";
	return "Other activity";
}

export function timelineItemDescription(item: EventActivityItem): string {
	if (item.kind === "commits") {
		return `${pluralize(item.totalCommits, "commit")} across ${pluralize(item.repositories.length, "repository", "repositories")}`;
	}
	if (item.kind === "repositories") {
		return pluralize(item.items.length, "new repository", "new repositories");
	}
	if (item.kind === "pull_requests") {
		const repos = new Set(item.items.map((entry) => entry.repoName)).size;
		return `${pluralize(item.items.length, "event")} across ${pluralize(repos, "repository", "repositories")}`;
	}
	if (item.kind === "issues") {
		const repos = new Set(item.items.map((entry) => entry.repoName)).size;
		return `${pluralize(item.items.length, "issue")} across ${pluralize(repos, "repository", "repositories")}`;
	}
	return pluralize(item.total, "additional event");
}

export function pullRequestStatusCounts(items: PullRequestEntry[]) {
	const counts: Record<PullRequestStatus, number> = {
		open: 0,
		merged: 0,
		closed: 0,
	};
	for (const entry of items) {
		if (!entry.status) continue;
		counts[entry.status] += 1;
	}
	return counts;
}

export function pullRequestActionLabel(action: PullRequestEntry["action"]): string {
	if (action === "reviewed") return "reviewed pull request";
	return `${action} pull request`;
}

export function monthContributionSummary(days: { contributionCount: number }[]): string {
	const total = days.reduce((sum, day) => sum + day.contributionCount, 0);
	if (days.length === 0) {
		return "Contribution activity captured from repository events";
	}
	return `${pluralize(total, "contribution")} across ${pluralize(days.length, "day")}`;
}

export function mergePullRequestEntries(
	existing: PullRequestEntry[],
	incoming: PullRequestEntry[],
): PullRequestEntry[] {
	const byKey = new Map(
		existing.map((entry) => [
			`${entry.repoName}#${entry.number ?? "na"}:${entry.action}`,
			entry,
		]),
	);
	for (const entry of incoming) {
		const key = `${entry.repoName}#${entry.number ?? "na"}:${entry.action}`;
		if (!byKey.has(key)) byKey.set(key, entry);
	}
	return [...byKey.values()].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
}

export function mergeIssueEntries(existing: IssueEntry[], incoming: IssueEntry[]): IssueEntry[] {
	const byKey = new Map(
		existing.map((entry) => [
			`${entry.repoName}#${entry.number ?? "na"}:${entry.status ?? "unknown"}`,
			entry,
		]),
	);
	for (const entry of incoming) {
		const key = `${entry.repoName}#${entry.number ?? "na"}:${entry.status ?? "unknown"}`;
		if (!byKey.has(key)) byKey.set(key, entry);
	}
	return [...byKey.values()].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
}

export function mergeCommitActivity(
	existing: CommitActivityItem,
	incoming: CommitActivityItem,
): CommitActivityItem {
	const byRepo = new Map(existing.repositories.map((repo) => [repo.repoName, repo.count]));
	for (const repo of incoming.repositories) {
		byRepo.set(repo.repoName, Math.max(byRepo.get(repo.repoName) ?? 0, repo.count));
	}
	const repositories = [...byRepo.entries()]
		.map(([repoName, count]) => ({ repoName, count }))
		.sort((a, b) => b.count - a.count);
	const totalCommits = repositories.reduce((sum, repo) => sum + repo.count, 0);
	const byMessageId = new Map(
		existing.commitMessages.map((message: CommitMessage) => [message.id, message]),
	);
	for (const message of incoming.commitMessages) {
		if (!byMessageId.has(message.id)) byMessageId.set(message.id, message);
	}
	return {
		kind: "commits",
		totalCommits,
		repositories,
		commitMessages: [...byMessageId.values()]
			.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() -
					new Date(a.createdAt).getTime(),
			)
			.slice(0, 3),
	};
}

export function statusClass(status: PullRequestStatus | IssueStatus) {
	return cn(
		"inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide",
		statusTextClass(status),
	);
}
