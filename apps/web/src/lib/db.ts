import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

type ExtendedPrismaClient = ReturnType<typeof makePrisma>;

const _proc = process as typeof process & {
	__dbPool?: Pool;
	__prisma?: ExtendedPrismaClient;
};

function getOrCreatePool(): Pool {
	if (_proc.__dbPool) return _proc.__dbPool;

	const isDev = process.env.NODE_ENV !== "production";
	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
		// In dev, Next.js spawns 10-15 child processes each with its own pool.
		// A single page load (e.g. PR detail) can fire 15+ parallel DB queries
		// via concurrent server-component renders.  docker-compose.yml sets
		// max_connections=300 so each process can safely hold 20 connections.
		// In production a managed pooler (PgBouncer / Neon) sits in front of
		// PG, so a small pool is fine.
		max: isDev ? 20 : 5,
		idleTimeoutMillis: isDev ? 10_000 : 30_000,
		// Docker Desktop on macOS introduces significant latency for new TCP
		// connections (5-15 s observed).  In dev, disable the timeout so these
		// slow-but-valid connections aren't killed prematurely.  In production
		// behind a managed pooler, 5 s is more than enough.
		connectionTimeoutMillis: isDev ? 0 : 5_000,
		allowExitOnIdle: true,
	});

	_proc.__dbPool = pool;
	attachDatabasePool(pool);
	return pool;
}

function makePrisma() {
	const pool = getOrCreatePool();
	const adapter = new PrismaPg(pool);
	return new PrismaClient({ adapter });
}

export const prisma: ExtendedPrismaClient = _proc.__prisma ?? (_proc.__prisma = makePrisma());
