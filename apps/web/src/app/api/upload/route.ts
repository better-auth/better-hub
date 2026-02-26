import { auth } from "@/lib/auth";
import { imageUpload } from "@/lib/image-upload";
import { headers } from "next/headers";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/avif",
]);

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const formData = await req.formData();
	const file = formData.get("file") as File | null;

	if (!file) {
		return Response.json({ error: "No file provided" }, { status: 400 });
	}

	if (!ALLOWED_TYPES.has(file.type)) {
		return Response.json(
			{ error: "Unsupported file type. Use PNG, JPEG, GIF, WebP, SVG, or AVIF." },
			{ status: 400 },
		);
	}

	if (file.size > MAX_SIZE) {
		return Response.json(
			{ error: "File too large. Maximum size is 5 MB." },
			{ status: 400 },
		);
	}

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		const result = await imageUpload.upload(buffer, file.name);
		return Response.json(result);
	} catch {
		return Response.json({ error: "Upload failed" }, { status: 500 });
	}
}
