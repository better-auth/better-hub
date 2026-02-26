import type { Metadata } from "next";
import { getRepoPageData } from "@/lib/github";
import { TrackView } from "@/components/shared/track-view";
import { RepoOverview, type RepoOverviewProps } from "@/components/repo/repo-overview";
import {
	getCachedOverviewPRs,
	getCachedOverviewIssues,
	getCachedOverviewEvents,
	getCachedOverviewCommitActivity,
	getCachedOverviewCI,
} from "@/lib/repo-data-cache";
import { ogImageUrl, ogImages } from "@/lib/og/og-utils";
import { fetchPinnedItemsForRepo } from "./pin-actions";
import { revalidateReadme } from "./readme-actions";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	const ogUrl = ogImageUrl({ type: "repo", owner, repo });
	return {
		title: `${owner}/${repo}`,
		description: `View ${owner}/${repo} on Better Hub`,
		openGraph: { title: `${owner}/${repo}`, ...ogImages(ogUrl) },
		twitter: { card: "summary_large_image", ...ogImages(ogUrl) },
	};
}

export default async function RepoPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const pageDataPromise = getRepoPageData(owner, repo);

	const pageDataResult = await pageDataPromise;
	if (!pageDataResult.success) return null;

	const { repoData, navCounts } = pageDataResult.data;
	const { permissions } = repoData;
	const isMaintainer = permissions.push || permissions.admin || permissions.maintain;

	// Cache data is opaque to the server — passed through as initialData to client useQuery hooks
	const [
		readmeHtml,
		initialPRs,
		initialIssues,
		initialEvents,
		initialCommitActivity,
		initialCIStatus,
		initialPinnedItems,
	] = (await Promise.all([
		revalidateReadme(owner, repo, repoData.default_branch),
		isMaintainer ? getCachedOverviewPRs(owner, repo) : null,
		isMaintainer ? getCachedOverviewIssues(owner, repo) : null,
		isMaintainer ? getCachedOverviewEvents(owner, repo) : null,
		isMaintainer ? getCachedOverviewCommitActivity(owner, repo) : null,
		isMaintainer ? getCachedOverviewCI(owner, repo) : null,
		isMaintainer ? fetchPinnedItemsForRepo(owner, repo) : null,
	])) as [
		string | null,
		RepoOverviewProps["initialPRs"],
		RepoOverviewProps["initialIssues"],
		RepoOverviewProps["initialEvents"],
		RepoOverviewProps["initialCommitActivity"],
		RepoOverviewProps["initialCIStatus"],
		RepoOverviewProps["initialPinnedItems"],
	];

	return (
		<div className={isMaintainer ? "flex flex-col flex-1 min-h-0" : undefined}>
			<TrackView
				type="repo"
				url={`/${owner}/${repo}`}
				title={`${owner}/${repo}`}
				subtitle={repoData.description || "No description"}
				image={repoData.owner.avatar_url}
			/>
			<RepoOverview
				owner={owner}
				repo={repo}
				repoData={repoData}
				isMaintainer={isMaintainer}
				openPRCount={navCounts.openPrs}
				openIssueCount={navCounts.openIssues}
				defaultBranch={repoData.default_branch}
				initialReadmeHtml={readmeHtml}
				initialPRs={initialPRs}
				initialIssues={initialIssues}
				initialEvents={initialEvents}
				initialCommitActivity={initialCommitActivity}
				initialCIStatus={initialCIStatus}
				initialPinnedItems={initialPinnedItems}
			/>
		</div>
	);
}
