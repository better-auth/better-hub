import { Suspense } from "react";
import { getRepoPageData } from "@/lib/github";
import { TrackView } from "@/components/shared/track-view";
import { RepoOverview, type RepoOverviewProps } from "@/components/repo/repo-overview";
import { getCachedReadmeHtml } from "@/lib/readme-cache";
import {
	getCachedOverviewPRs,
	getCachedOverviewIssues,
	getCachedOverviewEvents,
	getCachedOverviewCommitActivity,
	getCachedOverviewCI,
} from "@/lib/repo-data-cache";
import { fetchPinnedItemsForRepo } from "./pin-actions";
import { revalidateReadme } from "./readme-actions";

export default async function RepoPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const pageData = await getRepoPageData(owner, repo);
	if (!pageData) return null;

	const { repoData, navCounts } = pageData;
	const { permissions } = repoData;
	const isMaintainer = permissions.push || permissions.admin || permissions.maintain;

	// Cache data is opaque to the server — passed through as initialData to client useQuery hooks
	const [
		readmeHtmlRaw,
		initialPRs,
		initialIssues,
		initialEvents,
		initialCommitActivity,
		initialCIStatus,
		initialPinnedItems,
	] = await Promise.all([
		getCachedReadmeHtml(owner, repo),
		isMaintainer ? getCachedOverviewPRs(owner, repo) : null,
		isMaintainer ? getCachedOverviewIssues(owner, repo) : null,
		isMaintainer ? getCachedOverviewEvents(owner, repo) : null,
		isMaintainer ? getCachedOverviewCommitActivity(owner, repo) : null,
		isMaintainer ? getCachedOverviewCI(owner, repo) : null,
		isMaintainer ? fetchPinnedItemsForRepo(owner, repo) : null,
	]) as [
		string | null,
		RepoOverviewProps["initialPRs"],
		RepoOverviewProps["initialIssues"],
		RepoOverviewProps["initialEvents"],
		RepoOverviewProps["initialCommitActivity"],
		RepoOverviewProps["initialCIStatus"],
		RepoOverviewProps["initialPinnedItems"],
	];

	const readmeHtml = readmeHtmlRaw ?? await revalidateReadme(owner, repo, repoData.default_branch);

	return (
		<div className={isMaintainer ? "flex flex-col flex-1 min-h-0" : undefined}>
			<TrackView
				type="repo"
				url={`/${owner}/${repo}`}
				title={`${owner}/${repo}`}
				subtitle={repoData.description || "No description"}
				image={repoData.owner.avatar_url}
			/>
			<Suspense fallback={<RepoOverviewSkeleton />}>
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
			</Suspense>
		</div>
	);
}

function RepoOverviewSkeleton() {
	return (
		<div className="flex flex-col gap-4 animate-pulse pb-4">
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				{[0, 1, 2].map((i) => (
					<div key={i} className="p-4 rounded-md border border-border/40">
						<div className="h-4 w-28 rounded bg-muted mb-4" />
						<div className="space-y-2">
							{[0, 1, 2].map((j) => (
								<div key={j} className="flex items-start gap-2.5 py-2">
									<div className="w-3.5 h-3.5 rounded bg-muted shrink-0 mt-0.5" />
									<div className="flex-1 space-y-1.5">
										<div className="h-3 rounded bg-muted" style={{ width: `${80 - j * 10}%` }} />
										<div className="h-2.5 w-24 rounded bg-muted/60" />
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
