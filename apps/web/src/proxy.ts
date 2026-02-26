import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { authClient } from "./lib/auth-client";

const publicPaths = ["/", "/api/auth", "/api/inngest"];

const APP_ROUTES = new Set([
	"dashboard",
	"repos",
	"issues",
	"prs",
	"settings",
	"search",
	"trending",
	"notifications",
	"orgs",
	"users",
	"api",
	"debug",
	"_next",
]);

export default async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const segments = pathname.split("/").filter(Boolean);

	// Handle authentication first
	const isPublic = publicPaths.some(
		(path) => pathname === path || pathname.startsWith(path + "/"),
	);
	if (isPublic) return NextResponse.next();

	const sessionCookie = getSessionCookie(request.headers);
	if (!sessionCookie) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	// Handle URL rewriting for GitHub-style routes
	// Skip app routes, API routes, and Next.js internals
	if (segments.length === 0 || APP_ROUTES.has(segments[0])) {
		return NextResponse.next();
	}

	// Need at least /:owner/:repo
	if (segments.length < 2) {
		return NextResponse.next();
	}

	const owner = segments[0];
	const repo = segments[1];
	const rest = segments.slice(2);

	// /:owner/:repo/pull/:number → /repos/:owner/:repo/pulls/:number
	if (rest[0] === "pull" && rest[1]) {
		const url = request.nextUrl.clone();
		url.pathname = `/repos/${owner}/${repo}/pulls/${rest.slice(1).join("/")}`;
		return NextResponse.rewrite(url);
	}

	// /:owner/:repo/commit/:sha → /repos/:owner/:repo/commits/:sha
	if (rest[0] === "commit" && rest[1]) {
		const url = request.nextUrl.clone();
		url.pathname = `/repos/${owner}/${repo}/commits/${rest.slice(1).join("/")}`;
		return NextResponse.rewrite(url);
	}

	// /:owner/:repo/actions/runs/:runId → /repos/:owner/:repo/actions/:runId
	if (rest[0] === "actions" && rest[1] === "runs" && rest[2]) {
		const url = request.nextUrl.clone();
		url.pathname = `/repos/${owner}/${repo}/actions/${rest.slice(2).join("/")}`;
		return NextResponse.rewrite(url);
	}

	// /:owner/:repo/compare/base...head (GitHub Desktop / gh pr create) → /repos/:owner/:repo/pulls/new?base=&head=&title=&body=
	if (rest[0] === "compare" && rest[1]) {
		const range = rest[1];
		const dots = range.includes("...") ? "..." : range.includes("..") ? ".." : null;
		const [baseBranch, headBranch] = dots ? range.split(dots) : [null, null];
		if (baseBranch && headBranch) {
			const url = request.nextUrl.clone();
			url.pathname = `/repos/${owner}/${repo}/pulls/new`;
			url.searchParams.set("base", baseBranch.trim());
			url.searchParams.set("head", headBranch.trim());
			const title = request.nextUrl.searchParams.get("title");
			const body = request.nextUrl.searchParams.get("body");
			if (title) url.searchParams.set("title", title);
			if (body) url.searchParams.set("body", body);
			return NextResponse.redirect(url);
		}
	}

	// Generic: /:owner/:repo/... → /repos/:owner/:repo/...
	const url = request.nextUrl.clone();
	url.pathname = `/repos/${segments.join("/")}`;
	return NextResponse.rewrite(url);
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|[^/]+\\.[^/]+$).*)"],
};
