import { prisma } from "../db";
import { ACTIVE_SUBSCRIPTION_STATUSES, MIN_CAP_USD } from "./config";

export interface SpendingLimitInfo {
	monthlyCapUsd: number | null;
	periodUsageUsd: number;
	periodStart: Date;
	remainingUsd: number | null;
}

export async function getSpendingLimit(userId: string): Promise<number | null> {
	const config = await prisma.spendingLimit.findUnique({ where: { userId } });
	return config ? Number(config.monthlyCapUsd) : null;
}

export async function updateSpendingLimit(
	userId: string,
	monthlyCapUsd: number | null,
): Promise<number | null> {
	if (monthlyCapUsd === null) {
		await prisma.spendingLimit.deleteMany({ where: { userId } });
		return null;
	}
	if (monthlyCapUsd < MIN_CAP_USD) {
		throw new Error(`Spending limit must be at least $${MIN_CAP_USD}`);
	}
	const config = await prisma.spendingLimit.upsert({
		where: { userId },
		create: { userId, monthlyCapUsd },
		update: { monthlyCapUsd },
	});
	return Number(config.monthlyCapUsd);
}

export async function getActiveSubscription(userId: string) {
	return prisma.subscription.findFirst({
		where: { referenceId: userId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
		select: { id: true, periodStart: true, periodEnd: true },
	});
}

/** Actual billed amount (post-credit) in the period. Credits are excluded. */
export async function getCurrentPeriodUsage(userId: string, periodStart: Date): Promise<number> {
	const result = await prisma.usageLog.aggregate({
		where: { userId, createdAt: { gte: periodStart } },
		_sum: { costUsd: true },
	});
	return Number(result._sum.costUsd ?? 0);
}

export async function getSpendingLimitInfo(userId: string): Promise<SpendingLimitInfo | null> {
	const subscription = await getActiveSubscription(userId);
	if (!subscription?.periodStart) return null;

	const [monthlyCapUsd, periodUsageUsd] = await Promise.all([
		getSpendingLimit(userId),
		getCurrentPeriodUsage(userId, subscription.periodStart),
	]);

	return {
		monthlyCapUsd,
		periodUsageUsd,
		periodStart: subscription.periodStart,
		remainingUsd:
			monthlyCapUsd !== null ? Math.max(0, monthlyCapUsd - periodUsageUsd) : null,
	};
}
