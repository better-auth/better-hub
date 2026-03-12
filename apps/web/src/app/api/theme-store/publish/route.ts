import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { scanExtensionRepo, ScanError } from "@/lib/extension-scanner";
import {
	publishExtension,
	countExtensionsByAuthor,
	extensionExistsBySlug,
	toSlug,
} from "@/lib/theme-store";
import { getServerSession } from "@/lib/auth";

const MAX_EXTENSIONS_PER_USER = 5;

const bodySchema = z.object({
	owner: z.string().min(1).max(100),
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
			{ error: "Invalid request. Provide 'owner' and 'repo'." },
			{ status: 400 },
		);
	}

	const { owner, repo } = parsed.data;
	const token = serverSession.githubUser?.accessToken;
	if (!token) {
		return Response.json({ error: "GitHub token not available" }, { status: 401 });
	}

	const octokit = new Octokit({ auth: token });
	const ghUser = serverSession.githubUser;
	const isAdmin = (serverSession.user as { role?: string }).role === "admin";
	const authorGithubId = String(ghUser?.id ?? serverSession.user.id);

	if (!isAdmin) {
		const slug = toSlug(owner, repo);
		const [existing, isUpdate] = await Promise.all([
			countExtensionsByAuthor(authorGithubId),
			extensionExistsBySlug(slug),
		]);
		// Currently we only allow a max of 5 uploads per user
		// until we have more thought around this this.
		if (!isUpdate && existing >= MAX_EXTENSIONS_PER_USER) {
			return Response.json(
				{
					error: `You can publish up to ${MAX_EXTENSIONS_PER_USER} extensions. Please remove one before publishing another.`,
				},
				{ status: 403 },
			);
		}
	}

	try {
		const scan = await scanExtensionRepo(octokit, owner, repo);
		const extension = await publishExtension(
			scan,
			authorGithubId,
			(ghUser?.login as string) ?? serverSession.user.name,
			(ghUser?.avatar_url as string) ?? serverSession.user.image ?? null,
			{ verified: isAdmin },
		);

		return Response.json(extension, { status: 201 });
	} catch (err) {
		if (err instanceof ScanError) {
			return Response.json({ error: err.message }, { status: err.statusCode });
		}
		console.error("Failed to publish extension:", err);
		return Response.json({ error: "Failed to scan repository" }, { status: 500 });
	}
}
