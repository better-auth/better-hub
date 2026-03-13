import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { Octokit } from "@octokit/rest";
import { redis } from "./redis";
import { GITHUB_API_URL, GITHUB_WEB_URL } from "./github-config";
import { waitUntil } from "@vercel/functions";
import { all } from "better-all";
import { headers } from "next/headers";
import { cache } from "react";
import { dash, sentinel } from "@better-auth/infra";
import { admin, genericOAuth, oAuthProxy } from "better-auth/plugins";
import { stripe } from "@better-auth/stripe";
import { getStripeClient, isStripeEnabled } from "./billing/stripe";
import { grantSignupCredits } from "./billing/credit";
import { patSignIn } from "./auth-plugins/pat-signin";

async function getOctokitUser(token: string) {
	const cacheKey = `github_user:${token.slice(-8)}`;
	const cached = await redis.get<Record<string, unknown>>(cacheKey);
	if (cached) return { data: cached };
	const octokit = new Octokit({ auth: token, baseUrl: GITHUB_API_URL });
	const githubUser = await octokit.users.getAuthenticated();
	waitUntil(redis.set(cacheKey, JSON.stringify(githubUser.data), { ex: 3600 }));
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
	plugins: [
		dash({
			activityTracking: {
				enabled: true,
			},
		}),
		sentinel(),
		admin(),
		patSignIn(),
		...(isStripeEnabled
			? [
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
				]
			: []),
		genericOAuth({
			config: [
				{
					providerId: "github",
					clientId: process.env.GITHUB_CLIENT_ID!,
					clientSecret: process.env.GITHUB_CLIENT_SECRET!,
					authorizationUrl: `${GITHUB_WEB_URL}/login/oauth/authorize`,
					tokenUrl: `${GITHUB_WEB_URL}/login/oauth/access_token`,
					scopes: ["read:user", "user:email", "public_repo"],
					async getUserInfo(tokens) {
						const headers = {
							Authorization: `Bearer ${tokens.accessToken}`,
						};
						const [userRes, emailsRes] = await Promise.all([
							fetch(`${GITHUB_API_URL}/user`, {
								headers,
							}),
							fetch(`${GITHUB_API_URL}/user/emails`, {
								headers,
							}),
						]);
						const user = await userRes.json();
						let email = user.email;
						if (!email) {
							const emails = await emailsRes
								.json()
								.catch(() => []);
							const primary = Array.isArray(emails)
								? emails.find(
										(e: any) =>
											e.primary &&
											e.verified,
									)
								: null;
							email =
								primary?.email ??
								emails?.[0]?.email ??
								null;
						}
						return {
							id: String(user.id),
							name: user.name || user.login,
							email,
							image: user.avatar_url,
							emailVerified: true,
							login: user.login,
						};
					},
					mapProfileToUser: async (profile) => ({
						githubLogin: profile.login,
					}),
				},
			],
		}),
		...(process.env.VERCEL
			? [oAuthProxy({ productionURL: "https://www.better-hub.com" })]
			: []),
	],
	user: {
		additionalFields: {
			githubPat: {
				type: "string",
				required: false,
			},
			onboardingDone: {
				type: "boolean",
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
		// Local dev
		"http://gpu.server:3001",
	],
	advanced: {
		ipAddress: {
			ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
		},
	},
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
		} catch (err) {
			console.error("[getServerSession] getOctokitUser failed:", err);
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
