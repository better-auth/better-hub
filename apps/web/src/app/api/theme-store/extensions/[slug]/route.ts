import { Octokit } from "@octokit/rest";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCustomThemeBySlug, unpublishCustomTheme, publishCustomTheme } from "@/lib/theme-store";
import { getServerSession } from "@/lib/auth";
import { scanCustomThemeRepo, ScanError } from "@/lib/extension-scanner";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const session = await auth.api.getSession({ headers: await headers() });
	const userId = session?.user?.id;

	const theme = await getCustomThemeBySlug(slug, userId);
	if (!theme) {
		return Response.json({ error: "Custom theme not found" }, { status: 404 });
	}

	const serverSession = await getServerSession();
	const ghId = serverSession?.githubUser?.id;
	const isAuthor = !!ghId && String(ghId) === theme.authorGithubId;

	return Response.json({ ...theme, isAuthor });
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

	const deleted = await unpublishCustomTheme(slug, String(ghId));
	if (!deleted) {
		return Response.json(
			{ error: "Custom theme not found or you are not the author" },
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

	const existing = await getCustomThemeBySlug(slug);
	if (!existing) {
		return Response.json({ error: "Custom theme not found" }, { status: 404 });
	}
	if (existing.authorGithubId !== String(ghId)) {
		return Response.json(
			{ error: "Only the author can update this custom theme" },
			{ status: 403 },
		);
	}

	const token = serverSession.githubUser?.accessToken;
	if (!token) {
		return Response.json({ error: "GitHub token not available" }, { status: 401 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		const scan = await scanCustomThemeRepo(octokit, existing.owner, existing.repo);
		const ghUser = serverSession.githubUser;
		const updated = await publishCustomTheme(
			scan,
			String(ghId),
			(ghUser?.login as string) ?? serverSession.user.name,
			(ghUser?.avatar_url as string) ?? serverSession.user.image ?? null,
			{ verified: existing.verified },
		);

		return Response.json({ ...updated, isAuthor: true });
	} catch (err) {
		if (err instanceof ScanError) {
			return Response.json({ error: err.message }, { status: err.statusCode });
		}
		console.error("Failed to update custom theme:", err);
		return Response.json({ error: "Failed to rescan repository" }, { status: 500 });
	}
}
