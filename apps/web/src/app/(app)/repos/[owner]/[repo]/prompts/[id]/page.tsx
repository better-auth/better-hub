import type { Metadata } from "next";
import { getPromptRequest, listPromptRequestComments } from "@/lib/prompt-request-store";
import { PromptDetail } from "@/components/prompt-request/prompt-detail";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; id: string }>;
}): Promise<Metadata> {
	const { owner, repo, id } = await params;
	const promptRequest = await getPromptRequest(id);
	if (!promptRequest) {
		return { title: `Prompt · ${owner}/${repo}` };
	}
	return { title: `${promptRequest.title} · ${owner}/${repo}` };
}

export default async function PromptDetailPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; id: string }>;
}) {
	const { owner, repo, id } = await params;
	const [promptRequest, comments, session] = await Promise.all([
		getPromptRequest(id),
		listPromptRequestComments(id),
		auth.api.getSession({ headers: await headers() }),
	]);

	if (!promptRequest) {
		notFound();
	}

	const currentUser = session?.user
		? { id: session.user.id, name: session.user.name, image: session.user.image ?? "" }
		: null;

	return (
		<PromptDetail
			owner={owner}
			repo={repo}
			promptRequest={promptRequest}
			comments={comments}
			currentUser={currentUser}
		/>
	);
}
