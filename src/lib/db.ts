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

// SSL is intentionally NOT configured via `sslmode`/`sslrootcert` query
// params on DATABASE_URL. pg's ConnectionParameters constructor does
// `Object.assign({}, config, parse(connectionString))` (node-postgres,
// lib/connection-parameters.js) — whatever the connection string's own
// query params produce OVERWRITES any explicit config passed alongside it
// for the same key. An `sslmode` in the URL would silently replace the
// `ca`-bearing object below with an empty one, undoing it. DATABASE_SSL /
// DATABASE_SSL_CA mirror the same two-variable shape the comprobify API
// repo uses for the same reason (see its src/config/index.js): DigitalOcean
// managed Postgres (and similar providers) present a certificate signed by
// a private, cluster-specific CA that isn't in Node's default trust store —
// `rejectUnauthorized: true` alone fails with SELF_SIGNED_CERT_IN_CHAIN
// unless that CA's PEM content is also passed as `ca`.
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
