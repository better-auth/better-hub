import { NextRequest, NextResponse } from "next/server";
import { getFileContent } from "@/lib/github";
import { highlightFullFile } from "@/lib/shiki";

interface FileData {
	content: string;
	sha?: string;
}

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const owner = searchParams.get("owner");
	const repo = searchParams.get("repo");
	const path = searchParams.get("path");
	const ref = searchParams.get("ref") || undefined;
	const highlight = searchParams.get("highlight") === "true";

	if (!owner || !repo || !path) {
		return NextResponse.json(
			{ error: "Missing required parameters: owner, repo, path" },
			{ status: 400 },
		);
	}

	// Decode the path to handle URL-encoded characters from Next.js routes
	// e.g., %5Bowner%5D -> [owner], %28app%29 -> (app)
	const decodedPath = decodeURIComponent(path);

	const data = await getFileContent(owner, repo, decodedPath, ref);
	if (!data) {
		return NextResponse.json({ error: "File not found" }, { status: 404 });
	}

	const fileData = data as FileData;
	const { content, sha } = fileData;

	if (highlight) {
		try {
			const tokens = await highlightFullFile(content, path);
			return NextResponse.json({ content, tokens, sha });
		} catch {
			return NextResponse.json({ content, sha });
		}
	}

	return NextResponse.json({ content, sha });
}
