import type { UserBadge } from "@/components/users/user-badges";

export interface FetchedUserProfile {
	login: string;
	name: string | null;
	avatar_url: string;
	html_url: string;
	bio: string | null;
	blog: string | null;
	location: string | null;
	company: string | null;
	twitter_username?: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string;
	badges?: UserBadge[];
	type?: string;
}

async function fetchUserBadgesFromGitHub(
	token: string,
	username: string,
): Promise<UserBadge[]> {
	const query = `
    query($username: String!) {
      user(login: $username) {
        badges {
          name
          description
          icon
        }
      }
    }
  `;

	try {
		const response = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables: { username } }),
		});

		if (!response.ok) return [];
		const json = await response.json();

		// Check if badges field exists in response
		const badges = json.data?.user?.badges;
		if (!Array.isArray(badges)) return [];

		return badges.map((badge: { name: string; description: string; icon: string }) => ({
			name: badge.name,
			description: badge.description,
			icon: badge.icon,
		}));
	} catch {
		return [];
	}
}

async function fetchUserProfileFromGitHub(octokit: Octokit, username: string) {
	// Try direct user lookup first
	try {
		const { data } = await octokit.users.getByUsername({ username });
		return data;
	} catch {
		// continue to fallbacks
	}

	if (!username.endsWith("[bot]")) {
		try {
			const { data } = await octokit.users.getByUsername({
				username: `${username.toLowerCase()}[bot]`,
			});
			return data;
		} catch {
			// continue
		}
	}

	try {
		const { data: app } = await octokit.request("GET /apps/{app_slug}", {
			app_slug: username.toLowerCase(),
		});
		const appData = app as Record<string, unknown>;
		return {
			login: (appData.slug as string) ?? username,
			name: (appData.name as string) ?? username,
			avatar_url:
				((appData.owner as Record<string, unknown>)
					?.avatar_url as string) ?? "",
			html_url:
				(appData.html_url as string) ??
				`https://github.com/apps/${username.toLowerCase()}`,
			bio: (appData.description as string) ?? null,
			blog: (appData.external_url as string) ?? null,
			location: null,
			company: null,
			twitter_username: null,
			public_repos: 0,
			followers: 0,
			following: 0,
			created_at: (appData.created_at as string) ?? new Date().toISOString(),
			type: "Bot",
		};
	} catch {
		// all lookups failed
	}

	return null;
}

async function fetchUserWithBadgesFromGitHub(
	octokit: Octokit,
	token: string,
	username: string,
): Promise<FetchedUserProfile | null> {
	const profile = await fetchUserProfileFromGitHub(octokit, username);
	if (!profile) return null;

	// Fetch badges separately
	const badges = await fetchUserBadgesFromGitHub(token, username);

	return {
		...profile,
		badges,
	};
}

export { fetchUserWithBadgesFromGitHub, fetchUserBadgesFromGitHub };
