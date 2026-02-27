import { betterAuth } from "better-auth";
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
import { patSignIn } from "./auth-plugins/pat-signin";

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
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	plugins: [
		dash({
			activityTracking: {
				enabled: true,
			},
		}),
		admin(),
		patSignIn(),
		sentinel(),
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
		},
	},
	trustedOrigins: [
		// Production
		"https://www.better-hub.com",
		// Vercel preview
		"https://better-hub-*-better-auth.vercel.app",
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
		const githubUser = await getOctokitUser(account.accessToken);
		if (!githubUser?.data) {
			return null;
		}
		return {
			user: session.user,
			session,
			githubUser: {
				...githubUser.data,
				accessToken: account.accessToken,
			},
		};
	} catch {
		return null;
	}
});

export type $Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;
