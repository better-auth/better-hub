import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrgMembers, getUser, getOctokit, getRepoPageData } from "@/lib/github";
import { PeopleList } from "@/components/people/people-list";
import { inviteOrgMember } from "./actions";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `People · ${owner}/${repo}` };
}

export default async function PeoplePage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	// Check access: only org members should see the people page
	const pageDataResult = await getRepoPageData(owner, repo);
	if (!pageDataResult.success) {
		redirect(`/${owner}/${repo}`);
	}

	const { repoData, viewerIsOrgMember } = pageDataResult.data;
	const showPeopleTab = repoData.owner.type === "Organization" && viewerIsOrgMember;

	if (!showPeopleTab) {
		redirect(`/${owner}/${repo}`);
	}

	const [members, octokit] = await Promise.all([getOrgMembers(owner, 100), getOctokit()]);

	// Fetch admin logins in parallel with member profiles
	const adminLoginsPromise = octokit
		? octokit.orgs
				.listMembers({ org: owner, role: "admin", per_page: 100 })
				.then(
					(res) =>
						new Set(
							res.data.map((m: { login: string }) =>
								m.login.toLowerCase(),
							),
						),
				)
				.catch(() => new Set<string>())
		: Promise.resolve(new Set<string>());

	// Fetch profiles for all members (capped at 50 to avoid rate limits)
	const memberLogins = members.slice(0, 50).map((m: { login: string }) => m.login);

	const [adminLogins, ...profiles] = await Promise.all([
		adminLoginsPromise,
		...memberLogins.map((login: string) => getUser(login).catch(() => null)),
	]);

	const people = members.map((m: { login: string; avatar_url: string }) => {
		const profile = profiles.find(
			(p) => p?.login?.toLowerCase() === m.login.toLowerCase(),
		);
		return {
			login: m.login,
			avatar_url: m.avatar_url,
			name: profile?.name ?? null,
			bio: profile?.bio ?? null,
			company: (profile as { company?: string | null })?.company ?? null,
			location: (profile as { location?: string | null })?.location ?? null,
			publicRepos: profile?.public_repos ?? 0,
			followers: profile?.followers ?? 0,
			role: (adminLogins as Set<string>).has(m.login.toLowerCase())
				? ("admin" as const)
				: ("member" as const),
		};
	});

	const handleInvite = inviteOrgMember.bind(null, owner);

	return <PeopleList owner={owner} repo={repo} people={people} onInvite={handleInvite} />;
}
