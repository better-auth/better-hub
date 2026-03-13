import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { scanCustomThemeRepo, ScanError } from "@/lib/extension-scanner";
import {
	publishCustomTheme,
	countCustomThemesByAuthor,
	customThemeExistsBySlug,
	toSlug,
} from "@/lib/theme-store";
import { getServerSession } from "@/lib/auth";

const MAX_CUSTOM_THEMES_PER_USER = 5;

const bodySchema = z.object({
	repo: z.string().min(1).max(100),
});

export async function POST(request: Request) {
	const serverSession = await getServerSession();
	if (!serverSession?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid request. Provide a 'repo' name." },
			{ status: 400 },
		);
	}

	const { repo } = parsed.data;
	const token = serverSession.githubUser?.accessToken;
	if (!token) {
		return Response.json({ error: "GitHub token not available" }, { status: 401 });
	}

	const ghUser = serverSession.githubUser;
	const owner = ghUser?.login as string | undefined;
	if (!owner) {
		return Response.json(
			{ error: "Could not determine your GitHub username" },
			{ status: 401 },
		);
	}

	const octokit = new Octokit({ auth: token });
	const isAdmin = (serverSession.user as { role?: string }).role === "admin";
	const authorGithubId = String(ghUser?.id ?? serverSession.user.id);

	if (!isAdmin) {
		const slug = toSlug(owner, repo);
		const [existing, isUpdate] = await Promise.all([
			countCustomThemesByAuthor(authorGithubId),
			customThemeExistsBySlug(slug),
		]);
		if (!isUpdate && existing >= MAX_CUSTOM_THEMES_PER_USER) {
			return Response.json(
				{
					error: `You can publish up to ${MAX_CUSTOM_THEMES_PER_USER} custom themes. Please remove one before publishing another.`,
				},
				{ status: 403 },
			);
		}
	}

	try {
		const scan = await scanCustomThemeRepo(octokit, owner, repo);
		const theme = await publishCustomTheme(
			scan,
			authorGithubId,
			owner,
			(ghUser?.avatar_url as string) ?? serverSession.user.image ?? null,
			{ verified: true },
		);

		return Response.json(theme, { status: 201 });
	} catch (err) {
		if (err instanceof ScanError) {
			return Response.json({ error: err.message }, { status: err.statusCode });
		}
		console.error("Failed to publish custom theme:", err);
		return Response.json({ error: "Failed to scan repository" }, { status: 500 });
	}
}
