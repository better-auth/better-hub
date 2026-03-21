import { Octokit } from "@octokit/rest";
import { getCustomThemeBySlug, syncCustomThemeData } from "@/lib/theme-store";
import { scanCustomThemeRepo, ScanError } from "@/lib/extension-scanner";
import { getServerSession } from "@/lib/auth";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const serverSession = await getServerSession();
	if (!serverSession?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const existing = await getCustomThemeBySlug(slug);
	if (!existing) {
		return Response.json({ error: "Custom theme not found" }, { status: 404 });
	}

	const token = serverSession.githubUser?.accessToken;
	if (!token) {
		return Response.json({ error: "GitHub token not available" }, { status: 401 });
	}

	const octokit = new Octokit({ auth: token });

	try {
		const scan = await scanCustomThemeRepo(octokit, existing.owner, existing.repo);
		await syncCustomThemeData(slug, JSON.stringify(scan.data), scan.readmeHtml);
		return Response.json({ ok: true });
	} catch (err) {
		if (err instanceof ScanError) {
			return Response.json({ error: err.message }, { status: err.statusCode });
		}
		console.error("Failed to sync custom theme:", err);
		return Response.json(
			{ error: "Failed to sync custom theme data" },
			{ status: 500 },
		);
	}
}
