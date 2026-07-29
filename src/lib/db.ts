import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// @prisma/adapter-pg doesn't read Prisma's connection_limit convention (that's
// Rust-engine-only) — parse it from the URL ourselves and forward it as pg.Pool's `max`.
function poolSizeFromUrl(databaseUrl: string): number | undefined {
  const value = new URL(databaseUrl).searchParams.get('connection_limit');
  return value ? Number(value) : undefined;
}

// Kept out of DATABASE_URL's query string on purpose: pg's connection-string parsing
// overwrites explicit config for overlapping keys, so an sslmode param here would
// silently wipe out the `ca` below. Mirrors DATABASE_SSL/DATABASE_SSL_CA on the API side.
function sslConfig() {
  if (process.env.DATABASE_SSL !== 'true') return undefined;
  return {
    rejectUnauthorized: true,
    ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}),
  };
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL as string;
  const adapter = new PrismaPg({
    connectionString,
    max: poolSizeFromUrl(connectionString),
    ssl: sslConfig(),
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
