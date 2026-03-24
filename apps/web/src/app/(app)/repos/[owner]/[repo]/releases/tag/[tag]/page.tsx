import { redirect } from "next/navigation";

export default async function GitHubStyleReleaseTagPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; tag: string }>;
}) {
	const { owner, repo, tag } = await params;
	redirect(`/${owner}/${repo}/releases/${encodeURIComponent(tag)}`);
}
