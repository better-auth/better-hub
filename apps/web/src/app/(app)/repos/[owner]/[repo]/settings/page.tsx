import type { Metadata } from "next";
import { Settings, ShieldAlert } from "lucide-react";
import { getOctokit, getRepoBranches, extractRepoPermissions } from "@/lib/github";
import { RepoSettings } from "@/components/repo/repo-settings";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Settings · ${owner}/${repo}` };
}

export default async function SettingsPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;
	const octokit = await getOctokit();

	if (!octokit) {
		return (
			<div className="py-16 text-center">
				<Settings className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
				<h2 className="text-sm font-medium text-muted-foreground/70">
					Settings
				</h2>
				<p className="text-xs text-muted-foreground/50 font-mono mt-1">
					Sign in to access repository settings
				</p>
			</div>
		);
	}

	let repoData;
	try {
		const { data } = await octokit.repos.get({ owner, repo });
		repoData = data;
	} catch {
		return (
			<div className="py-16 text-center">
				<Settings className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
				<h2 className="text-sm font-medium text-muted-foreground/70">
					Settings
				</h2>
				<p className="text-xs text-muted-foreground/50 font-mono mt-1">
					Failed to load repository data
				</p>
			</div>
		);
	}

	const permissions = extractRepoPermissions(repoData);

	if (!permissions.admin) {
		return (
			<div className="py-16 text-center">
				<ShieldAlert className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
				<h2 className="text-sm font-medium text-muted-foreground/70">
					Access Denied
				</h2>
				<p className="text-xs text-muted-foreground/50 font-mono mt-1">
					You need admin permissions to access repository settings
				</p>
			</div>
		);
	}

	const branchesData = await getRepoBranches(owner, repo);
	const branches = (branchesData ?? []).map((b: { name: string }) => b.name);

	return (
		<RepoSettings
			owner={owner}
			repo={repo}
			repoData={{
				name: repoData.name,
				description: repoData.description,
				homepage: repoData.homepage,
				private: repoData.private,
				archived: repoData.archived,
				topics: repoData.topics ?? [],
				default_branch: repoData.default_branch,
				has_wiki: repoData.has_wiki ?? false,
				has_issues: repoData.has_issues ?? false,
				has_projects: repoData.has_projects ?? false,
				has_discussions: repoData.has_discussions ?? false,
				allow_merge_commit: repoData.allow_merge_commit ?? true,
				allow_squash_merge: repoData.allow_squash_merge ?? true,
				allow_rebase_merge: repoData.allow_rebase_merge ?? true,
				delete_branch_on_merge: repoData.delete_branch_on_merge ?? false,
			}}
			branches={branches}
		/>
	);
}
