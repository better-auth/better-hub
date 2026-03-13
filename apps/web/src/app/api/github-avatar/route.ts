import { NextRequest, NextResponse } from "next/server";
import { IS_GHES, GITHUB_HOSTNAME, GITHUB_WEB_URL } from "@/lib/github-config";

/**
 * Proxies GitHub avatar images through the server.
 *
 * GHES private mode requires web session cookies for avatar URLs
 * (avatars subdomain). API tokens don't work for this. We create
 * a GHES web session by programmatically logging in, cache the
 * session cookies, and use them to proxy avatar images.
 */

const allowedHosts = new Set([
	"avatars.githubusercontent.com",
	...(IS_GHES ? [GITHUB_HOSTNAME, `avatars.${GITHUB_HOSTNAME}`] : []),
]);

// Cache: GHES web session cookies (server-side only)
let ghesSession: { cookies: string; expiresAt: number } | null = null;

async function getGhesWebSession(): Promise<string | null> {
	if (ghesSession && ghesSession.expiresAt > Date.now()) {
		return ghesSession.cookies;
	}

	const username = process.env.GHES_AVATAR_USERNAME;
	const password = process.env.GHES_AVATAR_PASSWORD;

	if (!username || !password) {
		return null;
	}

	try {
		// Step 1: Get the login page to extract authenticity_token and initial cookies
		const loginResp = await fetch(`${GITHUB_WEB_URL}/login`, {
			redirect: "manual",
		});
		const loginCookies = (loginResp.headers.getSetCookie?.() ?? [])
			.map((c) => c.split(";")[0])
			.join("; ");
		const loginHtml = await loginResp.text();
		const tokenMatch = loginHtml.match(/name="authenticity_token"\s+value="([^"]+)"/);
		if (!tokenMatch) return null;

		// Step 2: POST to /session to log in
		const sessionResp = await fetch(`${GITHUB_WEB_URL}/session`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Cookie: loginCookies,
			},
			body: new URLSearchParams({
				authenticity_token: tokenMatch[1],
				login: username,
				password: password,
				commit: "Sign in",
			}),
			redirect: "manual",
		});

		const sessionCookies = sessionResp.headers.getSetCookie?.() ?? [];
		if (sessionCookies.length === 0) return null;

		const allCookies = [
			loginCookies,
			...sessionCookies.map((c) => c.split(";")[0]),
		].join("; ");

		// Cache for 4 hours (GHES sessions last longer but refresh to be safe)
		ghesSession = {
			cookies: allCookies,
			expiresAt: Date.now() + 4 * 60 * 60 * 1000,
		};

		return allCookies;
	} catch {
		return null;
	}
}

export async function GET(request: NextRequest) {
	const url = request.nextUrl.searchParams.get("url");
	if (!url) {
		return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
	}

	if (!allowedHosts.has(parsed.hostname)) {
		return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
	}

	try {
		const headers: Record<string, string> = {};

		if (IS_GHES) {
			// GHES private mode: need web session cookies for avatar subdomain
			const cookies = await getGhesWebSession();
			if (cookies) {
				headers.Cookie = cookies;
			}
		}

		let upstream = await fetch(url, { headers, redirect: "follow" });
		let contentType = upstream.headers.get("content-type") || "";

		// If we got a non-image response and have a session, it may have expired — retry once
		if (
			IS_GHES &&
			headers.Cookie &&
			(!upstream.ok || !contentType.startsWith("image/"))
		) {
			ghesSession = null;
			const freshCookies = await getGhesWebSession();
			if (freshCookies) {
				headers.Cookie = freshCookies;
				upstream = await fetch(url, { headers, redirect: "follow" });
				contentType = upstream.headers.get("content-type") || "";
			}
		}

		if (upstream.ok && contentType.startsWith("image/")) {
			return new NextResponse(upstream.body, {
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "private, max-age=3600",
					"X-Content-Type-Options": "nosniff",
				},
			});
		}

		// Fallback: generate a colored circle SVG based on user ID
		const pathParts = parsed.pathname.split("/").filter(Boolean);
		const userId = pathParts[1] || "0";
		const colors = [
			"#e17055",
			"#00b894",
			"#6c5ce7",
			"#fdcb6e",
			"#0984e3",
			"#d63031",
			"#00cec9",
			"#a29bfe",
			"#fab1a0",
			"#74b9ff",
		];
		const color = colors[parseInt(userId) % colors.length];
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="128" fill="${color}"/></svg>`;

		return new NextResponse(svg, {
			headers: {
				"Content-Type": "image/svg+xml",
				"Cache-Control": "private, max-age=60",
			},
		});
	} catch {
		return NextResponse.json({ error: "Failed to fetch avatar" }, { status: 502 });
	}
}
