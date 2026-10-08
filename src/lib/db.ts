import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isUuid } from '@/lib/utils';

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
    // Stored as a single line with literal \n sequences, not real newlines (same
    // reason as the API's DB_SSL_CA) — reconstructed into real newlines here.
    ...(process.env.DATABASE_SSL_CA
      ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') }
      : {}),
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

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Tables with a Postgres RLS policy (ADR-010). They are deliberately NOT on `db`'s type:
 * reaching one requires a `withTenant()` / `asSystem()` transaction, so a call that
 * forgets the wrapper is a compile error instead of a silently empty result.
 * The unprotected tables are listed in tests/integration/rls-fail-closed.test.ts with
 * the reason each one is exempt.
 */
export const db: Pick<PrismaClient, 'user' | 'tenant' | 'verificationToken' | 'agreementDraft' | '$transaction'> = prisma;

export type Tx = Prisma.TransactionClient;

type TxOptions = { maxWait?: number; timeout?: number };

/**
 * Run `fn` as one tenant. The tenant id is set with a transaction-local setting, so it
 * dies with the transaction and can never leak to the next request on a pooled
 * connection. Keep `fn` short: it holds a connection for its whole duration.
 */
export function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>, opts?: TxOptions): Promise<T> {
  if (!isUuid(tenantId)) throw new Error('withTenant requires a tenant uuid');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }, opts);
}

/**
 * Cross-tenant access. `reason` is mandatory so every use is greppable and reviewable;
 * it is also recorded in `app.rls_reason` for pg_stat_activity / log inspection.
 */
export function asSystem<T>(reason: string, fn: (tx: Tx) => Promise<T>, opts?: TxOptions): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.rls_system', 'on', true), set_config('app.rls_reason', ${reason}, true)`;
    return fn(tx);
  }, opts);
}
