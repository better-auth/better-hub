import type { Metadata } from "next";
import { ReposContent } from "@/components/repos/repos-content";
import { getStarredRepos } from "@/lib/github";

export const metadata: Metadata = {
	title: "Stars",
};

export default async function StarsPage() {
	const repos = await getStarredRepos(100);
	const normalizedRepos = repos.map((repo) => ({
		id: repo.id,
		name: repo.name,
		full_name: repo.full_name,
		description: repo.description ?? null,
		html_url: repo.html_url,
		stargazers_count: repo.stargazers_count ?? 0,
		forks_count: repo.forks_count ?? 0,
		language: repo.language ?? null,
		updated_at: repo.updated_at ?? null,
		pushed_at: repo.pushed_at ?? null,
		private: repo.private ?? false,
		fork: repo.fork ?? false,
		archived: repo.archived ?? false,
		open_issues_count: repo.open_issues_count ?? 0,
		owner: repo.owner
			? {
					login: repo.owner.login,
					avatar_url: repo.owner.avatar_url,
					type: repo.owner.type,
				}
			: undefined,
	}));

	return (
		<ReposContent
			repos={normalizedRepos}
			title="Starred Repositories"
			searchPlaceholder="Find a starred repository..."
		/>
	);
}
