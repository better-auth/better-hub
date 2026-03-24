import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileList } from "@/components/repo/file-list";
import {
	StorageRepoNoBranchesState,
	StorageRepoRefNotFoundState,
} from "@/components/repo/storage-repo-empty-state";
import { getServerSession } from "@/lib/auth";
import { getMemberStorageRepository, listStorageDirectory } from "@/lib/storage-git";

export const runtime = "nodejs";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; ref: string; path?: string[] }>;
}): Promise<Metadata> {
	const { owner, repo, ref } = await params;
	return { title: `Tree · ${owner}/${repo} @ ${ref}` };
}

export default async function StorageRepoTreePage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; ref: string; path?: string[] }>;
}) {
	const { owner, repo, ref, path: pathSegs } = await params;
	const session = await getServerSession();
	if (!session?.user) notFound();

	const record = await getMemberStorageRepository(owner, repo, session.user.id);
	if (!record) notFound();

	const pathPrefix = pathSegs?.length ? pathSegs.join("/") : "";
	const listed = await listStorageDirectory(owner, repo, {
		ref,
		pathPrefix,
	});
	if (listed === null) notFound();

	if (!listed.ok) {
		return listed.reason === "no_branches" ? (
			<StorageRepoNoBranchesState defaultBranch={listed.defaultBranch} />
		) : (
			<StorageRepoRefNotFoundState ref={listed.ref} />
		);
	}

	return (
		<FileList
			items={listed.items}
			owner={owner}
			repo={repo}
			currentRef={listed.resolvedRef}
			linkBase="storage"
		/>
	);
}
