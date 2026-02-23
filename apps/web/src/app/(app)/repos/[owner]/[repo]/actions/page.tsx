import type { Metadata } from "next";
import { getRepoWorkflows, getRepoWorkflowRuns } from "@/lib/github";
import { ActionsList } from "@/components/actions/actions-list";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Actions · ${owner}/${repo}` };
}

export default async function ActionsPage({
	params,
	searchParams,
}: {
	params: Promise<{ owner: string; repo: string }>;
	searchParams: Promise<Record<string, string | undefined>>;
}) {
	const { owner, repo } = await params;
	const sp = await searchParams;

	const [workflows, runs] = await Promise.all([
		getRepoWorkflows(owner, repo),
		getRepoWorkflowRuns(owner, repo),
	]);

	const runsArray = runs ?? [];

	return (
		<ActionsList
			owner={owner}
			repo={repo}
			workflows={workflows as Parameters<typeof ActionsList>[0]["workflows"]}
			runs={runsArray as Parameters<typeof ActionsList>[0]["runs"]}
			initialTotalCount={runsArray.length}
			initialWorkflow={sp.workflow}
		/>
	);
}
