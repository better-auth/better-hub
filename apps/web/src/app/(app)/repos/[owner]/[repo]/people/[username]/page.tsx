import { Suspense } from "react";
import { getUser, getPersonRepoActivity, getRepoContributorStats } from "@/lib/github";
import { PersonDetail } from "@/components/people/person-detail";

export default async function PersonPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; username: string }>;
}) {
	const { owner, repo, username } = await params;

	const [user, activity, allStats] = await Promise.all([
		getUser(username),
		getPersonRepoActivity(owner, repo, username),
		getRepoContributorStats(owner, repo),
	]);

	const userStats = allStats.find((s) => s.login.toLowerCase() === username.toLowerCase());
	const weeklyData = userStats?.weeks ?? [];

	return (
		<Suspense fallback={<PersonDetailSkeleton />}>
			<PersonDetail
				owner={owner}
				repo={repo}
				user={user}
				activity={activity}
				weeklyData={weeklyData}
			/>
		</Suspense>
	);
}

function PersonDetailSkeleton() {
	return (
		<div className="animate-pulse space-y-4">
			<div className="flex items-center gap-4">
				<div className="w-12 h-12 rounded-full bg-muted shrink-0" />
				<div className="space-y-1.5">
					<div className="h-4 w-32 rounded bg-muted" />
					<div className="h-3 w-20 rounded bg-muted/60" />
				</div>
			</div>
			<div className="grid grid-cols-4 gap-2">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="h-14 rounded border border-border/40 bg-muted/20" />
				))}
			</div>
			<div className="h-48 rounded border border-border/40 bg-muted/20" />
		</div>
	);
}
