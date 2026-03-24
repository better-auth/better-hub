import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";
import { Octokit } from "@octokit/rest";
import { redis } from "./redis";
import { waitUntil } from "@vercel/functions";
import { all } from "better-all";
import { headers } from "next/headers";
import { cache } from "react";
import { dash, sentinel } from "@better-auth/infra";
import { createHash } from "@better-auth/utils/hash";
import { admin, oAuthProxy } from "better-auth/plugins";
import { stripe } from "@better-auth/stripe";
import { getStripeClient, isStripeEnabled } from "./billing/stripe";
import { grantSignupCredits } from "./billing/credit";
import { patSignIn } from "./auth-plugins/pat-signin";

type GitHubUserProfile = Awaited<ReturnType<Octokit["users"]["getAuthenticated"]>>["data"];
type AuthSessionValue = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type AuthGitHubUser = GitHubUserProfile & { accessToken: string };

function asAuthPlugin(plugin: unknown): BetterAuthPlugin {
	return plugin as BetterAuthPlugin;
}

async function getOctokitUser(token: string): Promise<GitHubUserProfile> {
	const hash = await createHash("SHA-256", "base64").digest(token);
	const cacheKey = `github_user:${hash}`;
	const cached = await redis.get<GitHubUserProfile>(cacheKey);
	if (cached) return cached;
	const octokit = new Octokit({ auth: token });
	const githubUser = await octokit.users.getAuthenticated();
	waitUntil(redis.set(cacheKey, JSON.stringify(githubUser.data), { ex: 3600 }));
	return githubUser.data;
}

function buildFallbackGitHubUser(session: AuthSessionValue, accessToken: string): AuthGitHubUser {
	return {
		id: 0,
		login: "",
		node_id: "",
		avatar_url: session.user.image ?? "",
		gravatar_id: "",
		url: "",
		html_url: "",
		followers_url: "",
		following_url: "",
		gists_url: "",
		starred_url: "",
		subscriptions_url: "",
		organizations_url: "",
		repos_url: "",
		events_url: "",
		received_events_url: "",
		type: "User",
		site_admin: false,
		name: session.user.name ?? "",
		company: null,
		blog: "",
		location: null,
		email: session.user.email ?? null,
		hireable: null,
		bio: null,
		twitter_username: null,
		notification_email: null,
		public_repos: 0,
		public_gists: 0,
		followers: 0,
		following: 0,
		created_at: "",
		updated_at: "",
		private_gists: undefined,
		total_private_repos: undefined,
		owned_private_repos: undefined,
		disk_usage: undefined,
		collaborators: undefined,
		two_factor_authentication: undefined,
		plan: undefined,
		accessToken,
	};
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
					asAuthPlugin(
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
					),
				]
			: []),
		...(process.env.VERCEL
			? [
					asAuthPlugin(
						oAuthProxy({
							productionURL: "https://www.better-hub.com",
						}),
					),
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
});

export const getServerSession = cache(
	async (): Promise<{
		user: AuthSessionValue["user"];
		session: AuthSessionValue;
		githubUser: AuthGitHubUser;
	} | null> => {
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
			let githubUserData: GitHubUserProfile | null = null;
			try {
				const githubUser = await getOctokitUser(account.accessToken);
				githubUserData = githubUser ?? null;
			} catch {
				// GitHub API may be rate-limited; don't treat as unauthenticated.
			}
			if (!githubUserData) {
				return {
					user: session.user,
					session,
					githubUser: buildFallbackGitHubUser(
						session,
						account.accessToken,
					),
				};
			}
			return {
				user: session.user,
				session,
				githubUser: {
					...githubUserData,
					accessToken: account.accessToken,
				} satisfies AuthGitHubUser,
			};
		} catch {
			return null;
		}
	},
);

export type $Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;
