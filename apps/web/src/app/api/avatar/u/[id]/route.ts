import { NextRequest, NextResponse } from "next/server";
import { symmetricDecrypt } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { GITHUB_API_URL, IS_GITHUB_CLOUD } from "@/lib/github-host";

// Resolving avatars hits the DB (account token) and the GitHub API, so this
// route must always run dynamically.
export const dynamic = "force-dynamic";

const URL_CACHE_TTL = 1500; // 25 min — comfortably under the signed-token lifetime
const TOKEN_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min in-process token cache

// In-process cache for the service token. Kept in memory (not Redis) so the
// decrypted token is never persisted. Shared across the route handler and the
// Next.js image optimizer, which run in the same Node process.
let tokenCache: { token: string; expiresAt: number } | null = null;

function looksLikeToken(value: string): boolean {
	return /^(gh[pousr]_|github_pat_)/.test(value);
}

async function decryptAccountToken(encrypted: string): Promise<string | null> {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) return null;
	try {
		return await symmetricDecrypt({ key: secret, data: encrypted });
	} catch {
		// A few rows may hold a plaintext token (legacy / unencrypted).
		return looksLikeToken(encrypted) ? encrypted : null;
	}
}

/**
 * Resolve a GitHub token to use for avatar lookups. Avatars are visible to
 * every member of an Enterprise instance, so any member's stored token works
 * as a service token. Used strictly server-side. This avoids depending on the
 * viewer's session, which the `next/image` optimizer does not forward.
 */
async function getServiceToken(forceRefresh = false): Promise<string | null> {
	if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
		return tokenCache.token;
	}
	const account = await prisma.account.findFirst({
		where: { providerId: "github", accessToken: { not: null } },
		orderBy: { updatedAt: "desc" },
		select: { accessToken: true },
	});
	if (!account?.accessToken) return null;
	const token = await decryptAccountToken(account.accessToken);
	if (!token) return null;
	tokenCache = { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS };
	return token;
}

/**
 * Fetch a fresh, signed avatar URL for an account id from the GitHub API.
 * Returns `null` to signal the token was rejected (caller should refresh it),
 * or an empty string when the account/avatar can't be resolved.
 */
async function resolveSignedAvatarUrl(id: string, token: string): Promise<string | null> {
	const res = await fetch(`${GITHUB_API_URL}/user/${id}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"User-Agent": "better-hub",
		},
	});
	if (res.status === 401 || res.status === 403) return null;
	if (!res.ok) return "";
	const data = (await res.json()) as { avatar_url?: string };
	return data.avatar_url ?? "";
}

function withSize(url: string, size: string | null): string {
	if (!size) return url;
	return url + (url.includes("?") ? "&" : "?") + `size=${size}`;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	if (!/^\d+$/.test(id)) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	const sizeParam = request.nextUrl.searchParams.get("s");
	const size = sizeParam && /^\d+$/.test(sizeParam) ? sizeParam : null;

	// GitHub.com avatars are public and stable — redirect to the canonical CDN.
	if (IS_GITHUB_CLOUD) {
		const target = `https://avatars.githubusercontent.com/u/${id}?v=4${size ? `&s=${size}` : ""}`;
		return NextResponse.redirect(target, 302);
	}

	const urlCacheKey = `gh:avatar:url:${id}`;
	let signedUrl = await redis.get<string>(urlCacheKey);

	if (!signedUrl) {
		let token = await getServiceToken();
		if (!token) {
			return NextResponse.json({ error: "No token available" }, { status: 502 });
		}
		let resolved = await resolveSignedAvatarUrl(id, token);
		if (resolved === null) {
			// Token was rejected — refresh once and retry.
			token = await getServiceToken(true);
			resolved = token ? await resolveSignedAvatarUrl(id, token) : "";
		}
		if (!resolved) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		signedUrl = resolved;
		await redis.set(urlCacheKey, signedUrl, { ex: URL_CACHE_TTL });
	}

	let upstream = await fetch(withSize(signedUrl, size), {
		headers: { "User-Agent": "better-hub" },
	});

	if (!upstream.ok || !upstream.body) {
		// A cached signed URL may have expired — re-resolve once.
		await redis.del(urlCacheKey);
		const token = await getServiceToken();
		const resolved = token ? await resolveSignedAvatarUrl(id, token) : "";
		if (!resolved) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		await redis.set(urlCacheKey, resolved, { ex: URL_CACHE_TTL });
		upstream = await fetch(withSize(resolved, size), {
			headers: { "User-Agent": "better-hub" },
		});
		if (!upstream.ok || !upstream.body) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
	}

	return new NextResponse(upstream.body, {
		headers: {
			"Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
