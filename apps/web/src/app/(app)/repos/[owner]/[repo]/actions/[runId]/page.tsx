import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorkflowRun, getWorkflowRunJobs } from "@/lib/github";
import { RunDetail } from "@/components/actions/run-detail";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; runId: string }>;
}): Promise<Metadata> {
	const { owner, repo, runId } = await params;
	const runIdNum = parseInt(runId, 10);
	if (isNaN(runIdNum)) {
		return { title: `Run · ${owner}/${repo}` };
	}
	const run = await getWorkflowRun(owner, repo, runIdNum);
	if (!run) {
		return { title: `Run #${runId} · ${owner}/${repo}` };
	}
	return { title: `${run.name || run.display_title} #${run.run_number} · ${owner}/${repo}` };
}

export default async function WorkflowRunPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; runId: string }>;
}) {
	const { owner, repo, runId } = await params;
	const runIdNum = parseInt(runId, 10);
	if (isNaN(runIdNum)) notFound();

	const [run, jobs] = await Promise.all([
		getWorkflowRun(owner, repo, runIdNum),
		getWorkflowRunJobs(owner, repo, runIdNum),
	]);

	if (!run) notFound();

	return (
		<RunDetail
			owner={owner}
			repo={repo}
			run={run as Parameters<typeof RunDetail>[0]["run"]}
			jobs={jobs as Parameters<typeof RunDetail>[0]["jobs"]}
		/>
	);
}
