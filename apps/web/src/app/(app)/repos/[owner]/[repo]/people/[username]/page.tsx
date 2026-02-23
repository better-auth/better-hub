import type { Metadata } from "next";
import { getUser, getPersonRepoActivity, getRepoContributorStats } from "@/lib/github";
import { PersonDetail } from "@/components/people/person-detail";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; username: string }>;
}): Promise<Metadata> {
	const { owner, repo, username } = await params;
	return { title: `${username} · ${owner}/${repo}` };
}

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
		<PersonDetail
			owner={owner}
			repo={repo}
			user={user}
			activity={activity}
			weeklyData={weeklyData}
		/>
	);
}
