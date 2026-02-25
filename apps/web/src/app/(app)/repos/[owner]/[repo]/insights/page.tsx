import type { Metadata } from "next";
import {
	getRepo,
	getCommitActivity,
	getCodeFrequency,
	getWeeklyParticipation,
	getLanguages,
	getRepoContributorStats,
	getOrgMembers,
	type WeeklyParticipation,
	type ContributorStats,
} from "@/lib/github";
import { InsightsView } from "@/components/repo/insights-view";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Insights · ${owner}/${repo}` };
}

/**
 * For org repos, GitHub's participation `owner` array is always 0.
 * We rebuild it from contributor stats by summing commits from org members.
 */
function computeOrgParticipation(
	participation: WeeklyParticipation,
	contributors: ContributorStats[],
	memberLogins: Set<string>,
): WeeklyParticipation {
	// Contributor stats and participation both cover the last 52 weeks.
	// Build a map of week-timestamp → member commits from contributor stats.
	const memberCommitsByWeek = new Map<number, number>();
	for (const contributor of contributors) {
		if (!memberLogins.has(contributor.login.toLowerCase())) continue;
		for (const week of contributor.weeks) {
			memberCommitsByWeek.set(
				week.w,
				(memberCommitsByWeek.get(week.w) ?? 0) + week.c,
			);
		}
	}

	// Contributor stats weeks may have a different length than participation (52 entries).
	// We need to align them. Participation has exactly 52 entries (oldest first).
	// Get sorted week timestamps from contributor data.
	const weekTimestamps = [...memberCommitsByWeek.keys()].sort((a, b) => a - b);
	// Take the last 52 to align with participation.
	const last52 = weekTimestamps.slice(-52);

	const memberData = participation.all.map((_, i) => {
		const ts = last52[i];
		if (ts === undefined) return 0;
		return memberCommitsByWeek.get(ts) ?? 0;
	});

	return { all: participation.all, owner: memberData };
}

export default async function InsightsPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const [repoData, commitActivity, codeFrequency, participation, languages, contributors] =
		await Promise.all([
			getRepo(owner, repo),
			getCommitActivity(owner, repo),
			getCodeFrequency(owner, repo),
			getWeeklyParticipation(owner, repo),
			getLanguages(owner, repo),
			getRepoContributorStats(owner, repo),
		]);

	if (!repoData) return null;

	const isOrg =
		(repoData as Record<string, unknown>).owner &&
		((repoData as Record<string, unknown>).owner as Record<string, unknown>)?.type ===
			"Organization";

	// For org repos with zero owner participation, compute from contributor stats + org members
	let enrichedParticipation = participation;
	if (isOrg && participation) {
		const ownerTotal = participation.owner.reduce((s, v) => s + v, 0);
		if (ownerTotal === 0 && contributors.length > 0) {
			const members = await getOrgMembers(owner);
			const memberLogins = new Set(
				(members ?? []).map((m: { login: string }) =>
					m.login.toLowerCase(),
				),
			);
			if (memberLogins.size > 0) {
				enrichedParticipation = computeOrgParticipation(
					participation,
					contributors,
					memberLogins,
				);
			}
		}
	}

	return (
		<InsightsView
			repo={repoData}
			commitActivity={commitActivity}
			codeFrequency={codeFrequency}
			participation={enrichedParticipation}
			languages={languages}
			contributors={contributors}
			isOrg={!!isOrg}
		/>
	);
}
