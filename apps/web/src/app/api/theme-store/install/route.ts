import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { z } from "zod";
import { installCustomTheme, uninstallCustomTheme, getCustomThemeById } from "@/lib/theme-store";

const bodySchema = z.object({
	customThemeId: z.string().min(1),
});

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ error: "Invalid request" }, { status: 400 });
	}

	const theme = await getCustomThemeById(parsed.data.customThemeId);
	if (!theme) {
		return Response.json({ error: "Custom theme not found" }, { status: 404 });
	}

	const result = await installCustomTheme(session.user.id, parsed.data.customThemeId);
	return Response.json({ ok: true, alreadyInstalled: result.alreadyInstalled });
}

export async function DELETE(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return Response.json({ error: "Invalid request" }, { status: 400 });
	}

	await uninstallCustomTheme(session.user.id, parsed.data.customThemeId);
	return Response.json({ ok: true });
}
