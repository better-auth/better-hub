import type { Metadata } from "next";
import {
	getPromptRequest,
	listPromptRequestComments,
	listPromptRequestReactions,
} from "@/lib/prompt-request-store";
import { PromptDetail } from "@/components/prompt-request/prompt-detail";
import { notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { getOctokit, extractRepoPermissions } from "@/lib/github";

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
	const [promptRequest, comments, reactions, session] = await Promise.all([
		getPromptRequest(id),
		listPromptRequestComments(id),
		listPromptRequestReactions(id),
		getServerSession(),
	]);

	if (!promptRequest) {
		notFound();
	}

	const currentUser = session?.user
		? {
				id: session.user.id,
				login: session.githubUser?.login ?? null,
				name: session.user.name,
				image: session.user.image ?? "",
			}
		: null;

	// Check repo maintainer permissions (push/admin/maintain)
	let isMaintainer = false;
	if (currentUser) {
		const octokit = await getOctokit();
		if (octokit) {
			try {
				const { data } = await octokit.repos.get({ owner, repo });
				const perms = extractRepoPermissions(data);
				isMaintainer = perms.push || perms.admin || perms.maintain;
			} catch {
				// If API fails, default to no maintainer access
			}
		}
	}

	// Author or maintainer can close/reopen/delete
	const canManage = isMaintainer || currentUser?.id === promptRequest.userId;

	return (
		<PromptDetail
			owner={owner}
			repo={repo}
			promptRequest={promptRequest}
			comments={comments}
			reactions={reactions}
			currentUser={currentUser}
			canManage={canManage}
			isMaintainer={isMaintainer}
		/>
	);
}
