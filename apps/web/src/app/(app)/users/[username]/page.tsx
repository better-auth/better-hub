import type { Metadata } from "next";
import {
	getUser,
	getUserPublicRepos,
	getUserPublicOrgs,
	getUserOrgTopRepos,
	getContributionData,
} from "@/lib/github";
import { UserProfileContent } from "@/components/users/user-profile-content";
import { ExternalLink, User } from "lucide-react";

function UnknownUserPage({ username }: { username: string }) {
	const githubUrl = `https://github.com/${encodeURIComponent(username)}`;

	return (
		<div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
			<div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
				<User className="w-8 h-8 text-muted-foreground/50" />
			</div>
			<div>
				<h1 className="text-base font-medium">{username}</h1>
				<p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
					This account can&apos;t be viewed here. It may be a bot,
					app, or mannequin account.
				</p>
			</div>
			<a
				href={githubUrl}
				data-no-github-intercept
				target="_blank"
				rel="noopener noreferrer"
				className="flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors"
			>
				<ExternalLink className="w-3 h-3" />
				View on GitHub
			</a>
		</div>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ username: string }>;
}): Promise<Metadata> {
	const { username } = await params;
	const userData = await getUser(username).catch(() => null);
	if (!userData) {
		return { title: username };
	}
	const displayName = userData.name ? `${userData.name} (${userData.login})` : userData.login;
	return {
		title: displayName,
		description: userData.bio || `${displayName} on Better Hub`,
		openGraph: { title: displayName },
	};
}

export default async function UserProfilePage({
	params,
}: {
	params: Promise<{ username: string }>;
}) {
	const { username } = await params;

	let userData: Awaited<ReturnType<typeof getUser>> = null;
	let reposData: Awaited<ReturnType<typeof getUserPublicRepos>> = [];
	let orgsData: Awaited<ReturnType<typeof getUserPublicOrgs>> = [];
	let contributionData: Awaited<ReturnType<typeof getContributionData>> = null;
	let orgTopRepos: Awaited<ReturnType<typeof getUserOrgTopRepos>> = [];

	try {
		userData = await getUser(username);
	} catch {
		return <UnknownUserPage username={username} />;
	}

	if (!userData) {
		return <UnknownUserPage username={username} />;
	}

	const isBot = (userData as { type?: string }).type === "Bot";
	if (!isBot) {
		try {
			const resolvedLogin = userData.login;
			[reposData, orgsData, contributionData] = await Promise.all([
				getUserPublicRepos(resolvedLogin, 100),
				getUserPublicOrgs(resolvedLogin),
				getContributionData(resolvedLogin),
			]);
			// Fetch top repos from the user's orgs (for scoring)
			if (orgsData.length > 0) {
				orgTopRepos = await getUserOrgTopRepos(
					orgsData.map((o) => o.login),
				);
			}
		} catch {
			// Show profile with whatever we have
		}
	}

	return (
		<UserProfileContent
			user={{
				login: userData.login,
				name: userData.name ?? null,
				avatar_url: userData.avatar_url,
				html_url: userData.html_url,
				bio: userData.bio ?? null,
				blog: userData.blog || null,
				location: userData.location || null,
				company: userData.company || null,
				twitter_username:
					(userData as { twitter_username?: string | null })
						.twitter_username || null,
				public_repos: userData.public_repos,
				followers: userData.followers,
				following: userData.following,
				created_at: userData.created_at,
			}}
			repos={reposData.map((repo) => ({
				id: repo.id,
				name: repo.name,
				full_name: repo.full_name,
				description: repo.description,
				private: repo.private,
				fork: repo.fork,
				archived: repo.archived ?? false,
				language: repo.language ?? null,
				stargazers_count: repo.stargazers_count ?? 0,
				forks_count: repo.forks_count ?? 0,
				open_issues_count: repo.open_issues_count ?? 0,
				updated_at: repo.updated_at ?? null,
				pushed_at: repo.pushed_at ?? null,
			}))}
			orgs={orgsData.map((org) => ({
				login: org.login,
				avatar_url: org.avatar_url,
			}))}
			contributions={contributionData}
			orgTopRepos={orgTopRepos.map((r) => ({
				name: r.name,
				full_name: r.full_name,
				stargazers_count: r.stargazers_count,
				forks_count: r.forks_count,
				language: r.language,
			}))}
		/>
	);
}
