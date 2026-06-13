import type { Octokit } from "@octokit/rest";
import { getServerSession } from "@/lib/auth";
import { createOctokit } from "@/lib/github-host";

export async function getOctokitFromSession(): Promise<Octokit | null> {
	const token = await getGitHubToken();
	if (!token) return null;
	return createOctokit({ auth: token });
}

export async function getGitHubToken(): Promise<string | null> {
	const session = await getServerSession();
	if (!session) return null;
	return session.githubUser.accessToken;
}
