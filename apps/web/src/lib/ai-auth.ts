import { Octokit } from "@octokit/rest";
import { getServerSession } from "@/lib/auth";
import { GITHUB_API_URL } from "@/lib/github-config";

export async function getOctokitFromSession(): Promise<Octokit | null> {
	const token = await getGitHubToken();
	if (!token) return null;
	return new Octokit({ auth: token, baseUrl: GITHUB_API_URL });
}

export async function getGitHubToken(): Promise<string | null> {
	const session = await getServerSession();
	if (!session) return null;
	return session.githubUser.accessToken;
}
