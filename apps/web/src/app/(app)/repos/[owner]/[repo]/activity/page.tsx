import { Suspense } from "react";
import { getRepo, getRepoEvents, getCommitActivity } from "@/lib/github";
import { RepoActivityView } from "@/components/repo/repo-activity-view";

export default async function ActivityPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const repoData = await getRepo(owner, repo);
	if (!repoData) return null;

	const [events, commitActivity] = await Promise.all([
		getRepoEvents(owner, repo, 100),
		getCommitActivity(owner, repo),
	]);

	return (
		<Suspense fallback={<ActivityViewSkeleton />}>
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
		</Suspense>
	);
}

function ActivityViewSkeleton() {
	return (
		<div className="space-y-6 animate-pulse">
			<div className="border border-border/40 rounded-lg p-4">
				<div className="flex items-baseline gap-2 mb-4">
					<div className="h-4 w-32 rounded bg-muted" />
					<div className="h-3 w-40 rounded bg-muted/60" />
				</div>
				<div className="flex items-end gap-[3px]" style={{ height: 64 }}>
					{Array.from({ length: 24 }).map((_, i) => (
						<div
							key={i}
							className="flex-1 bg-muted rounded-t-[2px]"
							style={{ height: 8 + Math.random() * 48 }}
						/>
					))}
				</div>
			</div>
			<div className="flex items-center gap-1">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="h-7 w-20 rounded-md bg-muted" />
				))}
			</div>
			<div className="space-y-1">
				{[0, 1, 2, 3, 4].map((i) => (
					<div key={i} className="flex items-start gap-3 py-2.5 px-3">
						<div className="w-6 h-6 rounded-full bg-muted shrink-0" />
						<div className="flex-1 space-y-1.5">
							<div className="h-4 rounded bg-muted" style={{ width: `${80 - i * 8}%` }} />
							<div className="h-3 w-32 rounded bg-muted/60" />
						</div>
						<div className="h-3 w-10 rounded bg-muted/40 shrink-0" />
					</div>
				))}
			</div>
		</div>
	);
}
