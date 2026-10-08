#!/usr/bin/env node
/**
 * Boot-time guard (ADR-010): refuses to start the app if Row-Level Security would not
 * actually apply to its database connection. Runs in `start:deploy`, after
 * `prisma migrate deploy` and before `next start`.
 *
 * It checks role attributes and table flags only - never data:
 *   1. the connected role is not a superuser and has no BYPASSRLS (either would make
 *      every policy a silent no-op - e.g. someone pasting the admin URL into .env);
 *   2. every protected table (prisma/rls-tables.json) has RLS enabled AND forced.
 *
 * RLS_GUARD=warn logs the problem and continues - an emergency escape hatch so a
 * misfiring check can never be the reason a deploy is stuck. Default is enforce.
 */
require('dotenv').config({ path: '.env.local', quiet: true });
const { Client } = require('pg');
const { protected: PROTECTED } = require('../prisma/rls-tables.json');

// Mirrors src/lib/db.ts's sslConfig() (same DATABASE_SSL / DATABASE_SSL_CA contract).
function sslConfig() {
  if (process.env.DATABASE_SSL !== 'true') return undefined;
  return {
    rejectUnauthorized: true,
    ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}),
  };
}

async function main() {
  const problems = [];
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: sslConfig() });
  await client.connect();
  try {
    const { rows: [role] } = await client.query(
      'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    if (role.rolsuper) problems.push(`role "${role.rolname}" is a superuser - superusers bypass RLS unconditionally`);
    if (role.rolbypassrls) problems.push(`role "${role.rolname}" has BYPASSRLS`);

    const { rows } = await client.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND relname = ANY($1)`,
      [PROTECTED],
    );
    for (const name of PROTECTED) {
      const row = rows.find((r) => r.relname === name);
      if (!row) problems.push(`protected table "${name}" does not exist`);
      else if (!row.relrowsecurity || !row.relforcerowsecurity) {
        problems.push(`table "${name}" must have RLS enabled AND forced (enabled=${row.relrowsecurity}, forced=${row.relforcerowsecurity})`);
      }
    }
  } finally {
    await client.end();
  }

  if (problems.length === 0) {
    console.log('[rls-guard] ok: role cannot bypass RLS and all protected tables are enabled + forced.');
    return;
  }
  for (const p of problems) console.error(`[rls-guard] ${p}`);
  if (process.env.RLS_GUARD === 'warn') {
    console.error('[rls-guard] RLS_GUARD=warn - continuing anyway. Tenant isolation is NOT enforced by the database.');
    return;
  }
  console.error('[rls-guard] refusing to start. Fix the database role/migrations, or set RLS_GUARD=warn to override in an emergency.');
  process.exit(1);
}

main().catch((err) => {
  console.error('[rls-guard] check failed to run:', err.message);
  // A guard that cannot run is not proof of a problem; do not turn it into an outage
  // unless explicitly enforced - but the default IS enforce, so fail closed.
  process.exit(process.env.RLS_GUARD === 'warn' ? 0 : 1);
});
