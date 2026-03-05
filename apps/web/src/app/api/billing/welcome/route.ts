import { auth } from "@/lib/auth";
import { grantSignupCredits } from "@/lib/billing/credit";
import { headers } from "next/headers";

// For existing users who never claimed their welcome credit
export async function POST() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		await grantSignupCredits(session.user.id);
		return Response.json({ ok: true });
	} catch (e) {
		console.error("[billing] grantSignupCredits failed:", e);
		return Response.json({ error: "Failed to grant credits" }, { status: 500 });
	}
}
