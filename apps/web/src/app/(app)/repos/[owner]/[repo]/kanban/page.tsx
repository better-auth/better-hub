import type { Metadata } from "next";
import { getOctokit, extractRepoPermissions } from "@/lib/github";
import { listKanbanItems } from "@/lib/kanban-store";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { syncAllKanbanStatuses } from "./actions";
import { getServerSession } from "@/lib/auth";
import { ShieldAlert } from "lucide-react";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Kanban · ${owner}/${repo}` };
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

export default async function KanbanPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

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
						maintainers. You need push, maintain, or admin
						permissions to access this feature.
					</p>
				</div>
			</div>
		);
	}

	// Sync statuses from GitHub on page load
	try {
		await syncAllKanbanStatuses(owner, repo);
	} catch {
		// Silently fail - items will still show with current status
	}

	const items = await listKanbanItems(owner, repo);
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
			<KanbanBoard
				owner={owner}
				repo={repo}
				initialItems={items}
				currentUser={currentUser}
			/>
		</div>
	);
}
