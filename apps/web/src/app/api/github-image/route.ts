import { NextRequest, NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";

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
	const ref = searchParams.get("ref") || undefined;

	if (!owner || !repo || !path) {
		return NextResponse.json(
			{ error: "Missing required parameters: owner, repo, path" },
			{ status: 400 },
		);
	}

	const octokit = await getOctokit();
	if (!octokit) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	try {
		const { data } = await octokit.repos.getContent({
			owner,
			repo,
			path,
			...(ref ? { ref } : {}),
			mediaType: { format: "raw" },
		});

		const ext = path.split(".").pop()?.toLowerCase() || "";
		const contentType = MIME_TYPES[ext] || "application/octet-stream";

		const buffer =
			typeof data === "string"
				? Buffer.from(data, "binary")
				: Buffer.from(data as unknown as ArrayBuffer);

		return new NextResponse(buffer, {
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
