import type { Metadata } from "next";
import { getRepoReleases } from "@/lib/github";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { ReleasesList } from "@/components/repo/releases-list";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Releases · ${owner}/${repo}` };
}

export default async function ReleasesPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const rawReleases = await getRepoReleases(owner, repo);

	const releases = await Promise.all(
		(
			rawReleases as Array<
				{
					body?: string | null;
					tag_name: string;
					target_commitish: string;
				} & Record<string, unknown>
			>
		).map(async (r) => {
			const bodyHtml = r.body
				? await renderMarkdownToHtml(r.body, {
						owner,
						repo,
						branch: r.target_commitish,
					})
				: null;
			return { ...r, body: r.body ?? null, bodyHtml };
		}),
	);

	return (
		<ReleasesList
			owner={owner}
			repo={repo}
			releases={releases as Parameters<typeof ReleasesList>[0]["releases"]}
			hasMore={rawReleases.length === 100}
		/>
	);
}
