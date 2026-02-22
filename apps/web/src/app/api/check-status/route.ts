import { NextRequest, NextResponse } from "next/server";
import { getOctokit, fetchCheckStatusForRef } from "@/lib/github";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const owner = searchParams.get("owner");
	const repo = searchParams.get("repo");
	const ref = searchParams.get("ref");

	if (!owner || !repo || !ref) {
		return NextResponse.json({ error: "Missing owner, repo, or ref" }, { status: 400 });
	}

	const octokit = await getOctokit();
	if (!octokit) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	try {
		const checkStatus = await fetchCheckStatusForRef(octokit, owner, repo, ref);
		return NextResponse.json(checkStatus);
	} catch {
		return NextResponse.json(
			{ error: "Failed to fetch check status" },
			{ status: 500 },
		);
	}
}
