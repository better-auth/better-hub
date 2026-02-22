import { Suspense } from "react";
import {
	getRepo,
	getCommitActivity,
	getCodeFrequency,
	getWeeklyParticipation,
	getLanguages,
	getRepoContributorStats,
} from "@/lib/github";
import { InsightsView } from "@/components/repo/insights-view";

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
		<Suspense fallback={<InsightsViewSkeleton />}>
			<InsightsView
				repo={repoData}
				commitActivity={commitActivity}
				codeFrequency={codeFrequency}
				participation={participation}
				languages={languages}
				contributors={contributors}
			/>
		</Suspense>
	);
}

function InsightsViewSkeleton() {
	return (
		<div className="space-y-4 animate-pulse">
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="flex flex-col gap-1 px-3 py-2.5 border border-dashed border-border/60">
						<div className="h-2.5 w-12 rounded bg-muted/60" />
						<div className="h-4 w-16 rounded bg-muted" />
					</div>
				))}
			</div>
			<div className="border border-dashed border-border/60 p-4">
				<div className="h-4 w-32 rounded bg-muted mb-4" />
				<div className="h-40 rounded bg-muted/40" />
			</div>
		</div>
	);
}
