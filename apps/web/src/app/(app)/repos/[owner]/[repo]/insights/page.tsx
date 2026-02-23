import type { Metadata } from "next";
import {
	getRepo,
	getCommitActivity,
	getCodeFrequency,
	getWeeklyParticipation,
	getLanguages,
	getRepoContributorStats,
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

	return (
		<InsightsView
			repo={repoData}
			commitActivity={commitActivity}
			codeFrequency={codeFrequency}
			participation={participation}
			languages={languages}
			contributors={contributors}
		/>
	);
}
