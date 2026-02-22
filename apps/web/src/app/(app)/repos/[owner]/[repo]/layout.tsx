import { getRepoPageData, getRepoTree, prefetchPRData } from "@/lib/github";
import { buildFileTree, type FileTreeNode } from "@/lib/file-tree";
import { RepoSidebar } from "@/components/repo/repo-sidebar";
import { RepoNav } from "@/components/repo/repo-nav";
import { CodeContentWrapper } from "@/components/repo/code-content-wrapper";
import { RepoLayoutWrapper } from "@/components/repo/repo-layout-wrapper";
import { ChatPageActivator } from "@/components/shared/chat-page-activator";
import { RepoRevalidator } from "@/components/repo/repo-revalidator";
import {
	getCachedContributorAvatars,
	getCachedRepoLanguages,
	getCachedBranches,
	getCachedTags,
	getCachedRepoTree,
} from "@/lib/repo-data-cache-vc";
import { setCachedRepoTree } from "@/lib/repo-data-cache";
import { waitUntil } from "@vercel/functions";

export default async function RepoLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo: repoName } = await params;

	const pageData = await getRepoPageData(owner, repoName);
	if (!pageData) {
		return (
			<div className="py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					Repository not found
				</p>
			</div>
		);
	}

	const { repoData, navCounts, viewerHasStarred, viewerIsOrgMember, latestCommit } = pageData;

	waitUntil(prefetchPRData(owner, repoName, { prefetchIssues: !repoData.private }));

	const [cachedTree, cachedContributors, cachedLanguages, cachedBranches, cachedTags] =
		await Promise.all([
			getCachedRepoTree<FileTreeNode[]>(owner, repoName),
			getCachedContributorAvatars(owner, repoName),
			getCachedRepoLanguages(owner, repoName),
			getCachedBranches(owner, repoName),
			getCachedTags(owner, repoName),
		]);

	let tree: FileTreeNode[] | null = cachedTree;
	if (!tree) {
		const treeResult = await getRepoTree(
			owner,
			repoName,
			repoData.default_branch,
			true,
		);
		if (treeResult && !treeResult.truncated && treeResult.tree) {
			tree = buildFileTree(
				treeResult.tree as { path: string; type: string; size?: number }[],
			);
			waitUntil(setCachedRepoTree(owner, repoName, tree));
		}
	}

	const showPeopleTab = repoData.owner.type === "Organization" && viewerIsOrgMember;

	const parent = repoData.parent;

	return (
		<div className="-mx-4 flex-1 min-h-0 flex flex-col">
			<RepoLayoutWrapper
				owner={owner}
				repo={repoName}
				sidebar={
					<RepoSidebar
						owner={owner}
						repoName={repoName}
						ownerType={repoData.owner.type}
						avatarUrl={repoData.owner.avatar_url}
						description={repoData.description ?? null}
						stars={repoData.stargazers_count}
						forks={repoData.forks_count}
						watchers={repoData.subscribers_count}
						openIssuesCount={navCounts.openIssues}
						isPrivate={repoData.private}
						defaultBranch={repoData.default_branch}
						language={repoData.language}
						license={repoData.license}
						pushedAt={repoData.pushed_at}
						size={repoData.size}
						htmlUrl={repoData.html_url}
						homepage={repoData.homepage}
						topics={repoData.topics}
						archived={repoData.archived}
						fork={repoData.fork}
						parent={
							parent
								? {
										fullName: parent.full_name,
										owner: parent.owner
											.login,
										name: parent.name,
									}
								: null
						}
						initialContributors={cachedContributors}
						initialLanguages={cachedLanguages}
						isStarred={viewerHasStarred}
						latestCommit={latestCommit}
					/>
				}
			>
				<div
					className="shrink-0 pl-4"
					style={{ paddingRight: "var(--repo-pr, 1rem)" }}
				>
					<RepoNav
						owner={owner}
						repo={repoName}
						openIssuesCount={navCounts.openIssues}
						openPrsCount={navCounts.openPrs}
						activeRunsCount={navCounts.activeRuns}
						showPeopleTab={showPeopleTab}
					/>
				</div>
				<CodeContentWrapper
					owner={owner}
					repo={repoName}
					defaultBranch={repoData.default_branch}
					tree={tree}
					initialBranches={cachedBranches}
					initialTags={cachedTags}
				>
					{children}
				</CodeContentWrapper>
			</RepoLayoutWrapper>
			<RepoRevalidator
				owner={owner}
				repo={repoName}
				defaultBranch={repoData.default_branch}
			/>
			<ChatPageActivator
				config={{
					chatType: "general",
					contextKey: `${owner}/${repoName}`,
					contextBody: {},
					repoFileSearch: {
						owner,
						repo: repoName,
						ref: repoData.default_branch,
					},
				}}
			/>
		</div>
	);
}
