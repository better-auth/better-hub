import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommitDetail } from "@/components/repo/commit-detail";
import { getServerSession } from "@/lib/auth";
import { getMemberStorageRepository } from "@/lib/storage-git";
import { fetchStorageCommitDetail } from "../actions";

export const runtime = "nodejs";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; sha: string }>;
}): Promise<Metadata> {
	const { owner, repo, sha } = await params;
	const shortSha = sha.slice(0, 7);
	return { title: `Commit ${shortSha} · ${owner}/${repo}` };
}

export default async function StorageCommitDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ owner: string; repo: string; sha: string }>;
	searchParams: Promise<{ branch?: string }>;
}) {
	const { owner, repo: repoName, sha } = await params;
	const { branch } = await searchParams;

	const session = await getServerSession();
	if (!session?.user) notFound();

	const record = await getMemberStorageRepository(owner, repoName, session.user.id);
	if (!record) notFound();

	const { commit, highlightData } = await fetchStorageCommitDetail(
		owner,
		repoName,
		sha,
		branch,
	);

	if (!commit) {
		return (
			<div className="py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					Commit not found
				</p>
			</div>
		);
	}

	return (
		<CommitDetail
			owner={owner}
			repo={repoName}
			repoBasePath={`/s/${owner}/${repoName}`}
			commit={commit}
			highlightData={highlightData}
		/>
	);
}
