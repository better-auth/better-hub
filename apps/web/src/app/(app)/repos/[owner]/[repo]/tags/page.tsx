import type { Metadata } from "next";
import { getRepoTags, getRepoReleases } from "@/lib/github";
import { TagsList } from "@/components/repo/tags-list";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Tags · ${owner}/${repo}` };
}

export default async function TagsPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const [tags, releases] = await Promise.all([
		getRepoTags(owner, repo),
		getRepoReleases(owner, repo),
	]);

	return (
		<TagsList
			owner={owner}
			repo={repo}
			tags={tags as Parameters<typeof TagsList>[0]["tags"]}
			releases={releases as Parameters<typeof TagsList>[0]["releases"]}
			hasMore={tags.length === 100}
		/>
	);
}
