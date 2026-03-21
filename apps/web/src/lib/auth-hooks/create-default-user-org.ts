import type { User } from "better-auth";
import { auth } from "../auth";

export async function createDefaultOrganization(_user: User) {
	const user = _user as User & {
		username: string;
		githubLogin: string;
	};
	if (!user.githubLogin) {
		throw new Error("User has no github login");
	}

	await auth.api.createOrganization({
		body: {
			name: user.githubLogin,
			slug: user.githubLogin,
			userId: user.id,
			logo: user.image ?? undefined,
			metadata: {
				isUserOrganization: true,
			},
		},
	});
}
