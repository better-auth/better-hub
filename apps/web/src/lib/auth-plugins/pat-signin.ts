import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { symmetricEncrypt } from "better-auth/crypto";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import type { BetterAuthPlugin } from "better-auth";

export const patSignIn = (): BetterAuthPlugin => ({
	id: "pat-signin",
	endpoints: {
		patSignIn: createAuthEndpoint(
			"/pat-signin",
			{
				method: "POST",
				body: z.object({
					pat: z.string().min(1),
				}),
				metadata: {
					openapi: {
						summary: "Sign in with a GitHub Personal Access Token",
						responses: { 200: { description: "Success" } },
					},
				},
			},
			async (ctx) => {
				const { pat } = ctx.body;
				const { internalAdapter, secret } = ctx.context;

				// --- Validate PAT against GitHub ---
				const octokit = new Octokit({ auth: pat });
				let githubUser: Awaited<
					ReturnType<typeof octokit.users.getAuthenticated>
				>["data"];
				try {
					const resp = await octokit.users.getAuthenticated();
					githubUser = resp.data;
				} catch {
					throw ctx.error("UNAUTHORIZED", {
						message: "Invalid GitHub token",
					});
				}

				// --- Resolve email (may be private) ---
				let email = githubUser.email;
				if (!email) {
					try {
						const emails =
							await octokit.users.listEmailsForAuthenticatedUser();
						const primary = emails.data.find(
							(e) => e.primary && e.verified,
						);
						email =
							primary?.email ??
							emails.data.find((e) => e.verified)?.email ??
							null;
					} catch {
						// user:email scope might not be available
					}
				}
				if (!email) {
					throw ctx.error("BAD_REQUEST", {
						message:
							"Could not determine your GitHub email. Ensure the token has the user:email scope.",
					});
				}

				// --- Encrypt PAT (same as OAuth token encryption) ---
				const encryptedPat = await symmetricEncrypt({
					key: secret,
					data: pat,
				});
				const accountId = String(githubUser.id);

				// --- Find or create user ---
				const existing = await internalAdapter.findOAuthUser(
					email,
					accountId,
					"github",
				);

				let userId: string;

				if (existing?.user) {
					userId = existing.user.id;
					if (existing.linkedAccount) {
						await internalAdapter.updateAccount(
							existing.linkedAccount.id,
							{ accessToken: encryptedPat },
						);
					}
				} else {
					const created = await internalAdapter.createOAuthUser(
						{
							name: githubUser.name || githubUser.login,
							email,
							image: githubUser.avatar_url,
							emailVerified: true,
						},
						{
							providerId: "github",
							accountId,
							accessToken: encryptedPat,
							scope: "read:user,user:email",
						},
					);
					userId = created.user.id;
					await internalAdapter.updateUser(userId, {
						githubLogin: githubUser.login,
					} as Record<string, unknown>);
				}

				// --- Create session + set cookie via Better Auth ---
				const session = await internalAdapter.createSession(
					userId,
					false,
				);
				const user = existing?.user ??
					(await internalAdapter.findUserById(userId))!;

				await setSessionCookie(ctx, { session, user });

				return ctx.json({ success: true });
			},
		),
	},
	rateLimit: [
		{
			pathMatcher: (path) => path === "/pat-signin",
			window: 60,
			max: 5,
		},
	],
});
