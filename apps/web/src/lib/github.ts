export async function getUserBadges(username: string): Promise<UserBadge[]> {
	const authCtx = await getGitHubAuthContext();
	if (!authCtx) return [];

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
				Authorization: `Bearer ${authCtx.token}`,
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

export async function getAuthorDossier(
	owner: string,
	repo: string,
	authorLogin: string,
): Promise<AuthorDossierResult | null> {
