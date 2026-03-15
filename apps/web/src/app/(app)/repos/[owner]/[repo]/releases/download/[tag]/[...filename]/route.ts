import { type NextRequest, NextResponse } from "next/server";

export async function GET(
	_request: NextRequest,
	context: {
		params: Promise<{ owner: string; repo: string; tag: string; filename: string[] }>;
	},
) {
	const { owner, repo, tag, filename } = await context.params;

	// this route basically redirects users to the real github asset URL, if the extension is on it can loop unless that URL is allowed listed in extension rules
	// TODO: Consider some sort of method to download releases from github directly while staying on better-hub, no redirects required
	const githubUrl = `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${filename.join("/")}`;
	return NextResponse.redirect(githubUrl, { status: 302 });
}
