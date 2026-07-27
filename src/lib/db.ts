import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// @prisma/adapter-pg hands the connection string straight to node-postgres's
// `pg.Pool`, which never reads Prisma's own `connection_limit`/`pgbouncer`
// query-string convention (those are understood only by Prisma's Rust query
// engine, which this app bypasses). Parse `connection_limit` here and forward
// it as pg's own `max` pool option instead — see docs/deployment.md's
// DATABASE_URL entry for why this cap exists.
function poolSizeFromUrl(databaseUrl: string): number | undefined {
  const value = new URL(databaseUrl).searchParams.get('connection_limit');
  return value ? Number(value) : undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL as string;
  const adapter = new PrismaPg({ connectionString, max: poolSizeFromUrl(connectionString) });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
