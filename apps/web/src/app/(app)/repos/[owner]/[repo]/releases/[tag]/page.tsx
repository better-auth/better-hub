import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRepoReleaseByTag, getRepoReleases } from "@/lib/github";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { ReleaseDetail } from "@/components/repo/release-detail";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; tag: string }>;
}): Promise<Metadata> {
	const { owner, repo, tag } = await params;
	const decodedTag = decodeURIComponent(tag);
	const release = await getRepoReleaseByTag(owner, repo, decodedTag);
	const title = release?.name || decodedTag;
	return {
		title: `${title} · ${owner}/${repo}`,
		description: release?.body?.slice(0, 200) ?? undefined,
	};
}

export default async function ReleaseDetailPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; tag: string }>;
}) {
	const { owner, repo, tag } = await params;
	const decodedTag = decodeURIComponent(tag);

	const [release, allReleases] = await Promise.all([
		getRepoReleaseByTag(owner, repo, decodedTag),
		getRepoReleases(owner, repo),
	]);

	if (!release) {
		notFound();
	}

	const bodyHtml = release.body
		? await renderMarkdownToHtml(release.body, {
				owner,
				repo,
				branch: release.target_commitish,
			})
		: null;

	const releases = allReleases as (typeof release)[];
	const idx = releases.findIndex((r) => r.tag_name === release.tag_name);
	const prevRelease = idx < releases.length - 1 ? releases[idx + 1] : null;
	const nextRelease = idx > 0 ? releases[idx - 1] : null;

	return (
		<ReleaseDetail
			owner={owner}
			repo={repo}
			release={{ ...release, body: release.body ?? null }}
			bodyHtml={bodyHtml}
			prevRelease={
				prevRelease
					? { tag_name: prevRelease.tag_name, name: prevRelease.name }
					: null
			}
			nextRelease={
				nextRelease
					? { tag_name: nextRelease.tag_name, name: nextRelease.name }
					: null
			}
		/>
	);
}
