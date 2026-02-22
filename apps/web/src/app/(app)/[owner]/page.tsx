import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getOrg, getOrgRepos, getUser, getUserPublicRepos, getUserPublicOrgs, getContributionData } from "@/lib/github";
import { OrgDetailContent } from "@/components/orgs/org-detail-content";
import { UserProfileContent } from "@/components/users/user-profile-content";
import { ExternalLink, User } from "lucide-react";

function UnknownAccountPage({ name }: { name: string }) {
	const githubUrl = `https://github.com/${encodeURIComponent(name)}`;

	return (
		<div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
			<div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
				<User className="w-8 h-8 text-muted-foreground/50" />
			</div>
			<div>
				<h1 className="text-base font-medium">{name}</h1>
				<p className="text-xs text-muted-foreground/60 mt-1 max-w-[240px]">
					This account can&apos;t be viewed here. It may be a bot,
					app, or mannequin account.
				</p>
			</div>
			<a
				href={githubUrl}
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

export default async function OwnerPage({ params }: { params: Promise<{ owner: string }> }) {
	const { owner } = await params;

	// Try org first — GitHub orgs return from getOrg, users don't
	const orgData = await getOrg(owner).catch(() => null);

	if (orgData) {
		const reposData = await getOrgRepos(owner, { perPage: 100, sort: "updated", type: "all" }).catch(() => []);

		return (
			<Suspense fallback={<ProfileSkeleton />}>
			<OrgDetailContent
				org={{
					login: orgData.login,
					name: orgData.name ?? null,
					avatar_url: orgData.avatar_url,
					html_url: orgData.html_url ?? `https://github.com/${orgData.login}`,
					description: orgData.description ?? null,
					blog: orgData.blog || null,
					location: orgData.location || null,
					public_repos: orgData.public_repos,
					followers: orgData.followers,
					following: orgData.following,
					created_at: orgData.created_at,
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
			/>
			</Suspense>
		);
	}

	// Fall back to user profile
	const userData = await getUser(owner).catch(() => null);

	if (!userData) {
		notFound();
	}

	const isBot = (userData as { type?: string }).type === "Bot";

	let reposData: Awaited<ReturnType<typeof getUserPublicRepos>> = [];
	let orgsData: Awaited<ReturnType<typeof getUserPublicOrgs>> = [];
	let contributionData: Awaited<ReturnType<typeof getContributionData>> = null;

	if (!isBot) {
		try {
			[reposData, orgsData, contributionData] = await Promise.all([
				getUserPublicRepos(userData.login, 100),
				getUserPublicOrgs(userData.login),
				getContributionData(userData.login),
			]);
		} catch {
			// Show profile with whatever we have
		}
	}

	return (
		<Suspense fallback={<ProfileSkeleton />}>
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
		/>
		</Suspense>
	);
}

function ProfileSkeleton() {
	return (
		<div className="animate-pulse">
			<div className="flex items-start gap-6 mb-6">
				<div className="w-20 h-20 rounded-full bg-muted shrink-0" />
				<div className="flex-1 space-y-2 pt-1">
					<div className="h-5 w-40 rounded bg-muted" />
					<div className="h-3.5 w-24 rounded bg-muted/60" />
					<div className="h-3 w-64 rounded bg-muted/40 mt-2" />
				</div>
			</div>
			<div className="space-y-3">
				{[0, 1, 2, 3].map((i) => (
					<div key={i} className="h-16 rounded-md border border-border/40 bg-muted/20" />
				))}
			</div>
		</div>
	);
}
