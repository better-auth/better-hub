import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { WELCOME_CREDIT_TYPE, WELCOME_CREDIT_USD, WELCOME_CREDIT_EXPIRY_DAYS } from "./config";

const GRANT_MAX_RETRIES = 3;

export async function grantSignupCredits(userId: string): Promise<void> {
	if (WELCOME_CREDIT_USD <= 0) return;

	for (let attempt = 0; ; attempt++) {
		try {
			await prisma.$transaction(
				async (tx) => {
					const existing = await tx.creditLedger.findFirst({
						where: { userId, type: WELCOME_CREDIT_TYPE },
						select: { id: true },
					});
					if (existing) return;

					const expiresAt = new Date(
						Date.now() +
							WELCOME_CREDIT_EXPIRY_DAYS *
								24 *
								60 *
								60 *
								1000,
					);
					await tx.creditLedger.create({
						data: {
							userId,
							amount: WELCOME_CREDIT_USD,
							type: WELCOME_CREDIT_TYPE,
							description: "Welcome credit on signup",
							expiresAt,
						},
					});
				},
				{ isolationLevel: "Serializable" },
			);
			return;
		} catch (e) {
			const isWriteConflict =
				e instanceof Prisma.PrismaClientKnownRequestError &&
				e.code === "P2034";
			if (isWriteConflict && attempt < GRANT_MAX_RETRIES) continue;
			throw e;
		}
	}
}

export interface CreditBalance {
	totalGranted: number;
	totalUsed: number;
	available: number;
}

export async function getNearestCreditExpiry(userId: string): Promise<Date | null> {
	const grant = await prisma.creditLedger.findFirst({
		where: { userId, expiresAt: { gt: new Date() } },
		orderBy: { expiresAt: "asc" },
		select: { expiresAt: true },
	});
	return grant?.expiresAt ?? null;
}

export async function getCreditBalance(
	userId: string,
	tx?: Prisma.TransactionClient,
): Promise<CreditBalance> {
	const db = tx ?? prisma;
	const [grants, usageAgg] = await Promise.all([
		db.creditLedger.findMany({
			where: { userId },
			orderBy: { createdAt: "asc" },
			select: { amount: true, expiresAt: true },
		}),
		db.usageLog.aggregate({
			where: { userId },
			_sum: { creditUsed: true },
		}),
	]);

	const totalUsed = Number(usageAgg._sum.creditUsed ?? 0);
	const totalGranted = grants.reduce((sum, g) => sum + Number(g.amount), 0);
	const now = new Date();

	// FIFO: oldest grants absorb usage first; expired remainders are forfeit.
	let usageToConsume = totalUsed;
	let available = 0;
	for (const grant of grants) {
		const amount = Number(grant.amount);
		const consumed = Math.min(amount, usageToConsume);
		usageToConsume -= consumed;

		if (!grant.expiresAt || grant.expiresAt > now) {
			available += amount - consumed;
		}
	}

	return { totalGranted, totalUsed, available };
}

export async function hasWelcomeCredit(userId: string): Promise<boolean> {
	const count = await prisma.creditLedger.count({
		where: { userId, type: WELCOME_CREDIT_TYPE },
	});
	return count > 0;
}
