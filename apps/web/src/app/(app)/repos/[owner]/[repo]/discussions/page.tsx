import type { Metadata } from "next";
import { getRepoDiscussionsPage } from "@/lib/github";
import { DiscussionsList } from "@/components/discussion/discussions-list";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Discussions · ${owner}/${repo}` };
}

export default async function DiscussionsListPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const { discussions, totalCount, categories, hasNextPage, endCursor, repositoryId } =
		await getRepoDiscussionsPage(owner, repo);

	return (
		<DiscussionsList
			owner={owner}
			repo={repo}
			discussions={discussions}
			totalCount={totalCount}
			categories={categories}
			hasNextPage={hasNextPage}
			endCursor={endCursor}
			repositoryId={repositoryId}
		/>
	);
}
