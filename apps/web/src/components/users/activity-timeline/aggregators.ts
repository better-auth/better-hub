import type { ActivityEvent } from "@/lib/github-types";
import type {
	ContributionData,
	ContributionMonthAccumulator,
	CreatedRepoEntry,
	EventActivityItem,
	EventMonthGroup,
	IssueEntry,
	PullRequestEntry,
	TimelineMonthGroup,
} from "./types";
import {
	getPullRequestStatusFromContribution,
	mergeCommitActivity,
	mergeIssueEntries,
	mergePullRequestEntries,
} from "./helpers";

function monthFromDate(value: string): string {
	return value.slice(0, 7);
}

export function buildMonthActivityItems(monthEvents: ActivityEvent[]): EventActivityItem[] {
	const commitCountByRepo = new Map<string, number>();
	const commitMessagesBySha = new Map<
		string,
		{
			id: string;
			repoName: string;
			sha?: string;
			message: string;
			createdAt: string;
		}
	>();
	const pullRequests: PullRequestEntry[] = [];
	const issues: IssueEntry[] = [];
	const createdRepos: CreatedRepoEntry[] = [];
	let otherEvents = 0;

	for (const event of monthEvents) {
		const createdAt = event.created_at ?? new Date(0).toISOString();
		const repoName = event.repo?.name ?? "unknown/repo";
		const repoHref = `/${repoName}`;
		const payload = event.payload ?? {};

		if (event.type === "PushEvent") {
			const commitCount = payload.size ?? payload.commits?.length ?? 0;
			if (commitCount > 0) {
				const current = commitCountByRepo.get(repoName) ?? 0;
				commitCountByRepo.set(repoName, current + commitCount);
			}
			for (const commit of payload.commits ?? []) {
				const id = `${repoName}-${commit.sha ?? commit.message}`;
				if (commitMessagesBySha.has(id)) continue;
				commitMessagesBySha.set(id, {
					id,
					repoName,
					sha: commit.sha,
					message: commit.message,
					createdAt,
				});
			}
			continue;
		}

		if (event.type === "CreateEvent" && payload.ref_type === "repository") {
			createdRepos.push({
				id: event.id,
				repoName,
				createdAt,
				href: repoHref,
			});
			continue;
		}

		if (event.type === "PullRequestEvent") {
			const pr = payload.pull_request;
			const status =
				payload.action === "closed" && pr?.merged
					? "merged"
					: payload.action === "closed"
						? "closed"
						: "open";
			const entry: PullRequestEntry = {
				id: event.id,
				repoName,
				number: pr?.number,
				title: pr?.title,
				createdAt,
				href: pr?.number ? `${repoHref}/pulls/${pr.number}` : repoHref,
				status,
				action:
					payload.action === "opened"
						? "opened"
						: payload.action === "closed" && pr?.merged
							? "merged"
							: payload.action === "closed"
								? "closed"
								: "opened",
				comments: pr?.comments,
				additions: pr?.additions,
				deletions: pr?.deletions,
				changedFiles: pr?.changed_files,
				commits: pr?.commits,
			};
			if (
				payload.action === "opened" ||
				(payload.action === "closed" && pr?.merged) ||
				payload.action === "closed"
			) {
				pullRequests.push(entry);
			} else {
				otherEvents++;
			}
			continue;
		}

		if (event.type === "IssuesEvent" || event.type === "IssueCommentEvent") {
			const issue = payload.issue;
			const issueAction =
				event.type === "IssueCommentEvent" ||
				payload.action === "opened" ||
				payload.action === "closed" ||
				payload.action === "reopened";
			if (issue && issueAction) {
				issues.push({
					id: event.id,
					repoName,
					number: issue.number,
					title: issue.title,
					createdAt,
					href:
						issue.html_url ??
						(issue.number
							? `${repoHref}/issues/${issue.number}`
							: repoHref),
					status: issue.state === "closed" ? "closed" : "open",
					comments: issue.comments,
				});
				continue;
			}
		}

		otherEvents++;
	}

	const items: EventActivityItem[] = [];
	const repositories = [...commitCountByRepo.entries()]
		.map(([repoName, count]) => ({ repoName, count }))
		.sort((a, b) => b.count - a.count);
	const commitMessages = [...commitMessagesBySha.values()]
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		.slice(0, 3);
	const totalCommits = repositories.reduce((sum, repo) => sum + repo.count, 0);
	if (totalCommits > 0) {
		items.push({
			kind: "commits",
			totalCommits,
			repositories,
			commitMessages,
		});
	}

	if (pullRequests.length > 0) {
		pullRequests.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
		items.push({ kind: "pull_requests", items: pullRequests });
	}

	if (createdRepos.length > 0) {
		createdRepos.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
		items.push({ kind: "repositories", items: createdRepos });
	}

	if (issues.length > 0) {
		issues.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
		items.push({ kind: "issues", items: issues });
	}

	if (items.length === 0 && otherEvents > 0) {
		items.push({ kind: "other", total: otherEvents });
	}

	return items;
}

export function groupEventsByMonth(sortedEvents: ActivityEvent[]): EventMonthGroup[] {
	const byMonth = new Map<string, ActivityEvent[]>();
	for (const event of sortedEvents) {
		if (!event.created_at) continue;
		const monthKey = event.created_at.slice(0, 7);
		const current = byMonth.get(monthKey);
		if (current) current.push(event);
		else byMonth.set(monthKey, [event]);
	}
	return [...byMonth.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([monthKey, monthEvents]) => ({
			kind: "events" as const,
			key: monthKey,
			year: Number(monthKey.slice(0, 4)),
			items: buildMonthActivityItems(monthEvents),
		}))
		.filter((monthGroup) => monthGroup.items.length > 0);
}

export function buildContributionMonthGroups(contributions: ContributionData | null) {
	if (!contributions) return [];

	const sourceWeeks = contributions.timelineWeeks ?? contributions.weeks;
	const sortedDays = sourceWeeks
		.flatMap((week) => week.contributionDays)
		.filter((day) => day.contributionCount > 0)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	const byMonth = new Map<string, ContributionMonthAccumulator>();
	const ensureMonth = (monthKey: string): ContributionMonthAccumulator => {
		const existing = byMonth.get(monthKey);
		if (existing) return existing;
		const created: ContributionMonthAccumulator = {
			days: [],
			commitCountByRepo: new Map<string, number>(),
			pullRequests: [],
			issues: [],
			createdRepos: [],
		};
		byMonth.set(monthKey, created);
		return created;
	};

	for (const day of sortedDays) {
		ensureMonth(monthFromDate(day.date)).days.push(day);
	}

	const activity = contributions.activity;

	for (const repoGroup of activity?.commitContributionsByRepository ?? []) {
		const repoName = repoGroup.repository?.nameWithOwner ?? "unknown/repo";
		for (const node of repoGroup.contributions?.nodes ?? []) {
			if (!node?.occurredAt) continue;
			const month = monthFromDate(node.occurredAt);
			const monthBucket = ensureMonth(month);
			const current = monthBucket.commitCountByRepo.get(repoName) ?? 0;
			monthBucket.commitCountByRepo.set(
				repoName,
				current + (node.commitCount ?? 0),
			);
		}
	}

	for (const repoGroup of activity?.pullRequestContributionsByRepository ?? []) {
		const repoName = repoGroup.repository?.nameWithOwner ?? "unknown/repo";
		for (const node of repoGroup.contributions?.nodes ?? []) {
			if (!node?.occurredAt) continue;
			const pr = node.pullRequest;
			const monthBucket = ensureMonth(monthFromDate(node.occurredAt));
			monthBucket.pullRequests.push({
				id: `${repoName}-${pr?.number ?? "pr"}-${node.occurredAt}`,
				repoName,
				number: pr?.number ?? undefined,
				title: pr?.title ?? undefined,
				createdAt: node.occurredAt,
				href:
					pr?.url ??
					(pr?.number
						? `/${repoName}/pulls/${pr.number}`
						: `/${repoName}`),
				status: getPullRequestStatusFromContribution(node),
				action: "opened",
				comments: pr?.comments?.totalCount ?? undefined,
				additions: pr?.additions ?? undefined,
				deletions: pr?.deletions ?? undefined,
				changedFiles: pr?.changedFiles ?? undefined,
				commits: pr?.commits?.totalCount ?? undefined,
				language: repoGroup.repository?.primaryLanguage?.name ?? null,
			});
		}
	}

	for (const repoGroup of activity?.pullRequestReviewContributionsByRepository ?? []) {
		const repoName = repoGroup.repository?.nameWithOwner ?? "unknown/repo";
		for (const node of repoGroup.contributions?.nodes ?? []) {
			if (!node?.occurredAt) continue;
			const pr = node.pullRequest;
			const monthBucket = ensureMonth(monthFromDate(node.occurredAt));
			monthBucket.pullRequests.push({
				id: `${repoName}-review-${pr?.number ?? "pr"}-${node.occurredAt}`,
				repoName,
				number: pr?.number ?? undefined,
				title: pr?.title ?? undefined,
				createdAt: node.occurredAt,
				href:
					pr?.url ??
					(pr?.number
						? `/${repoName}/pulls/${pr.number}`
						: `/${repoName}`),
				status: getPullRequestStatusFromContribution(node),
				action: "reviewed",
				comments: pr?.comments?.totalCount ?? undefined,
				additions: pr?.additions ?? undefined,
				deletions: pr?.deletions ?? undefined,
				changedFiles: pr?.changedFiles ?? undefined,
				commits: pr?.commits?.totalCount ?? undefined,
				language: repoGroup.repository?.primaryLanguage?.name ?? null,
			});
		}
	}

	for (const repoGroup of activity?.issueContributionsByRepository ?? []) {
		const repoName = repoGroup.repository?.nameWithOwner ?? "unknown/repo";
		for (const node of repoGroup.contributions?.nodes ?? []) {
			if (!node?.occurredAt) continue;
			const issue = node.issue;
			const monthBucket = ensureMonth(monthFromDate(node.occurredAt));
			monthBucket.issues.push({
				id: `${repoName}-issue-${issue?.number ?? "issue"}-${node.occurredAt}`,
				repoName,
				number: issue?.number ?? undefined,
				title: issue?.title ?? undefined,
				createdAt: node.occurredAt,
				href:
					issue?.url ??
					(issue?.number
						? `/${repoName}/issues/${issue.number}`
						: `/${repoName}`),
				status: issue?.state === "CLOSED" ? "closed" : "open",
				comments: issue?.comments?.totalCount ?? undefined,
			});
		}
	}

	for (const node of activity?.repositoryContributions?.nodes ?? []) {
		if (!node?.occurredAt) continue;
		const repoName = node.repository?.nameWithOwner ?? "unknown/repo";
		const monthBucket = ensureMonth(monthFromDate(node.occurredAt));
		monthBucket.createdRepos.push({
			id: `repo-${repoName}-${node.occurredAt}`,
			repoName,
			createdAt: node.occurredAt,
			href: node.repository?.url ?? `/${repoName}`,
			language: node.repository?.primaryLanguage?.name ?? null,
		});
	}

	return [...byMonth.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([monthKey, monthData]) => {
			const items: EventActivityItem[] = [];
			const commitRepos = [...monthData.commitCountByRepo.entries()]
				.map(([repoName, count]) => ({ repoName, count }))
				.filter((repo) => repo.count > 0)
				.sort((a, b) => b.count - a.count);
			const totalCommits = commitRepos.reduce((sum, repo) => sum + repo.count, 0);
			if (totalCommits > 0) {
				items.push({
					kind: "commits",
					totalCommits,
					repositories: commitRepos,
					commitMessages: [],
				});
			}

			if (monthData.createdRepos.length > 0) {
				const rows = [...monthData.createdRepos].sort(
					(a, b) =>
						new Date(b.createdAt).getTime() -
						new Date(a.createdAt).getTime(),
				);
				items.push({ kind: "repositories", items: rows });
			}

			if (monthData.pullRequests.length > 0) {
				const rows = [...monthData.pullRequests].sort(
					(a, b) =>
						new Date(b.createdAt).getTime() -
						new Date(a.createdAt).getTime(),
				);
				items.push({ kind: "pull_requests", items: rows });
			}

			if (monthData.issues.length > 0) {
				const rows = [...monthData.issues].sort(
					(a, b) =>
						new Date(b.createdAt).getTime() -
						new Date(a.createdAt).getTime(),
				);
				items.push({ kind: "issues", items: rows });
			}

			return {
				kind: "contributions" as const,
				key: monthKey,
				year: Number(monthKey.slice(0, 4)),
				days: monthData.days,
				items,
			};
		});
}

export function buildProfileRepoMonthMap(
	profileRepos:
		| { full_name: string; created_at: string | null; language?: string | null }[]
		| undefined,
): Map<string, CreatedRepoEntry[]> {
	const byMonth = new Map<string, CreatedRepoEntry[]>();
	if (!profileRepos || profileRepos.length === 0) return byMonth;
	for (const repo of profileRepos) {
		if (!repo.created_at) continue;
		const monthKey = repo.created_at.slice(0, 7);
		const current = byMonth.get(monthKey) ?? [];
		current.push({
			id: `profile-repo-${repo.full_name}`,
			repoName: repo.full_name,
			createdAt: repo.created_at,
			href: `/${repo.full_name}`,
			language: repo.language ?? null,
		});
		byMonth.set(monthKey, current);
	}
	for (const [monthKey, items] of byMonth.entries()) {
		items.sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
		byMonth.set(monthKey, items);
	}
	return byMonth;
}

export function mergeMonthGroups(
	eventMonthGroups: EventMonthGroup[],
	contributionMonthGroups: TimelineMonthGroup[],
) {
	if (eventMonthGroups.length === 0) return contributionMonthGroups;
	if (contributionMonthGroups.length === 0) return eventMonthGroups;
	const eventsByKey = new Map(eventMonthGroups.map((group) => [group.key, group]));
	const contributionsByKey = new Map(
		contributionMonthGroups.map((group) => [group.key, group]),
	);
	const monthKeys = [
		...new Set([
			...eventMonthGroups.map((group) => group.key),
			...contributionMonthGroups.map((group) => group.key),
		]),
	].sort((a, b) => b.localeCompare(a));

	return monthKeys
		.map((key) => {
			const eventGroup = eventsByKey.get(key);
			const contributionGroup = contributionsByKey.get(key);
			if (eventGroup && contributionGroup) {
				const eventKinds = new Set(
					eventGroup.items.map((item) => item.kind),
				);
				const mergedItems = [...eventGroup.items];
				for (const contributionItem of contributionGroup.items) {
					if (eventKinds.has(contributionItem.kind)) {
						if (contributionItem.kind === "repositories") {
							const existingIndex = mergedItems.findIndex(
								(item) =>
									item.kind ===
									"repositories",
							);
							if (existingIndex >= 0) {
								const existing =
									mergedItems[existingIndex];
								if (
									existing &&
									existing.kind ===
										"repositories"
								) {
									const byId = new Map(
										existing.items.map(
											(repo) => [
												repo.id,
												repo,
											],
										),
									);
									for (const repo of contributionItem.items) {
										if (
											!byId.has(
												repo.id,
											)
										)
											byId.set(
												repo.id,
												repo,
											);
									}
									existing.items = [
										...byId.values(),
									].sort(
										(a, b) =>
											new Date(
												b.createdAt,
											).getTime() -
											new Date(
												a.createdAt,
											).getTime(),
									);
								}
							}
						} else if (
							contributionItem.kind === "pull_requests"
						) {
							const existingIndex = mergedItems.findIndex(
								(item) =>
									item.kind ===
									"pull_requests",
							);
							if (existingIndex >= 0) {
								const existing =
									mergedItems[existingIndex];
								if (
									existing &&
									existing.kind ===
										"pull_requests"
								) {
									existing.items =
										mergePullRequestEntries(
											existing.items,
											contributionItem.items,
										);
								}
							}
						} else if (contributionItem.kind === "issues") {
							const existingIndex = mergedItems.findIndex(
								(item) => item.kind === "issues",
							);
							if (existingIndex >= 0) {
								const existing =
									mergedItems[existingIndex];
								if (
									existing &&
									existing.kind === "issues"
								) {
									existing.items =
										mergeIssueEntries(
											existing.items,
											contributionItem.items,
										);
								}
							}
						} else if (contributionItem.kind === "commits") {
							const existingIndex = mergedItems.findIndex(
								(item) => item.kind === "commits",
							);
							if (existingIndex >= 0) {
								const existing =
									mergedItems[existingIndex];
								if (
									existing &&
									existing.kind === "commits"
								) {
									mergedItems[existingIndex] =
										mergeCommitActivity(
											existing,
											contributionItem,
										);
								}
							}
						}
						continue;
					}
					mergedItems.push(contributionItem);
				}
				return {
					...eventGroup,
					items: mergedItems,
				} satisfies EventMonthGroup;
			}
			return eventGroup ?? contributionGroup ?? null;
		})
		.filter((group): group is TimelineMonthGroup => group !== null);
}

export function mergeProfileReposIntoMonths(
	monthGroups: TimelineMonthGroup[],
	profileRepoMonthMap: Map<string, CreatedRepoEntry[]>,
) {
	const byKey = new Map(monthGroups.map((group) => [group.key, group]));
	for (const [monthKey, reposForMonth] of profileRepoMonthMap.entries()) {
		const existing = byKey.get(monthKey);
		if (!existing) {
			byKey.set(monthKey, {
				kind: "events",
				key: monthKey,
				year: Number(monthKey.slice(0, 4)),
				items: [{ kind: "repositories", items: reposForMonth }],
			});
			continue;
		}
		const alreadyHasRepositories = existing.items.some(
			(item) => item.kind === "repositories",
		);
		if (alreadyHasRepositories) continue;
		byKey.set(monthKey, {
			...existing,
			items: [{ kind: "repositories", items: reposForMonth }, ...existing.items],
		});
	}
	return [...byKey.values()].sort((a, b) => b.key.localeCompare(a.key));
}
