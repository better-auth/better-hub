import { getRepo, getRepoEvents, getCommitActivity } from "@/lib/github";
import { RepoActivityView } from "@/components/repo/repo-activity-view";

export default async function ActivityPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const [repoData, events, commitActivity] = await Promise.all([
		getRepo(owner, repo),
		getRepoEvents(owner, repo, 100),
		getCommitActivity(owner, repo),
	]);
	if (!repoData) return null;

	return (
		<RepoActivityView
			owner={owner}
			repo={repo}
			events={
				events as Array<{
					type: string;
					actor: { login: string; avatar_url: string } | null;
					created_at: string;
					repo?: { name: string };
					payload?: {
						action?: string;
						ref?: string;
						ref_type?: string;
						size?: number;
						commits?: { sha: string; message: string }[];
						pull_request?: { number: number; title: string };
						issue?: { number: number; title: string };
						comment?: { body: string };
						forkee?: { full_name: string };
						release?: { tag_name: string; name: string };
					};
				}>
			}
			commitActivity={commitActivity}
		/>
	);
}
