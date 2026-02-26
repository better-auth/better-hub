import { prisma } from "../db";
import { getCreditBalance } from "./credit";
import { getActiveSubscription, getCurrentPeriodUsage, getSpendingLimit } from "./spending-limit";
import { stripeClient } from "./stripe";

// Lazy migration for users created before the Stripe plugin was installed.
// Creates a Stripe customer on first AI usage.
async function ensureStripeCustomer(userId: string): Promise<string | null> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true, name: true },
	});
	if (!user?.email) return null;

	try {
		const customer = await stripeClient.customers.create({
			email: user.email,
			name: user.name ?? undefined,
			metadata: { userId, customerType: "user" },
		});
		await prisma.user.update({
			where: { id: userId },
			data: { stripeCustomerId: customer.id },
		});
		return customer.id;
	} catch (e) {
		console.error("[billing] ensureStripeCustomer failed:", e);
		return null;
	}
}

export async function checkUsageLimit(
	userId: string,
	isCustomApiKey = false,
): Promise<{
	allowed: boolean;
	current: number;
	limit: number;
	creditExhausted?: boolean;
	spendingLimitReached?: boolean;
}> {
	// 1. Custom API key — no cost to the app, always allowed
	if (isCustomApiKey) {
		return { allowed: true, current: 0, limit: 0 };
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { stripeCustomerId: true },
	});

	// 2. No Stripe customer — lazy migration
	let stripeCustomerId = user?.stripeCustomerId ?? null;
	if (!stripeCustomerId) {
		if (!user) {
			return { allowed: false, current: 0, limit: 0 };
		}
		stripeCustomerId = await ensureStripeCustomer(userId);
		if (!stripeCustomerId) {
			return { allowed: false, current: 0, limit: 0 };
		}
	}

	// 3. Active subscription — spending limit check
	const subscription = await getActiveSubscription(userId);
	if (subscription?.periodStart) {
		const [periodUsage, monthlyCapUsd] = await Promise.all([
			getCurrentPeriodUsage(userId, subscription.periodStart),
			getSpendingLimit(userId),
		]);
		if (monthlyCapUsd !== null && periodUsage >= monthlyCapUsd) {
			return {
				allowed: false,
				current: 0,
				limit: 0,
				spendingLimitReached: true,
			};
		}
		return { allowed: true, current: 0, limit: 0 };
	}

	// 4. Stripe customer, no subscription — spending limit + credit balance check
	const [monthlyCapUsd, balance] = await Promise.all([
		getSpendingLimit(userId),
		getCreditBalance(userId),
	]);

	if (monthlyCapUsd !== null) {
		const monthStart = new Date();
		monthStart.setUTCDate(1);
		monthStart.setUTCHours(0, 0, 0, 0);
		const monthUsage = await getCurrentPeriodUsage(userId, monthStart);
		if (monthUsage >= monthlyCapUsd) {
			return { allowed: false, current: 0, limit: 0, spendingLimitReached: true };
		}
	}

	if (balance.available <= 0) {
		return { allowed: false, current: 0, limit: 0, creditExhausted: true };
	}

	return { allowed: true, current: 0, limit: 0 };
}
