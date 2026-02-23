import type { Metadata } from "next";
import { listPromptRequests } from "@/lib/prompt-request-store";
import { PromptList } from "@/components/prompt-request/prompt-list";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Prompts · ${owner}/${repo}` };
}

export default async function PromptsPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const promptRequests = await listPromptRequests(owner, repo);

	return <PromptList owner={owner} repo={repo} promptRequests={promptRequests} />;
}
