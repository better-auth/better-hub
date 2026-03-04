import type { Metadata } from "next";
import { getRepoCommits, getRepo, getRepoBranches } from "@/lib/github";
import { CommitsList } from "@/components/repo/commits-list";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Commits · ${owner}/${repo}` };
}

export default async function CommitsPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const repoData = await getRepo(owner, repo);
	if (!repoData) return null;

	const isEmptyRepo = repoData.size === 0;
	const [commits, branches] = await Promise.all([
		isEmptyRepo ? Promise.resolve([]) : getRepoCommits(owner, repo),
		getRepoBranches(owner, repo),
	]);

	return (
		<CommitsList
			owner={owner}
			repo={repo}
			commits={commits as Parameters<typeof CommitsList>[0]["commits"]}
			defaultBranch={repoData.default_branch}
			branches={branches as Parameters<typeof CommitsList>[0]["branches"]}
		/>
	);
}
