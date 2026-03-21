import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { RepoLayoutWrapper } from "@/components/repo/repo-layout-wrapper";
import { RepoNav } from "@/components/repo/repo-nav";
import { CodeContentWrapper } from "@/components/repo/code-content-wrapper";
import { StorageRepoSidebar } from "@/components/repo/storage-repo-sidebar";
import { getServerSession } from "@/lib/auth";
import { getMemberStorageRepository, getStorageGitMeta } from "@/lib/storage-git";
import { buildStorageFileTree } from "@/lib/storage-file-tree";
import {
	REPO_SIDEBAR_COOKIE,
	type RepoSidebarState,
} from "@/components/repo/repo-sidebar-constants";
import type { FileTreeNode } from "@/lib/file-tree";

export const runtime = "nodejs";

export default async function StorageRepoLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo: repoName } = await params;
	const session = await getServerSession();
	if (!session?.user) notFound();

	const [record, gitMeta] = await Promise.all([
		getMemberStorageRepository(owner, repoName, session.user.id),
		getStorageGitMeta(owner, repoName),
	]);
	if (!record) notFound();
	if (!gitMeta) notFound();

	const initialBranches = gitMeta.branches;

	let tree: FileTreeNode[] | null = null;
	if (gitMeta.branches.length > 0 && gitMeta.files) {
		tree = buildStorageFileTree(gitMeta.files);
	}

	const cookieStore = await cookies();
	const sidebarCookie = cookieStore.get(REPO_SIDEBAR_COOKIE);
	let sidebarState: RepoSidebarState | null = null;
	if (sidebarCookie?.value) {
		try {
			sidebarState = JSON.parse(sidebarCookie.value);
		} catch {}
	}

	const repoBasePath = `/s/${owner}/${repoName}`;
	const visibility = record.visibility === "private" ? "private" : "public";

	return (
		<div className="-mx-4 flex-1 min-h-0 flex flex-col">
			<RepoLayoutWrapper
				owner={owner}
				repo={repoName}
				ownerType="User"
				repoBasePath={repoBasePath}
				initialCollapsed={sidebarState?.collapsed}
				initialWidth={sidebarState?.width}
				sidebar={
					<StorageRepoSidebar
						owner={owner}
						repoName={record.name}
						description={record.description ?? null}
						visibility={visibility}
						defaultBranch={gitMeta.defaultBranch}
						repoBasePath={repoBasePath}
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
						basePath={repoBasePath}
						subscribeToRepoMutations={false}
						openIssuesCount={0}
						openPrsCount={0}
						activeRunsCount={0}
						hasDiscussions={false}
						promptRequestsCount={0}
						showPeopleTab={false}
					/>
				</div>
				<CodeContentWrapper
					owner={owner}
					repo={repoName}
					repoBasePath={repoBasePath}
					defaultBranch={gitMeta.defaultBranch}
					tree={tree}
					initialBranches={initialBranches}
					initialTags={[]}
					githubIntegrations={false}
				>
					{children}
				</CodeContentWrapper>
			</RepoLayoutWrapper>
		</div>
	);
}
