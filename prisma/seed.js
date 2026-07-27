/**
 * Seeds the super-admin user for the Comprobify admin panel.
 *
 * Usage:
 *   ADMIN_SEED_PASSWORD=<secret> node prisma/seed.js
 *
 * Reads DATABASE_URL from .env.local (same as db-reset.js). Safe to run
 * multiple times — upserts on email so it won't duplicate the row.
 */

require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'support@comprobify.com';

// Mirrors src/lib/db.ts: @prisma/adapter-pg forwards the connection string
// straight to node-postgres's pg.Pool, which doesn't read Prisma's
// connection_limit query param on its own — parse it here and pass it
// through as pg's own `max` pool option.
function poolSizeFromUrl(databaseUrl) {
  const value = new URL(databaseUrl).searchParams.get('connection_limit');
  return value ? Number(value) : undefined;
}

// Mirrors src/lib/db.ts: kept out of DATABASE_URL's query string on purpose
// (an sslmode param there would silently overwrite this via pg's own
// connectionString-merge precedence) — see the comment in db.ts for why.
function sslConfig() {
  if (process.env.DATABASE_SSL !== 'true') return undefined;
  return {
    rejectUnauthorized: true,
    ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}),
  };
}

async function main() {
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!password) {
    console.error('Error: ADMIN_SEED_PASSWORD env var is required.');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  const adapter = new PrismaPg({
    connectionString,
    max: poolSizeFromUrl(connectionString),
    ssl: sslConfig(),
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      create: {
        email: ADMIN_EMAIL,
        passwordHash,
        emailVerified: true,
        inviteStatus: 'ACTIVE',
        isSuperAdmin: true,
      },
      update: {
        passwordHash,
        emailVerified: true,
        inviteStatus: 'ACTIVE',
        isSuperAdmin: true,
      },
    });

    console.log(`Super admin upserted: ${user.email} (id=${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
