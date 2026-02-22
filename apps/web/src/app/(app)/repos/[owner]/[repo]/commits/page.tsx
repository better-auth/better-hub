import { Suspense } from "react";
import { getRepoCommits, getRepo, getRepoBranches } from "@/lib/github";
import { CommitsList } from "@/components/repo/commits-list";

export default async function CommitsPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const [repoData, commits, branches] = await Promise.all([
		getRepo(owner, repo),
		getRepoCommits(owner, repo),
		getRepoBranches(owner, repo),
	]);
	if (!repoData) return null;
	return (
		<Suspense fallback={<CommitsListSkeleton />}>
			<CommitsList
				owner={owner}
				repo={repo}
				commits={commits as Parameters<typeof CommitsList>[0]["commits"]}
				defaultBranch={repoData.default_branch}
				branches={branches as Parameters<typeof CommitsList>[0]["branches"]}
			/>
		</Suspense>
	);
}

function CommitsListSkeleton() {
	return (
		<div className="space-y-4 animate-pulse">
			<div className="flex items-center gap-2">
				<div className="h-9 w-36 rounded-md bg-muted" />
				<div className="h-9 flex-1 rounded-md bg-muted" />
			</div>
			{[0, 1].map((g) => (
				<div key={g}>
					<div className="h-3.5 w-48 rounded bg-muted mb-2" />
					<div className="rounded-md border border-border overflow-hidden">
						{[0, 1, 2].map((i) => (
							<div
								key={i}
								className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0"
							>
								<div className="w-6 h-6 rounded-full bg-muted shrink-0 mt-0.5" />
								<div className="flex-1 space-y-1.5">
									<div className="h-4 w-3/4 rounded bg-muted" />
									<div className="h-3 w-40 rounded bg-muted/60" />
								</div>
								<div className="h-5 w-14 rounded bg-muted shrink-0" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
