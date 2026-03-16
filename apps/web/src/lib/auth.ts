import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { Octokit } from "@octokit/rest";
import { redis } from "./redis";
import { waitUntil } from "@vercel/functions";
import { createAuthMiddleware } from "better-auth/api";
import { all } from "better-all";
import { headers } from "next/headers";
import { cache } from "react";
import { dash, sentinel } from "@better-auth/infra";
import { createHash } from "@better-auth/utils/hash";
import { admin, bearer, deviceAuthorization, oAuthProxy, organization } from "better-auth/plugins";
import { stripe } from "@better-auth/stripe";
import { getStripeClient, isStripeEnabled } from "./billing/stripe";
import { grantSignupCredits } from "./billing/credit";
import { patSignIn } from "./auth-plugins/pat-signin";
import { storagePlugin } from "@better-hub/storage/plugin";
import { backfillGithubLogin } from "./auth-hooks/backfill-github-login";
import { backfillUncreatedUserOrgs } from "./auth-hooks/backfill-uncreated-user-orgs";
import { createDefaultOrganization } from "./auth-hooks/create-default-user-org";

async function getOctokitUser(token: string) {
	const cached = await redis.get<ReturnType<(typeof octokit)["users"]["getAuthenticated"]>>(
		`github_user:${token}`,
	);
	if (cached) return cached;
	const octokit = new Octokit({ auth: token });
	const githubUser = await octokit.users.getAuthenticated();
	const hash = await createHash("SHA-256", "base64").digest(token);
	waitUntil(redis.set(`github_user:${hash}`, JSON.stringify(githubUser.data), { ex: 3600 }));
	return githubUser;
}

export const auth = betterAuth({
	appName: "Better Hub",
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	experimental: {
		joins: true,
	},
	user: {
		additionalFields: {
			githubPat: {
				type: "string",
				required: false,
			},
			githubLogin: {
				type: "string",
				required: false,
			},
			onboardingDone: {
				type: "boolean",
				required: false,
			},
			aiMessageCount: {
				type: "number",
				required: false,
			},
		},
		deleteUser: {
			enabled: true,
		},
	},
	account: {
		encryptOAuthTokens: true,
		//cache the account in the cookie
		storeAccountCookie: true,
		//to update scopes
		updateAccountOnSignIn: true,
	},
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
			// Minimal default — the sign-in UI lets users opt into more
			scope: ["read:user", "user:email", "public_repo"],
			async mapProfileToUser(profile) {
				return {
					githubLogin: profile.login,
				};
			},
		},
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 60 * 60 * 24 * 7,
			strategy: "jwe",
		},
	},
	trustedOrigins: [
		// Production
		"https://www.better-hub.com",
		// Vercel preview
		"https://better-hub-*-better-auth.vercel.app",
		// Beta site
		"https://beta.better-hub.com",
	],
	advanced: {
		ipAddress: {
			ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await createDefaultOrganization(user);
				},
			},
		},
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			// Could return an updated user obj from get-session
			const result = await backfillGithubLogin(ctx);
			await backfillUncreatedUserOrgs(result ?? null, ctx);
			if (result) return result;
		}),
	},
	plugins: [
		dash({
			activityTracking: {
				enabled: true,
			},
		}),
		sentinel(),
		admin(),
		organization(),
		storagePlugin(),
		patSignIn(),
		bearer(),
		deviceAuthorization(),
		...(isStripeEnabled
			? ([
					stripe({
						stripeClient: getStripeClient(),
						stripeWebhookSecret:
							process.env.STRIPE_WEBHOOK_SECRET!,
						createCustomerOnSignUp: true,
						onCustomerCreate: async ({ user }) => {
							await grantSignupCredits(user.id);
						},
						subscription: {
							enabled: true,
							plans: [
								{
									name: "base",
									priceId: process.env
										.STRIPE_BASE_PRICE_ID!,
									lineItems: [
										{
											price: process
												.env
												.STRIPE_METERED_PRICE_ID!,
										},
									],
								},
							],
						},
					}),
				] as unknown as [])
			: []),
		...(process.env.VERCEL
			? [
					oAuthProxy({
						productionURL: "https://www.better-hub.com",
					}),
				]
			: []),
	],
});

export const getServerSession = cache(async () => {
	try {
		const { session, account } = await all({
			async session() {
				const session = await auth.api.getSession({
					headers: await headers(),
				});
				return session;
			},
			async account() {
				const session = await auth.api.getAccessToken({
					headers: await headers(),
					body: { providerId: "github" },
				});
				return session;
			},
		});
		if (!session || !account?.accessToken) {
			return null;
		}
		let githubUserData: Record<string, unknown> | null = null;
		try {
			const githubUser = await getOctokitUser(account.accessToken);
			githubUserData = githubUser?.data ?? null;
		} catch {
			// GitHub API may be rate-limited; don't treat as unauthenticated.
		}
		if (!githubUserData) {
			return {
				user: session.user,
				session,
				githubUser: { accessToken: account.accessToken } as any,
			};
		}
		return {
			user: session.user,
			session,
			githubUser: {
				...githubUserData,
				accessToken: account.accessToken,
			},
		};
	} catch {
		return null;
	}
});

export type $Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;
