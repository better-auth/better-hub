import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserSettings, updateUserSettings } from "@/lib/user-settings-store";
import { z } from "zod";

function maskApiKey(key: string | null): string | null {
	if (!key) return null;
	if (key.length <= 4) return "****";
	return "****" + key.slice(-4);
}

const settingsUpdateSchema = z
	.object({
		displayName: z.string().max(100).optional(),
		theme: z.enum(["light", "dark", "system"]).optional(),
		colorTheme: z.string().max(50).optional(),
		ghostModel: z.string().max(100).optional(),
		useOwnApiKey: z.boolean().optional(),
		openrouterApiKey: z.string().max(500).nullable().optional(),
		githubPat: z.string().max(500).nullable().optional(),
		codeThemeLight: z.string().max(100).optional(),
		codeThemeDark: z.string().max(100).optional(),
		codeFont: z.string().max(100).optional(),
		codeFontSize: z.number().int().min(8).max(32).optional(),
		onboardingDone: z.boolean().optional(),
	})
	.strict();

export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const settings = await getUserSettings(session.user.id);

	return Response.json({
		...settings,
		openrouterApiKey: maskApiKey(settings.openrouterApiKey),
		githubPat: maskApiKey(settings.githubPat),
	});
}

export async function PATCH(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = await request.json();
	const parsed = settingsUpdateSchema.safeParse(body);

	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const updates = Object.fromEntries(
		Object.entries(parsed.data).filter(([, v]) => v !== undefined),
	);

	if (Object.keys(updates).length === 0) {
		return Response.json({ error: "No valid fields to update" }, { status: 400 });
	}

	const settings = await updateUserSettings(session.user.id, updates);

	return Response.json({
		...settings,
		openrouterApiKey: maskApiKey(settings.openrouterApiKey),
		githubPat: maskApiKey(settings.githubPat),
	});
}
