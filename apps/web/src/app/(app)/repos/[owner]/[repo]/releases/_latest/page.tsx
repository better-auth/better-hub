import { notFound, redirect } from "next/navigation";
import { getLatestRepoRelease } from "@/lib/github";

export default async function LatestReleaseRedirectPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const release = await getLatestRepoRelease(owner, repo);

	if (!release?.tag_name) {
		notFound();
	}

	redirect(`/${owner}/${repo}/releases/${encodeURIComponent(release.tag_name)}`);
}
