import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/github";

const MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
	ico: "image/x-icon",
	bmp: "image/bmp",
	avif: "image/avif",
};

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const owner = searchParams.get("owner");
	const repo = searchParams.get("repo");
	const path = searchParams.get("path");
	const ref = searchParams.get("ref");

	if (!owner || !repo || !path || !ref) {
		return NextResponse.json(
			{ error: "Missing required parameters: owner, repo, path, ref" },
			{ status: 400 },
		);
	}

	const token = await getGitHubToken();
	if (!token) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	try {
		/**
		 * Bypass Octokit:
		 * base64 content only for ≤1MB, raw format corrupts binary
		 * @see https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#get-repository-content
		 * */
		const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
		const upstream = await fetch(rawUrl, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!upstream.ok) {
			return NextResponse.json({ error: "Image not found" }, { status: 404 });
		}

		const ext = path.split(".").pop()?.toLowerCase() || "";
		const contentType =
			MIME_TYPES[ext] ||
			upstream.headers.get("content-type") ||
			"application/octet-stream";

		return new NextResponse(upstream.body, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control":
					"public, max-age=3600, stale-while-revalidate=86400",
			},
		});
	} catch {
		return NextResponse.json({ error: "Image not found" }, { status: 404 });
	}
}
