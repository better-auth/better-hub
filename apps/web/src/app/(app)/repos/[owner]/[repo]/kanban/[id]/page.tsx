import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOctokit, extractRepoPermissions } from "@/lib/github";
import { getKanbanItem, listKanbanComments } from "@/lib/kanban-store";
import { KanbanItemDetail } from "@/components/kanban/kanban-item-detail";
import { getServerSession } from "@/lib/auth";
import { ShieldAlert } from "lucide-react";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; id: string }>;
}): Promise<Metadata> {
	const { owner, repo, id } = await params;
	const item = await getKanbanItem(id);
	if (!item) {
		return { title: `Kanban · ${owner}/${repo}` };
	}
	return { title: `${item.issueTitle} · Kanban · ${owner}/${repo}` };
}

async function checkMaintainerAccess(owner: string, repo: string): Promise<boolean> {
	const octokit = await getOctokit();
	if (!octokit) return false;

	try {
		const { data } = await octokit.repos.get({ owner, repo });
		const perms = extractRepoPermissions(data);
		return perms.push || perms.admin || perms.maintain;
	} catch {
		return false;
	}
}

export default async function KanbanItemPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; id: string }>;
}) {
	const { owner, repo, id } = await params;

	const isMaintainer = await checkMaintainerAccess(owner, repo);
	if (!isMaintainer) {
		return (
			<div className="py-16 flex flex-col items-center justify-center gap-4 text-center max-w-md mx-auto">
				<div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
					<ShieldAlert className="w-6 h-6 text-amber-500" />
				</div>
				<div className="space-y-2">
					<h1 className="text-sm font-medium">
						Maintainer Access Required
					</h1>
					<p className="text-xs text-muted-foreground/80 leading-relaxed">
						The Kanban board is only available to repository
						maintainers.
					</p>
				</div>
			</div>
		);
	}

	const item = await getKanbanItem(id);
	if (!item) {
		notFound();
	}

	const comments = await listKanbanComments(id);
	const session = await getServerSession();

	const currentUser = session?.user
		? {
				id: session.user.id,
				login: session.githubUser?.login ?? null,
				name: session.user.name,
				image: session.user.image ?? "",
			}
		: null;

	return (
		<div className="flex-1 min-h-0 flex flex-col p-4">
			<KanbanItemDetail
				owner={owner}
				repo={repo}
				item={item}
				comments={comments}
				currentUser={currentUser}
			/>
		</div>
	);
}
