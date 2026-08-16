import type { Metadata } from "next";
import { getRepoIssuesPage } from "@/lib/github";
import { IssuesList } from "@/components/issue/issues-list";
import { fetchIssuesByAuthor, fetchIssuePage } from "./actions";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Issues · ${owner}/${repo}` };
}

export default async function IssuesListPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const { openIssues, openPageInfo, openCount, closedCount } = await getRepoIssuesPage(
		owner,
		repo,
	);

	return (
		<IssuesList
			owner={owner}
			repo={repo}
			initialOpenIssues={openIssues}
			initialOpenPageInfo={openPageInfo}
			openCount={openCount}
			closedCount={closedCount}
			onAuthorFilter={
				fetchIssuesByAuthor as Parameters<
					typeof IssuesList
				>[0]["onAuthorFilter"]
			}
			onFetchIssuePage={fetchIssuePage}
		/>
	);
}
