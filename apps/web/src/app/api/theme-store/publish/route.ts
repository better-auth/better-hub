import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { scanExtensionRepo, ScanError } from "@/lib/extension-scanner";
import { publishExtension } from "@/lib/theme-store";
import { getServerSession } from "@/lib/auth";

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

	try {
		const scan = await scanExtensionRepo(octokit, owner, repo);
		const ghUser = serverSession.githubUser;
		const isAdmin = (serverSession.user as { role?: string }).role === "admin";
		const extension = await publishExtension(
			scan,
			String(ghUser?.id ?? serverSession.user.id),
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
