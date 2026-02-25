import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const browser = url.searchParams.get("browser");

	const fileName = browser === "firefox"
		? "better-hub-firefox.zip"
		: "better-hub-chrome.zip";

	const filePath = join(process.cwd(), "public", "extension", fileName);

	try {
		const buffer = await readFile(filePath);

		return new Response(buffer, {
			headers: {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${fileName}"`,
				"Content-Length": buffer.byteLength.toString(),
				"Content-Encoding": "identity",
				"Cache-Control": "no-transform",
			},
		});
	} catch {
		return new Response("Extension not found", { status: 404 });
	}
}
