import type { Metadata } from "next";
import {
	getRepo,
	getRepoContents,
	getRepoBranches,
	getRepoTags,
	getRepoReadme,
	getRepoPullRequests,
	getOctokit,
} from "@/lib/github";
import { BranchSelector } from "@/components/repo/branch-selector";
import { FileList } from "@/components/repo/file-list";
import { CodeToolbar } from "@/components/repo/code-toolbar";
import { ForkSyncStrip } from "@/components/repo/fork-sync-strip";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { TrackView } from "@/components/shared/track-view";
import { deleteBranch, syncForkWithUpstream, discardForkCommits } from "../actions";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Code · ${owner}/${repo}` };
}

export default async function CodePage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const repoDataPromise = getRepo(owner, repo);
	const branchesPromise = getRepoBranches(owner, repo);
	const tagsPromise = getRepoTags(owner, repo);

	const repoData = await repoDataPromise;
	if (!repoData) return null;

	const defaultBranch = repoData.default_branch;
	const parent = repoData.parent;
	const isFork = Boolean(repoData.fork && parent);
	const canSyncFork = Boolean(
		repoData.permissions?.admin ||
		repoData.permissions?.maintain ||
		repoData.permissions?.push,
	);

	const [branches, tags, contents, openPRs, closedPRs] = await Promise.all([
		branchesPromise,
		tagsPromise,
		getRepoContents(owner, repo, "", defaultBranch),
		getRepoPullRequests(owner, repo, "open"),
		getRepoPullRequests(owner, repo, "closed"),
	]);

	let forkSyncStatus: { aheadBy: number; behindBy: number } | null = null;
	if (isFork && canSyncFork && parent?.owner?.login && parent?.default_branch) {
		const octokit = await getOctokit();
		if (octokit) {
			try {
				const { data } = await octokit.repos.compareCommits({
					owner,
					repo,
					base: `${parent.owner.login}:${parent.default_branch}`,
					head: `${owner}:${defaultBranch}`,
				});
				forkSyncStatus = {
					aheadBy: data.ahead_by ?? 0,
					behindBy: data.behind_by ?? 0,
				};
			} catch {
				forkSyncStatus = null;
			}
		}
	}

	const hasReadme =
		Array.isArray(contents) &&
		contents.some(
			(item: { name?: string }) =>
				typeof item.name === "string" &&
				item.name.toLowerCase().startsWith("readme"),
		);
	const readme = hasReadme ? await getRepoReadme(owner, repo, defaultBranch) : null;

	// Map branches to their most recent PR (open > merged > closed)
	const branchPRMap = new Map<
		string,
		{
			number: number;
			state: "open" | "merged" | "closed";
			user: { login: string; avatarUrl: string };
		}
	>();
	for (const pr of openPRs) {
		const ref = pr.head.ref;
		if (!branchPRMap.has(ref)) {
			branchPRMap.set(ref, {
				number: pr.number,
				state: "open",
				user: {
					login: pr.user?.login ?? "",
					avatarUrl: pr.user?.avatar_url ?? "",
				},
			});
		}
	}
	for (const pr of closedPRs) {
		const ref = pr.head.ref;
		if (!branchPRMap.has(ref)) {
			branchPRMap.set(ref, {
				number: pr.number,
				state: (pr as { merged_at?: string | null }).merged_at
					? "merged"
					: "closed",
				user: {
					login: pr.user?.login ?? "",
					avatarUrl: pr.user?.avatar_url ?? "",
				},
			});
		}
	}

	const enrichedBranches = branches.map((b) => ({
		name: b.name,
		pr: branchPRMap.get(b.name),
	}));

	const items = Array.isArray(contents)
		? contents.map(
				(item: {
					name: string;
					path: string;
					type: string;
					size?: number;
				}) => ({
					name: item.name,
					path: item.path,
					type:
						item.type === "dir"
							? ("dir" as const)
							: ("file" as const),
					size: item.size,
				}),
			)
		: [];

	return (
		<div>
			<TrackView
				type="repo"
				url={`/${owner}/${repo}`}
				title={`${owner}/${repo}`}
				subtitle={repoData.description || "No description"}
				image={repoData.owner.avatar_url}
			/>
			<div className="flex items-center gap-3 mb-3">
				<BranchSelector
					owner={owner}
					repo={repo}
					currentRef={defaultBranch}
					branches={branches}
					tags={tags}
					defaultBranch={defaultBranch}
				/>
				<div className="flex-1">
					<CodeToolbar
						owner={owner}
						repo={repo}
						currentRef={defaultBranch}
						branches={enrichedBranches}
						defaultBranch={defaultBranch}
						onDeleteBranch={
							deleteBranch as (
								owner: string,
								repo: string,
								branch: string,
							) => Promise<{ success: boolean }>
						}
					/>
				</div>
			</div>

			{isFork &&
				canSyncFork &&
				parent?.owner?.login &&
				parent?.default_branch &&
				forkSyncStatus && (
					<ForkSyncStrip
						owner={owner}
						repo={repo}
						defaultBranch={defaultBranch}
						upstream={{
							owner: parent.owner.login,
							repo: parent.name,
							defaultBranch: parent.default_branch,
						}}
						aheadBy={forkSyncStatus.aheadBy}
						behindBy={forkSyncStatus.behindBy}
						onSyncFork={syncForkWithUpstream}
						onDiscardFork={discardForkCommits}
					/>
				)}

			<FileList
				items={items}
				owner={owner}
				repo={repo}
				currentRef={defaultBranch}
			/>

			{readme && (
				<div className="mt-6 border border-border rounded-md overflow-hidden">
					<div className="px-4 py-2 border-b border-border bg-muted/30">
						<span className="text-[11px] font-mono text-muted-foreground">
							README.md
						</span>
					</div>
					<div className="px-6 py-5">
						<MarkdownRenderer
							content={readme.content}
							repoContext={{
								owner,
								repo,
								branch: defaultBranch,
							}}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
