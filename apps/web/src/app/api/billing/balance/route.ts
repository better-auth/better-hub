import { auth } from "@/lib/auth";
import { getCreditBalance, getNearestCreditExpiry, hasWelcomeCredit } from "@/lib/billing/credit";
import { headers } from "next/headers";

export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const [balance, nearestExpiry, welcomed] = await Promise.all([
		getCreditBalance(session.user.id),
		getNearestCreditExpiry(session.user.id),
		hasWelcomeCredit(session.user.id),
	]);
	return Response.json({
		...balance,
		nearestExpiry: nearestExpiry?.toISOString() ?? null,
		welcomed,
	});
}
