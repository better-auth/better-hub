import type { Metadata } from "next";
import { getRepo } from "@/lib/github";
import { RunComparisonPage } from "@/components/actions/run-comparison-page";
import { redirect } from "next/navigation";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Compare Runs · ${owner}/${repo}` };
}

export default async function CompareRunsPage({
	params,
	searchParams,
}: {
	params: Promise<{ owner: string; repo: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { owner, repo } = await params;
	const sp = await searchParams;

	// Parse run_ids from query string — supports ?run_ids=1,2,3 or ?run_ids=1&run_ids=2
	const rawIds = sp.run_ids;
	let runIds: number[] = [];
	if (Array.isArray(rawIds)) {
		runIds = rawIds.flatMap((v) => v.split(",").map(Number)).filter((n) => n > 0);
	} else if (typeof rawIds === "string") {
		runIds = rawIds
			.split(",")
			.map(Number)
			.filter((n) => n > 0);
	}

	if (runIds.length < 2) {
		redirect(`/${owner}/${repo}/actions`);
	}

	const repoData = await getRepo(owner, repo);
	const avatarUrl = repoData?.owner?.avatar_url ?? null;
	const description = repoData?.description ?? null;

	return (
		<RunComparisonPage
			owner={owner}
			repo={repo}
			runIds={runIds}
			repoAvatarUrl={avatarUrl}
			repoDescription={description}
		/>
	);
}
