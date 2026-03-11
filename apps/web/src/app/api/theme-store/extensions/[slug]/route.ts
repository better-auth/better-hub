import { Octokit } from "@octokit/rest";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getExtensionBySlug, unpublishExtension, publishExtension } from "@/lib/theme-store";
import { getServerSession } from "@/lib/auth";
import { scanExtensionRepo, ScanError } from "@/lib/extension-scanner";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	const userId = session?.user?.id;

	const extension = await getExtensionBySlug(slug, userId);
	if (!extension) {
		return Response.json({ error: "Extension not found" }, { status: 404 });
	}

	const serverSession = await getServerSession();
	const ghId = serverSession?.githubUser?.id;
	const isAuthor = !!ghId && String(ghId) === extension.authorGithubId;

	return Response.json({ ...extension, isAuthor });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const serverSession = await getServerSession();
	if (!serverSession?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const ghId = serverSession.githubUser?.id;
	if (!ghId) {
		return Response.json({ error: "GitHub identity not available" }, { status: 401 });
	}

	const deleted = await unpublishExtension(slug, String(ghId));
	if (!deleted) {
		return Response.json(
			{ error: "Extension not found or you are not the author" },
			{ status: 403 },
		);
	}

	return Response.json({ success: true });
}

export async function PATCH(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const serverSession = await getServerSession();
	if (!serverSession?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const ghId = serverSession.githubUser?.id;
	if (!ghId) {
		return Response.json({ error: "GitHub identity not available" }, { status: 401 });
	}

	const existing = await getExtensionBySlug(slug);
	if (!existing) {
		return Response.json({ error: "Extension not found" }, { status: 404 });
	}
	if (existing.authorGithubId !== String(ghId)) {
		return Response.json(
			{ error: "Only the author can update this extension" },
			{ status: 403 },
		);
	}

	const token = serverSession.githubUser?.accessToken;
	if (!token) {
		return Response.json({ error: "GitHub token not available" }, { status: 401 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		const scan = await scanExtensionRepo(octokit, existing.owner, existing.repo);
		const ghUser = serverSession.githubUser;
		const updated = await publishExtension(
			scan,
			String(ghId),
			(ghUser?.login as string) ?? serverSession.user.name,
			(ghUser?.avatar_url as string) ?? serverSession.user.image ?? null,
		);

		return Response.json({ ...updated, isAuthor: true });
	} catch (err) {
		if (err instanceof ScanError) {
			return Response.json({ error: err.message }, { status: err.statusCode });
		}
		console.error("Failed to update extension:", err);
		return Response.json({ error: "Failed to rescan repository" }, { status: 500 });
	}
}
