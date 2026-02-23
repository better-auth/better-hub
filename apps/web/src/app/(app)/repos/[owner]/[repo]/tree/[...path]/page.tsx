import type { Metadata } from "next";
import { getRepoContents, getRepoBranches, getRepoTags } from "@/lib/github";
import { parseRefAndPath } from "@/lib/github-utils";
import { FileList } from "@/components/repo/file-list";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; path: string[] }>;
}): Promise<Metadata> {
	const { owner, repo, path: pathSegments } = await params;
	const [branches, tags] = await Promise.all([
		getRepoBranches(owner, repo),
		getRepoTags(owner, repo),
	]);
	const branchNames = [...branches.map((b) => b.name), ...tags.map((t) => t.name)];
	const { path } = parseRefAndPath(pathSegments, branchNames);
	return { title: `${path || "/"} · ${owner}/${repo}` };
}

export default async function TreePage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; path: string[] }>;
}) {
	const { owner, repo, path: pathSegments } = await params;

	const branches = await getRepoBranches(owner, repo);
	const tags = await getRepoTags(owner, repo);
	const branchNames = [...branches.map((b) => b.name), ...tags.map((t) => t.name)];

	const { ref, path } = parseRefAndPath(pathSegments, branchNames);

	const contents = await getRepoContents(owner, repo, path, ref);

	const items = Array.isArray(contents)
		? contents.map((item) => ({
				name: item.name,
				path: item.path,
				type: item.type === "dir" ? ("dir" as const) : ("file" as const),
				size: item.size,
			}))
		: [];

	return <FileList items={items} owner={owner} repo={repo} currentRef={ref} />;
}
