import type { GenericEndpointContext, Session, User } from "better-auth";
import { auth } from "../auth";
import { Octokit } from "@octokit/rest";
import { prisma } from "../db";
import { setCookieCache } from "better-auth/cookies";

export const backfillGithubLogin = async (ctx: GenericEndpointContext): Promise<any> => {
	// This hook is used to backfill the githubLogin field for users who signed up before the field was added.
	if (ctx.path !== "/get-session") return;
	const returned = ctx.context.returned as { session: Session; user: User } | undefined;

	if (!returned || !("session" in returned)) return;
	if ((returned.user as any).githubLogin) return;

	const userId = returned.user.id;
	const reqHeaders = ctx.headers;

	try {
		const account = await auth.api.getAccessToken({
			headers: reqHeaders,
			body: { providerId: "github" },
		});
		if (!account?.accessToken) return;

		const octokit = new Octokit({
			auth: account.accessToken,
		});
		const { data } = await octokit.users.getAuthenticated();
		if (data.login) {
			console.log(`Setting githubLogin for user ${userId} to ${data.login}`);
			await prisma.user.update({
				where: { id: userId },
				data: { githubLogin: data.login },
			});

			const value = {
				session: returned.session,
				user: {
					...returned.user,
					githubLogin: data.login,
				} as any,
			};

			await setCookieCache(ctx, value, false);
			return value;
		}
	} catch {
		// Will retry on the next session fetch
	}
};
