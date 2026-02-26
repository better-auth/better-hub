import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

function makePrisma() {
	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
		max: 100,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 10_000,
		max: 5, // normally 2 is good, but we have external pooler (PgBouncer) in front of us
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 5_000,
		allowExitOnIdle: true,
	});
	attachDatabasePool(pool);
	const adapter = new PrismaPg(pool);
	return new PrismaClient({ adapter });
}

type ExtendedPrismaClient = ReturnType<typeof makePrisma>;

const globalForPrisma = globalThis as typeof globalThis & {
	__prisma?: ExtendedPrismaClient;
};

export const prisma: ExtendedPrismaClient = globalForPrisma.__prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.__prisma = prisma;
}
