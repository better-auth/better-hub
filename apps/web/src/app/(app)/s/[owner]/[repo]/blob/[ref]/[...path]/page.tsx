import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CodeViewer } from "@/components/repo/code-viewer";
import {
	StorageRepoNoBranchesState,
	StorageRepoRefNotFoundState,
} from "@/components/repo/storage-repo-empty-state";
import { getServerSession } from "@/lib/auth";
import { getMemberStorageRepository, getStorageFileText } from "@/lib/storage-git";

export const runtime = "nodejs";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; ref: string; path: string[] }>;
}): Promise<Metadata> {
	const { owner, repo, path } = await params;
	const basename = path[path.length - 1] ?? "file";
	return { title: `${basename} · ${owner}/${repo}` };
}

export default async function StorageRepoBlobPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; ref: string; path: string[] }>;
}) {
	const { owner, repo, ref, path } = await params;
	if (!path?.length) notFound();

	const session = await getServerSession();
	if (!session?.user) notFound();

	const record = await getMemberStorageRepository(owner, repo, session.user.id);
	if (!record) notFound();

	const filePath = path.join("/");
	const filename = path[path.length - 1] ?? filePath;

	const file = await getStorageFileText(owner, repo, filePath, ref);
	if (file === null) notFound();
	if (file.kind === "file_not_found") notFound();

	if (file.kind === "file") {
		return (
			<CodeViewer
				content={file.content}
				filename={filename}
				filePath={filePath}
				fileSize={file.size}
				owner={owner}
				repo={repo}
				branch={ref}
			/>
		);
	}

	if (file.kind === "no_branches") {
		return <StorageRepoNoBranchesState defaultBranch={file.defaultBranch} />;
	}

	return <StorageRepoRefNotFoundState ref={file.ref} />;
}
