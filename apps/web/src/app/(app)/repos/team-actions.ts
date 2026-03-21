"use server";

import { getOctokit } from "@/lib/github";
import { getErrorMessage } from "@/lib/utils";

export type RepoTeam = {
	name: string;
	slug: string;
	permission: string;
	description: string | null;
};

export async function listRepoTeams(
	owner: string,
	repo: string,
): Promise<{ teams: RepoTeam[] } | { error: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { error: "Not authenticated" };
	try {
		const { data } = await octokit.teams.listForRepo({
			owner,
			repo,
			per_page: 100,
		});
		return {
			teams: data.map((t) => ({
				name: t.name,
				slug: t.slug,
				permission: t.permission,
				description: t.description ?? null,
			})),
		};
	} catch (e: unknown) {
		return { error: getErrorMessage(e) || "Failed to list teams" };
	}
}

export async function addTeamsToRepo(
	owner: string,
	repos: string[],
	teams: { slug: string; permission: string }[],
): Promise<{ added: { repo: string; team: string }[]; errors: string[] }> {
	const octokit = await getOctokit();
	if (!octokit)
		return { added: [], errors: ["Not authenticated"] };

	const results = await Promise.allSettled(
		repos.flatMap((repo) =>
			teams.map((team) =>
				octokit.teams
					.addOrUpdateRepoPermissionsInOrg({
						org: owner,
						team_slug: team.slug,
						owner,
						repo,
						permission: team.permission as
							| "pull"
							| "triage"
							| "push"
							| "maintain"
							| "admin",
					})
					.then(() => ({ repo, team: team.slug })),
			),
		),
	);

	const added: { repo: string; team: string }[] = [];
	const errors: string[] = [];

	for (const result of results) {
		if (result.status === "fulfilled") {
			added.push(result.value);
		} else {
			errors.push(String(result.reason));
		}
	}

	return { added, errors };
}

export async function copyRepoTeamAccess(
	owner: string,
	sourceRepo: string,
	targetRepos: string[],
): Promise<{
	results: {
		repo: string;
		team: string;
		permission: string;
		success: boolean;
		error?: string;
	}[];
}> {
	const octokit = await getOctokit();
	if (!octokit) {
		return {
			results: targetRepos.map((repo) => ({
				repo,
				team: "Unknown",
				permission: "Unknown",
				success: false,
				error: "Not authenticated",
			})),
		};
	}

	let sourceTeams: RepoTeam[];
	try {
		const { data } = await octokit.teams.listForRepo({
			owner,
			repo: sourceRepo,
			per_page: 100,
		});
		sourceTeams = data.map((t) => ({
			name: t.name,
			slug: t.slug,
			permission: t.permission,
			description: t.description ?? null,
		}));
	} catch (e: unknown) {
		return {
			results: targetRepos.map((repo) => ({
				repo,
				team: "Unknown",
				permission: "Unknown",
				success: false,
				error:
					getErrorMessage(e) ||
					`Failed to list teams for ${sourceRepo}`,
			})),
		};
	}

	const settled = await Promise.allSettled(
		targetRepos.flatMap((repo) =>
			sourceTeams.map((team) =>
				octokit.teams
					.addOrUpdateRepoPermissionsInOrg({
						org: owner,
						team_slug: team.slug,
						owner,
						repo,
						permission: team.permission as
							| "pull"
							| "triage"
							| "push"
							| "maintain"
							| "admin",
					})
					.then(() => ({
						repo,
						team: team.name,
						permission: team.permission,
						success: true as const,
					})),
			),
		),
	);

	return {
		results: settled.map((r) =>
			r.status === "fulfilled"
				? r.value
				: {
						repo: "Unknown",
						team: "Unknown",
						permission: "Unknown",
						success: false,
						error: String(r.reason),
					},
		),
	};
}
