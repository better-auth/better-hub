import Stripe from "stripe";
import { prisma } from "../db";
import { COST_TO_UNITS } from "./config";

export const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

export async function reportUsageToStripe(
	usageLogId: string,
	userId: string,
	costUsd: number,
	createdAt?: Date,
): Promise<void> {
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

	await stripeClient.billing.meterEvents.create({
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
