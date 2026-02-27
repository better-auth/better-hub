import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
	getOrg,
	getOrgRepos,
	getUser,
	getUserPublicRepos,
	getUserPublicOrgs,
	getUserOrgTopRepos,
	getUserFollowers,
	getUserFollowing,
	getContributionData,
} from "@/lib/github";
import { ogImageUrl, ogImages } from "@/lib/og/og-utils";
import { resolveProfileTab } from "@/lib/utils";
import { OrgDetailContent } from "@/components/orgs/org-detail-content";
import { UserProfileContent } from "@/components/users/user-profile-content";

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
	return result.status === "fulfilled" ? result.value : fallback;
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string }>;
}): Promise<Metadata> {
	const { owner } = await params;
	const ogUrl = ogImageUrl({ type: "owner", owner });
	const userData = await getUser(owner).catch(() => null);
	if (!userData) {
		return { title: owner };
	}

	const actorType = (userData as { type?: string }).type;
	if (actorType === "Organization") {
		const orgData = await getOrg(owner).catch(() => null);
		const title = orgData?.name || orgData?.login || userData.name || userData.login;
		const description =
			orgData?.description || userData.bio || `${title} on Better Hub`;
		return {
			title,
			description,
			openGraph: { title, ...ogImages(ogUrl) },
			twitter: { card: "summary_large_image", ...ogImages(ogUrl) },
		};
	}

	const displayName = userData.name ? `${userData.name} (${userData.login})` : userData.login;
	return {
		title: displayName,
		description: userData.bio || `${displayName} on Better Hub`,
		openGraph: { title: displayName, ...ogImages(ogUrl) },
		twitter: { card: "summary_large_image", ...ogImages(ogUrl) },
	};
}

export default async function OwnerPage({
	params,
	searchParams,
}: {
	params: Promise<{ owner: string }>;
	searchParams?: Promise<{ tab?: string }>;
}) {
	const { owner } = await params;
	const rawTab = (await searchParams)?.tab;
	const tab = resolveProfileTab(rawTab);

	// Resolve actor first to avoid noisy /orgs/:user 404 calls for user handles.
	const actorData = await getUser(owner).catch(() => null);
	if (!actorData) {
		notFound();
	}

	const actorType = (actorData as { type?: string }).type;
	if (actorType === "Organization") {
		const orgData = await getOrg(owner).catch(() => null);
		const orgLike = orgData ?? actorData;
		const orgDescription =
			"description" in orgLike && typeof orgLike.description === "string"
				? orgLike.description
				: null;
		const orgBio =
			"bio" in orgLike && typeof orgLike.bio === "string" ? orgLike.bio : null;
		const orgBlog =
			"blog" in orgLike && typeof orgLike.blog === "string" ? orgLike.blog : null;

		if (tab === "followers" || tab === "following") {
			redirect(`/${owner}`);
		}
		const reposData = await getOrgRepos(owner, {
			perPage: 100,
			sort: "updated",
			type: "all",
		}).catch(() => []);

		return (
			<OrgDetailContent
				org={{
					login: orgLike.login,
					name: orgLike.name ?? null,
					avatar_url: orgLike.avatar_url,
					html_url:
						orgLike.html_url ??
						`https://github.com/${orgLike.login}`,
					description: orgDescription ?? orgBio,
					blog: orgBlog,
					location: orgLike.location || null,
					public_repos: orgLike.public_repos ?? 0,
					followers: orgLike.followers ?? 0,
					following: orgLike.following ?? 0,
					created_at: orgLike.created_at,
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
		);
	}

	const userData = actorData;
	if (!userData) {
		notFound();
	}

	const userActorType = (userData as { type?: string }).type;
	const isBot = userActorType === "Bot";
	const isStandardUser = userActorType === "User" || !userActorType;

	let reposData: Awaited<ReturnType<typeof getUserPublicRepos>> = [];
	let orgsData: Awaited<ReturnType<typeof getUserPublicOrgs>> = [];
	let contributionData: Awaited<ReturnType<typeof getContributionData>> = null;
	let orgTopRepos: Awaited<ReturnType<typeof getUserOrgTopRepos>> = [];
	let followersData: Awaited<ReturnType<typeof getUserFollowers>> = [];
	let followingData: Awaited<ReturnType<typeof getUserFollowing>> = [];

	if (!isBot) {
		const [
			reposResult,
			orgsResult,
			contributionResult,
			followersResult,
			followingResult,
		] = await Promise.allSettled([
			getUserPublicRepos(userData.login, 100),
			isStandardUser ? getUserPublicOrgs(userData.login) : Promise.resolve([]),
			isStandardUser
				? getContributionData(userData.login)
				: Promise.resolve(null),
			getUserFollowers(userData.login, 100),
			getUserFollowing(userData.login, 100),
		]);

		reposData = settledValue(reposResult, []);
		orgsData = settledValue(orgsResult, []);
		contributionData = settledValue(contributionResult, null);
		followersData = settledValue(followersResult, []);
		followingData = settledValue(followingResult, []);

		if (isStandardUser && orgsData.length > 0) {
			orgTopRepos = await getUserOrgTopRepos(orgsData.map((o) => o.login)).catch(
				() => [],
			);
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
			followers={followersData}
			following={followingData}
			initialTab={tab}
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
