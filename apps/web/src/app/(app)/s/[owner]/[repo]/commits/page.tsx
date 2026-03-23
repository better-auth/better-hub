import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommitsList } from "@/components/repo/commits-list";
import type { Commit } from "@/components/repo/commits-list";
import { getServerSession } from "@/lib/auth";
import {
	getMemberStorageRepository,
	getStorageGitMeta,
	listStorageCommits,
} from "@/lib/storage-git";
import {
	fetchStorageCommitDetail,
	fetchStorageCommitsByDate,
	fetchStorageCommitsNext,
} from "./actions";

export const runtime = "nodejs";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Commits · ${owner}/${repo}` };
}

export default async function StorageCommitsPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo: repoName } = await params;
	const session = await getServerSession();
	if (!session?.user) notFound();

	const record = await getMemberStorageRepository(owner, repoName, session.user.id);
	if (!record) notFound();

	const [gitMeta, data] = await Promise.all([
		getStorageGitMeta(owner, repoName),
		listStorageCommits(owner, repoName, { limit: 30 }),
	]);
	if (!gitMeta) notFound();
	if (!data) notFound();

	return (
		<CommitsList
			owner={owner}
			repo={repoName}
			commits={data.commits as Commit[]}
			defaultBranch={gitMeta.defaultBranch}
			branches={gitMeta.branches}
			repoBasePath={`/s/${owner}/${repoName}`}
			enableDateFilter={false}
			cursorPagination={{
				initialNextCursor: data.nextCursor,
				initialHasMore: data.hasMore,
				fetchByBranch: fetchStorageCommitsByDate,
				fetchMore: fetchStorageCommitsNext,
				fetchCommitDetail: fetchStorageCommitDetail,
			}}
		/>
	);
}
