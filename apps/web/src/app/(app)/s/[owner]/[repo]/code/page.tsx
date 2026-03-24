import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BranchSelector } from "@/components/repo/branch-selector";
import { CodeToolbar } from "@/components/repo/code-toolbar";
import { FileList } from "@/components/repo/file-list";
import {
	StorageRepoNoBranchesState,
	StorageRepoRefNotFoundState,
} from "@/components/repo/storage-repo-empty-state";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { TrackView } from "@/components/shared/track-view";
import { getServerSession } from "@/lib/auth";
import {
	getMemberStorageRepository,
	getStorageFileText,
	getStorageGitMeta,
	listStorageDirectory,
} from "@/lib/storage-git";

export const runtime = "nodejs";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Code · ${owner}/${repo}` };
}

export default async function StorageRepoCodePage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const session = await getServerSession();
	if (!session?.user) notFound();

	const record = await getMemberStorageRepository(owner, repo, session.user.id);
	if (!record) notFound();

	const repoBasePath = `/s/${owner}/${repo}`;

	const [listed, gitMeta] = await Promise.all([
		listStorageDirectory(owner, repo, { pathPrefix: "" }),
		getStorageGitMeta(owner, repo),
	]);

	if (listed === null || !gitMeta) notFound();

	const branches = gitMeta.branches;
	const tags: { name: string }[] = [];
	const defaultBranch = gitMeta.defaultBranch;

	const toolbar = (
		<div className="flex items-center gap-3 mb-3">
			<BranchSelector
				owner={owner}
				repo={repo}
				repoBasePath={repoBasePath}
				currentRef={listed.ok ? listed.resolvedRef : defaultBranch}
				branches={branches}
				tags={tags}
				defaultBranch={defaultBranch}
			/>
			<div className="flex-1">
				<CodeToolbar
					owner={owner}
					repo={repo}
					repoBasePath={repoBasePath}
					currentRef={listed.ok ? listed.resolvedRef : defaultBranch}
					branches={branches.map((b) => ({ name: b.name }))}
					defaultBranch={defaultBranch}
					showCloneControls={false}
				/>
			</div>
		</div>
	);

	if (!listed.ok) {
		return (
			<div>
				<TrackView
					type="repo"
					url={repoBasePath}
					title={`${owner}/${repo}`}
					subtitle={record.description || "No description"}
					image={session.user.image ?? undefined}
				/>
				{toolbar}
				{listed.reason === "no_branches" ? (
					<StorageRepoNoBranchesState
						defaultBranch={listed.defaultBranch}
					/>
				) : (
					<StorageRepoRefNotFoundState ref={listed.ref} />
				)}
			</div>
		);
	}

	const items = listed.items;
	const hasReadme = items.some(
		(i) =>
			i.type === "file" &&
			typeof i.name === "string" &&
			i.name.toLowerCase().startsWith("readme"),
	);

	let readme: { content: string } | null = null;
	if (hasReadme) {
		const readmeItem = items.find(
			(i) => i.type === "file" && i.name.toLowerCase().startsWith("readme"),
		);
		if (readmeItem) {
			const file = await getStorageFileText(
				owner,
				repo,
				readmeItem.path,
				listed.resolvedRef,
			);
			if (file?.kind === "file") readme = { content: file.content };
		}
	}

	return (
		<div>
			<TrackView
				type="repo"
				url={repoBasePath}
				title={`${owner}/${repo}`}
				subtitle={record.description || "No description"}
				image={session.user.image ?? undefined}
			/>
			{toolbar}
			<FileList
				items={items}
				owner={owner}
				repo={repo}
				currentRef={listed.resolvedRef}
				linkBase="storage"
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
								branch: listed.resolvedRef,
							}}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
