import { type NextRequest, NextResponse } from "next/server";

export async function GET(
	_request: NextRequest,
	context: {
		params: Promise<{ owner: string; repo: string; tag: string; filename: string[] }>;
	},
) {
	const { owner, repo, tag, filename } = await context.params;

	// this route basically redirects users to the real github asset URL, if the extension is on it can loop unless that URL is allowed listed in extension rules
	const githubUrl = `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/${filename.join("/")}`;
	return NextResponse.redirect(githubUrl, { status: 302 });
}
