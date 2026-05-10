/**
 * Development database reset — drops all tables in the public schema,
 * then re-runs all Prisma migrations from scratch.
 *
 * Usage:
 *   npm run db:reset
 *
 * NEVER runs in production.
 *
 * Mirrors the approach used in the comprobify API repo: we drop all tables
 * inside public rather than DROP SCHEMA public CASCADE, because PostgreSQL 15+
 * assigns public schema ownership to pg_database_owner, not the app user.
 */

require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const { execSync } = require('child_process');

if (process.env.NODE_ENV === 'production') {
  console.error('db:reset must not run in production (NODE_ENV=production).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function reset() {
  const client = await pool.connect();
  try {
    console.log('Dropping all tables in public schema...');
    await client.query(`
      DO $$ DECLARE r RECORD; BEGIN
        FOR r IN (
          SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        ) LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$
    `);
    console.log('Tables dropped.');
  } finally {
    client.release();
    await pool.end();
  }

  console.log('Running migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('Done.');
}

reset().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
