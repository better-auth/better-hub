import { NextRequest, NextResponse } from "next/server";
import { highlightFullFile } from "@/lib/shiki";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const MAX_CODE_LENGTH = 500_000;

export async function POST(request: NextRequest) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { code, filename } = body as { code?: string; filename?: string };

		if (typeof code !== "string" || !filename) {
			return NextResponse.json(
				{ error: "Missing required fields: code, filename" },
				{ status: 400 },
			);
		}

		if (code.length > MAX_CODE_LENGTH) {
			return NextResponse.json(
				{
					error: `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`,
				},
				{ status: 413 },
			);
		}

		const tokens = await highlightFullFile(code, filename);
		return NextResponse.json({ tokens });
	} catch {
		return NextResponse.json({ error: "Failed to highlight code" }, { status: 500 });
	}
}
