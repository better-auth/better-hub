import Stripe from "stripe";
import { prisma } from "../db";
import { COST_TO_UNITS } from "./config";

export const isStripeEnabled = !!process.env.STRIPE_SECRET_KEY;

if (!isStripeEnabled) {
	console.warn("[billing] STRIPE_SECRET_KEY is not set — Stripe features are disabled.");
}

let _stripe: Stripe | null = null;
export function getStripeClient(): Stripe {
	if (!_stripe) {
		_stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
	}
	return _stripe;
}

export async function reportUsageToStripe(
	usageLogId: string,
	userId: string,
	costUsd: number,
	createdAt?: Date,
): Promise<void> {
	if (!isStripeEnabled) return;

	const units = Math.round(costUsd * COST_TO_UNITS);
	if (units <= 0) {
		// Amount too small for a whole unit
		// Mark as reported so retry job skips it.
		await prisma.usageLog.update({
			where: { id: usageLogId },
			data: { stripeReported: true },
		});
		return;
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { stripeCustomerId: true },
	});
	if (!user?.stripeCustomerId) return;

	await getStripeClient().billing.meterEvents.create({
		event_name: "better_hub_usage",
		payload: {
			stripe_customer_id: user.stripeCustomerId,
			value: String(units),
		},
		identifier: `usage_${usageLogId}`,
		...(createdAt && {
			timestamp: Math.floor(createdAt.getTime() / 1000),
		}),
	});

	await prisma.usageLog.update({
		where: { id: usageLogId },
		data: { stripeReported: true },
	});
}
