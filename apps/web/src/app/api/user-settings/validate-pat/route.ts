import { Octokit } from "@octokit/rest";
import { auth } from "@/lib/auth";
import { GITHUB_API_URL } from "@/lib/github-config";
import { getErrorMessage, getErrorStatus } from "@/lib/utils";
import { headers } from "next/headers";

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = await request.json();
	const pat = body.pat;

	if (!pat || typeof pat !== "string") {
		return Response.json({ valid: false, error: "No token provided" }, { status: 400 });
	}

	try {
		const octokit = new Octokit({ auth: pat, baseUrl: GITHUB_API_URL });
		const [userResp, rateLimitResp] = await Promise.all([
			octokit.users.getAuthenticated(),
			octokit.rateLimit.get(),
		]);

		return Response.json({
			valid: true,
			login: userResp.data.login,
			rateLimit: {
				limit: rateLimitResp.data.rate.limit,
				remaining: rateLimitResp.data.rate.remaining,
				reset: rateLimitResp.data.rate.reset,
			},
		});
	} catch (e: unknown) {
		return Response.json({
			valid: false,
			error:
				getErrorStatus(e) === 401
					? "Invalid token"
					: (getErrorMessage(e) ?? "Validation failed"),
		});
	}
}
