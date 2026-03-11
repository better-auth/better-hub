import { listExtensions } from "@/lib/theme-store";
import type { ExtensionType } from "@/lib/theme-store-types";

export async function GET(request: Request) {
	const url = new URL(request.url);
	const type = url.searchParams.get("type") as ExtensionType | null;
	const search = url.searchParams.get("search") || undefined;
	const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
	const perPage = Math.min(
		50,
		Math.max(1, parseInt(url.searchParams.get("perPage") || "24", 10) || 24),
	);

	const validTypes: ExtensionType[] = ["theme", "icon-theme"];
	const result = await listExtensions({
		type: type && validTypes.includes(type) ? type : undefined,
		search,
		page,
		perPage,
	});

	return Response.json(result);
}
