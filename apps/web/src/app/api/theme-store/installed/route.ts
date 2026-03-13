import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getInstalledCustomThemes } from "@/lib/theme-store";
import type { CustomThemeType } from "@/lib/theme-store-types";

export async function GET(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const type = url.searchParams.get("type") as CustomThemeType | null;
	const validTypes: CustomThemeType[] = ["theme", "icon-theme"];

	const themes = await getInstalledCustomThemes(
		session.user.id,
		type && validTypes.includes(type) ? type : undefined,
	);

	return Response.json(themes);
}
