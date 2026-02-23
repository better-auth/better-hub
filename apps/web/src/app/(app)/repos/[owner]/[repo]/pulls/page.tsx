import type { Metadata } from "next";
import { getRepoPullRequestsWithStats } from "@/lib/github";
import { PRsList } from "@/components/pr/prs-list";
import { fetchPRsByAuthor, fetchAllCheckStatuses, prefetchPRDetail, fetchPRPage } from "./actions";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Pull Requests · ${owner}/${repo}` };
}

export default async function PullsListPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const {
		prs: openPRs,
		pageInfo,
		counts,
		mergedPreview,
		closedPreview,
	} = await getRepoPullRequestsWithStats(owner, repo, "open", {
		includeCounts: true,
		previewClosed: 10,
		perPage: 20,
	});

	return (
		<PRsList
			owner={owner}
			repo={repo}
			initialOpenPRs={
				openPRs as unknown as Parameters<
					typeof PRsList
				>[0]["initialOpenPRs"]
			}
			initialPageInfo={pageInfo}
			mergedPreview={
				mergedPreview as unknown as Parameters<
					typeof PRsList
				>[0]["mergedPreview"]
			}
			closedPreview={
				closedPreview as unknown as Parameters<
					typeof PRsList
				>[0]["closedPreview"]
			}
			openCount={counts.open}
			closedCount={counts.closed}
			mergedCount={counts.merged}
			onAuthorFilter={
				fetchPRsByAuthor as unknown as Parameters<
					typeof PRsList
				>[0]["onAuthorFilter"]
			}
			onFetchAllCheckStatuses={
				fetchAllCheckStatuses as unknown as Parameters<
					typeof PRsList
				>[0]["onFetchAllCheckStatuses"]
			}
			onPrefetchPRDetail={prefetchPRDetail}
			onFetchPRPage={fetchPRPage}
		/>
	);
}
