import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listKanbanComments, getKanbanItem } from "@/lib/kanban-store";
import { getOctokit, extractRepoPermissions } from "@/lib/github";

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;

	const item = await getKanbanItem(id);
	if (!item) {
		return NextResponse.json({ error: "Item not found" }, { status: 404 });
	}

	const isMaintainer = await checkMaintainerAccess(item.owner, item.repo);
	if (!isMaintainer) {
		return NextResponse.json({ error: "Not authorized" }, { status: 403 });
	}

	const comments = await listKanbanComments(id);

	return NextResponse.json({ comments });
}
