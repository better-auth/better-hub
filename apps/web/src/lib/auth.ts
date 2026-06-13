import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { redis } from "./redis";
import { waitUntil } from "@vercel/functions";
import { all } from "better-all";
import { headers } from "next/headers";
import { cache } from "react";
import { dash, sentinel } from "@better-auth/infra";
import { createHash } from "@better-auth/utils/hash";
import { admin, oAuthProxy, genericOAuth } from "better-auth/plugins";
import { stripe } from "@better-auth/stripe";
import { getStripeClient, isStripeEnabled } from "./billing/stripe";
import { grantSignupCredits } from "./billing/credit";
import { patSignIn } from "./auth-plugins/pat-signin";
import {
	createOctokit,
	GITHUB_OAUTH_AUTHORIZE_URL,
	GITHUB_OAUTH_TOKEN_URL,
	GITHUB_USER_EMAILS_URL,
	GITHUB_USER_INFO_URL,
	IS_GITHUB_ENTERPRISE,
	persistedAvatarUrl,
} from "./github-host";

async function getOctokitUser(token: string) {
	const cached = await redis.get<ReturnType<(typeof octokit)["users"]["getAuthenticated"]>>(
		`github_user:${token}`,
	);
	if (cached) return cached;
	const octokit = createOctokit({ auth: token });
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
		...(process.env.VERCEL
			? [oAuthProxy({ productionURL: "https://www.better-hub.com" })]
			: []),
		...(IS_GITHUB_ENTERPRISE
			? [
					genericOAuth({
						config: [
							{
								providerId: "github",
								clientId: process.env
									.GITHUB_CLIENT_ID!,
								clientSecret:
									process.env
										.GITHUB_CLIENT_SECRET!,
								authorizationUrl:
									GITHUB_OAUTH_AUTHORIZE_URL,
								tokenUrl: GITHUB_OAUTH_TOKEN_URL,
								userInfoUrl: GITHUB_USER_INFO_URL,
								scopes: [
									"read:user",
									"user:email",
									"public_repo",
								],
								// `profile` here is the OAuth2UserInfo returned from
								// getUserInfo below, which we extend with `login`.
								// Cast because genericOAuth's mapProfileToUser type
								// doesn't know about our `githubLogin` additionalField.
								mapProfileToUser: ((profile: {
									login?: string;
								}) => ({
									githubLogin: profile.login,
								})) as unknown as Parameters<
									typeof genericOAuth
								>[0]["config"][number]["mapProfileToUser"],
								async getUserInfo(tokens) {
									const token =
										tokens.accessToken;
									if (!token) return null;
									const userRes = await fetch(
										GITHUB_USER_INFO_URL,
										{
											headers: {
												Authorization: `Bearer ${token}`,
												Accept: "application/vnd.github+json",
												"User-Agent":
													"better-hub",
											},
										},
									);
									if (!userRes.ok)
										return null;
									const profile =
										(await userRes.json()) as {
											id?:
												| number
												| string;
											login?: string;
											name?:
												| string
												| null;
											email?:
												| string
												| null;
											avatar_url?: string;
										};
									let email: string | null =
										profile.email ??
										null;
									let emailVerified = false;
									try {
										const emailsRes =
											await fetch(
												GITHUB_USER_EMAILS_URL,
												{
													headers: {
														Authorization: `Bearer ${token}`,
														Accept: "application/vnd.github+json",
														"User-Agent":
															"better-hub",
													},
												},
											);
										if (emailsRes.ok) {
											const emails =
												(await emailsRes.json()) as {
													email: string;
													primary: boolean;
													verified: boolean;
												}[];
											const primary =
												emails.find(
													(
														e,
													) =>
														e.primary &&
														e.verified,
												) ??
												emails.find(
													(
														e,
													) =>
														e.verified,
												) ??
												emails[0];
											if (
												primary
											) {
												email =
													email ??
													primary.email;
												emailVerified =
													emails.find(
														(
															e,
														) =>
															e.email ===
															email,
													)
														?.verified ??
													false;
											}
										}
									} catch {
										// user:email scope might be missing on enterprise tokens
									}
									if (!email) return null;
									// Cast: we attach `login` so mapProfileToUser can pick it up.
									return {
										id: String(
											profile.id ??
												"",
										),
										name:
											(profile.name as string) ||
											(profile.login as string) ||
											"",
										email,
										image: persistedAvatarUrl(
											profile.id ??
												"",
											profile.avatar_url,
										),
										emailVerified,
										login: profile.login,
									} as unknown as Awaited<
										ReturnType<
											NonNullable<
												Parameters<
													typeof genericOAuth
												>[0]["config"][number]["getUserInfo"]
											>
										>
									>;
								},
							},
						],
					}),
				]
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
	socialProviders: IS_GITHUB_ENTERPRISE
		? {}
		: {
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
