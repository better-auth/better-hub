import { getRepoPageData, getRepoTree, prefetchPRData } from "@/lib/github";
import { buildFileTree, type FileTreeNode } from "@/lib/file-tree";
import { RepoSidebar } from "@/components/repo/repo-sidebar";
import { RepoNav } from "@/components/repo/repo-nav";
import { CodeContentWrapper } from "@/components/repo/code-content-wrapper";
import { RepoLayoutWrapper } from "@/components/repo/repo-layout-wrapper";
import { ChatPageActivator } from "@/components/shared/chat-page-activator";
import { RepoRevalidator } from "@/components/repo/repo-revalidator";
import { cookies } from "next/headers";
import {
	REPO_SIDEBAR_COOKIE,
	type RepoSidebarState,
} from "@/components/repo/repo-sidebar-constants";
import {
	getCachedContributorAvatars,
	getCachedRepoLanguages,
	getCachedBranches,
	getCachedTags,
	getCachedRepoTree,
} from "@/lib/repo-data-cache-vc";
import { setCachedRepoTree } from "@/lib/repo-data-cache";
import { waitUntil } from "@vercel/functions";
import { ExternalLink, ShieldAlert, AlertCircle } from "lucide-react";

function RepoErrorPage({ owner, repo, error }: { owner: string; repo: string; error: string }) {
	const githubUrl = `https://github.com/${owner}/${repo}`;
	const isOAuthRestriction = error.includes("OAuth App access restrictions");
	const isNotFound = error === "Repository not found";

	return (
		<div className="py-16 flex flex-col items-center justify-center gap-4 text-center max-w-md mx-auto">
			<div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
				{isOAuthRestriction ? (
					<ShieldAlert className="w-6 h-6 text-amber-500" />
				) : (
					<AlertCircle className="w-6 h-6 text-muted-foreground/50" />
				)}
			</div>
			<div className="space-y-2">
				<h1 className="text-sm font-medium">
					{isOAuthRestriction
						? "Access Restricted"
						: isNotFound
							? "Repository not found"
							: "Unable to load repository"}
				</h1>
				{isOAuthRestriction ? (
					<p className="text-xs text-muted-foreground/80 leading-relaxed">
						The{" "}
						<span className="font-medium text-foreground">
							{owner}
						</span>{" "}
						organization has enabled OAuth App access
						restrictions. To view this repository, an
						organization admin needs to approve this app, or you
						can view it directly on GitHub.
					</p>
				) : isNotFound ? (
					<p className="text-xs text-muted-foreground/80">
						This repository doesn&apos;t exist or you don&apos;t
						have permission to view it.
					</p>
				) : (
					<p className="text-xs text-muted-foreground/80 leading-relaxed font-mono">
						{error}
					</p>
				)}
			</div>
			<a
				href={githubUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
			>
				<ExternalLink className="w-3 h-3" />
				View on GitHub
			</a>
			{isOAuthRestriction && (
				<a
					href="https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization"
					target="_blank"
					rel="noopener noreferrer"
					className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
				>
					Learn about OAuth app approval
				</a>
			)}
		</div>
	);
}

export default async function RepoLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo: repoName } = await params;

	const pageDataPromise = getRepoPageData(owner, repoName);
	const cachePromise = Promise.all([
		getCachedRepoTree<FileTreeNode[]>(owner, repoName),
		getCachedContributorAvatars(owner, repoName),
		getCachedRepoLanguages(owner, repoName),
		getCachedBranches(owner, repoName),
		getCachedTags(owner, repoName),
	]);

	const pageDataResult = await pageDataPromise;
	if (!pageDataResult.success) {
		return <RepoErrorPage owner={owner} repo={repoName} error={pageDataResult.error} />;
	}

	const {
		repoData,
		navCounts,
		viewerHasStarred,
		viewerIsOrgMember,
		latestCommit,
		viewerLogin,
	} = pageDataResult.data;

	const isViewingOwnFork =
		repoData.fork &&
		repoData.owner.type === "User" &&
		!!viewerLogin &&
		repoData.owner.login.toLowerCase() === viewerLogin.toLowerCase();

	waitUntil(prefetchPRData(owner, repoName, { prefetchIssues: !repoData.private }));

	const [cachedTree, cachedContributors, cachedLanguages, cachedBranches, cachedTags] =
		await cachePromise;

	const cookieStore = await cookies();
	const sidebarCookie = cookieStore.get(REPO_SIDEBAR_COOKIE);
	let sidebarState: RepoSidebarState | null = null;
	if (sidebarCookie?.value) {
		try {
			sidebarState = JSON.parse(sidebarCookie.value);
		} catch {}
	}

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
				ownerType={repoData.owner.type}
				initialCollapsed={sidebarState?.collapsed}
				initialWidth={sidebarState?.width}
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
						disableForkButton={isViewingOwnFork}
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
