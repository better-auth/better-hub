import { Octokit } from "@octokit/rest";
import { getServerSession } from "@/lib/auth";

export async function GET() {
	const serverSession = await getServerSession();
	if (!serverSession?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const token = serverSession.githubUser?.accessToken;
	if (!token) {
		return Response.json({ error: "GitHub token not available" }, { status: 401 });
	}

	const login = serverSession.githubUser?.login as string | undefined;
	if (!login) {
		return Response.json(
			{ error: "Could not determine your GitHub username" },
			{ status: 401 },
		);
	}

	const octokit = new Octokit({ auth: token });

	try {
		const repos = await octokit.paginate(
			octokit.repos.listForAuthenticatedUser,
			{ visibility: "public", sort: "updated", per_page: 100 },
			(response) =>
				response.data.map((r) => ({
					name: r.name,
					fullName: r.full_name,
					description: r.description,
				})),
		);

		return Response.json({ login, repos });
	} catch {
		return Response.json({ error: "Failed to fetch repositories" }, { status: 500 });
	}
}
