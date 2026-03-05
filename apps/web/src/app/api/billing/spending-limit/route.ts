import { auth } from "@/lib/auth";
import {
	getCurrentPeriodUsage,
	getSpendingLimit,
	getSpendingLimitInfo,
	updateSpendingLimit,
} from "@/lib/billing/spending-limit";
import { getCreditBalance } from "@/lib/billing/credit";
import { headers } from "next/headers";

export async function GET() {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const info = await getSpendingLimitInfo(session.user.id);
	if (info) {
		return Response.json({
			mode: "subscription",
			monthlyCapUsd: info.monthlyCapUsd,
			periodUsageUsd: info.periodUsageUsd,
			periodStart: info.periodStart.toISOString(),
			remainingUsd: info.remainingUsd,
		});
	}

	const monthStart = new Date();
	monthStart.setUTCDate(1);
	monthStart.setUTCHours(0, 0, 0, 0);
	const [balance, monthlyCapUsd, periodUsageUsd] = await Promise.all([
		getCreditBalance(session.user.id),
		getSpendingLimit(session.user.id),
		getCurrentPeriodUsage(session.user.id, monthStart),
	]);
	return Response.json({
		mode: "credit",
		available: balance.available,
		totalGranted: balance.totalGranted,
		monthlyCapUsd,
		periodUsageUsd,
		periodStart: monthStart.toISOString(),
	});
}

export async function PATCH(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = await req.json();
	const { monthlyCapUsd } = body as { monthlyCapUsd?: number | null };

	if (
		monthlyCapUsd != null &&
		(typeof monthlyCapUsd !== "number" || !Number.isFinite(monthlyCapUsd))
	) {
		return Response.json(
			{ error: "monthlyCapUsd must be a finite number or null" },
			{ status: 400 },
		);
	}

	try {
		const updated = await updateSpendingLimit(session.user.id, monthlyCapUsd ?? null);
		return Response.json({ monthlyCapUsd: updated });
	} catch (e) {
		const message = e instanceof Error ? e.message : "Failed to update spending limit";
		return Response.json({ error: message }, { status: 400 });
	}
}
