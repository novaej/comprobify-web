/**
 * Proves Row-Level Security is fail-closed (ADR-010).
 *
 * Runs against a real Postgres with every migration applied, connected as the
 * non-superuser app role. No mocks. Refuses to run unless the database name ends in
 * "_test".
 *
 *   createdb comprobify_web_test   # as an admin; owner = the app role
 *   DATABASE_URL=postgresql://app_role:...@localhost:5432/comprobify_web_test npx prisma migrate deploy
 *   DATABASE_URL=...same... npm run test:integration
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import rlsTables from '../../prisma/rls-tables.json';
import { asSystem, db, withTenant } from '@/lib/db';

const url = process.env.DATABASE_URL;
if (!url || !/_test$/.test(new URL(url).pathname.slice(1))) {
  throw new Error('Refusing to run RLS integration tests: DATABASE_URL must point at a database whose name ends in _test');
}

const pool = new Pool({ connectionString: url, max: 3 });
const RLS_VIOLATION = '42501';
const PROTECTED: string[] = rlsTables.protected;
const EXEMPT = Object.keys(rlsTables.exempt);

// Raw SQL on purpose: fixtures must not depend on the code under test.
async function inTx<T>(setup: Array<[string, string]>, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [key, value] of setup) await client.query('SELECT set_config($1, $2, true)', [key, value]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
const asSys = <T>(fn: (c: PoolClient) => Promise<T>) => inTx([['app.rls_system', 'on']], fn);
const asTenant = <T>(id: string, fn: (c: PoolClient) => Promise<T>) => inTx([['app.current_tenant_id', id]], fn);
const noContext = <T>(fn: (c: PoolClient) => Promise<T>) => inTx([], fn);
const count = async (c: PoolClient, table: string, where = 'true', params: unknown[] = []) =>
  Number((await c.query(`SELECT count(*) FROM ${table} WHERE ${where}`, params)).rows[0].count);

type Label = 'A' | 'B';
interface Fixture { tenant: string; apiTenant: string; user: string; user2: string; ids: Record<string, string>; notification: string }
const fx: Record<Label, Fixture> = {} as Record<Label, Fixture>;
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

// One INSERT per protected table, parameterised by owning tenant. `ctx` supplies the rows
// a child table needs (issuer, user, notification). Primary keys are supplied here: the
// columns have no DEFAULT (Prisma generates them).
interface Spec { table: string; insert: (tenant: string, ctx: Fixture) => [string, unknown[]] }
const SPECS: Spec[] = [
  { table: 'tenant_api_keys', insert: (t) => [
    `INSERT INTO tenant_api_keys (id, tenant_id, api_key_id, label, environment, encrypted_key, last_four) VALUES ($1,$2,$3,'k','sandbox','enc','1234')`,
    [randomUUID(), t, randomUUID()]] },
  { table: 'issuers', insert: (t) => [
    `INSERT INTO issuers (id, tenant_id, api_issuer_id, branch_code, issue_point_code, business_name) VALUES ($1,$2,$3,$4,$5,'x')`,
    [randomUUID(), t, randomUUID(), digits(3), digits(3)]] },
  { table: 'user_issuer_access', insert: (t, c) => [
    `INSERT INTO user_issuer_access (id, user_id, tenant_id, issuer_id) VALUES ($1,$2,$3,$4)`,
    [randomUUID(), c.user, t, c.ids.issuers]] },
  { table: 'products', insert: (t) => [
    `INSERT INTO products (id, tenant_id, main_code, description, unit_price, tax_option) VALUES ($1,$2,$3,'p',1,'2')`,
    [randomUUID(), t, digits(6)]] },
  { table: 'clients', insert: (t) => [
    `INSERT INTO clients (id, tenant_id, id_type, id_number, name, email) VALUES ($1,$2,'05',$3,'c','c@example.test')`,
    [randomUUID(), t, digits(10)]] },
  { table: 'document_templates', insert: (t) => [
    `INSERT INTO document_templates (id, tenant_id, document_type, name, data) VALUES ($1,$2,'01',$3,'{}')`,
    [randomUUID(), t, `t-${digits(8)}`]] },
  { table: 'notifications', insert: (t) => [
    `INSERT INTO notifications (id, tenant_id, api_notification_id, type, severity, title, message, api_created_at, synced_at)
     VALUES ($1,$2,$3,'T','INFO','t','m', now(), now())`,
    [randomUUID(), t, digits(10)]] },
  { table: 'notification_reads', insert: (_t, c) => [
    `INSERT INTO notification_reads (id, notification_id, user_id) VALUES ($1,$2,$3)`,
    [randomUUID(), c.notification, c.user]] },
  { table: 'webhook_endpoints', insert: (t) => [
    `INSERT INTO webhook_endpoints (id, tenant_id, api_endpoint_id, url, encrypted_secret, event_types) VALUES ($1,$2,$3,'https://x.test','enc','{}')`,
    [randomUUID(), t, digits(8)]] },
];

async function seed(c: PoolClient, label: Label) {
  const tenant = randomUUID();
  const apiTenant = randomUUID();
  const user = randomUUID();
  const user2 = randomUUID(); // a second member, so "write your own row" tests never collide with the seeded rows
  await c.query(`INSERT INTO tenants (id, api_tenant_id, ruc, business_name) VALUES ($1,$2,$3,$4)`,
    [tenant, apiTenant, digits(13), `RLS ${label}`]);
  await c.query(`INSERT INTO users (id, email, tenant_id, role) VALUES ($1,$2,$3,'Owner')`,
    [user, `rls-${label}-${digits(8)}@example.test`, tenant]);
  await c.query(`INSERT INTO users (id, email, tenant_id, role) VALUES ($1,$2,$3,'Viewer')`,
    [user2, `rls-${label}-2-${digits(8)}@example.test`, tenant]);
  const f: Fixture = { tenant, apiTenant, user, user2, ids: {}, notification: '' };
  // Insert in dependency order; remember the first row id of each table.
  for (const spec of SPECS) {
    const [sql, params] = spec.insert(tenant, f);
    await c.query(sql, params);
    const id = params[0] as string;
    f.ids[spec.table] = id;
    if (spec.table === 'notifications') f.notification = id;
  }
  fx[label] = f;
}

beforeAll(async () => {
  await asSys(async (c) => { await seed(c, 'A'); await seed(c, 'B'); });
});

afterAll(async () => {
  await asSys(async (c) => {
    const tenants = [fx.A?.tenant, fx.B?.tenant].filter(Boolean);
    const users = [fx.A?.user, fx.A?.user2, fx.B?.user, fx.B?.user2].filter(Boolean);
    await c.query('DELETE FROM notification_reads WHERE user_id = ANY($1)', [users]);
    await c.query('DELETE FROM tenants WHERE id = ANY($1)', [tenants]); // cascades to the rest
    await c.query('DELETE FROM users WHERE id = ANY($1)', [users]);
  }).catch((err) => console.error('RLS fixture cleanup failed:', err.message));
  await pool.end();
});

const own = (table: string, label: Label): [string, unknown[]] => [`id = $1`, [fx[label].ids[table]]];

describe('catalog: every protected table is locked down', () => {
  test('the connecting role cannot bypass RLS', async () => {
    const { rows: [role] } = await pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  test.each(PROTECTED)('%s has RLS enabled and forced', async (table) => {
    const { rows: [row] } = await pool.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`, [`public.${table}`]);
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  test.each(PROTECTED)('%s has policies with an explicit WITH CHECK and no unset-means-allow branch', async (table) => {
    const { rows } = await pool.query(
      `SELECT qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`, [table]);
    expect(rows.length).toBeGreaterThan(0);
    for (const policy of rows) {
      expect(policy.with_check).not.toBeNull();
      expect(`${policy.qual} ${policy.with_check}`).not.toMatch(/IS NULL/i);
    }
  });

  test('the helper functions have no unset-means-allow branch', async () => {
    const { rows } = await pool.query(
      `SELECT proname, prosrc FROM pg_proc WHERE proname IN ('app_current_tenant_id','app_is_system')`);
    expect(rows).toHaveLength(2);
    const system = rows.find((r) => r.proname === 'app_is_system')!;
    expect(system.prosrc).toMatch(/= 'on'/);
  });

  test('no table is left unclassified (a new table without a policy fails here)', async () => {
    const { rows } = await pool.query(
      `SELECT c.relname FROM pg_class c WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace`);
    const unclassified = rows.map((r) => r.relname as string)
      .filter((t) => !PROTECTED.includes(t) && !EXEMPT.includes(t));
    expect(unclassified).toEqual([]);
  });

  test('every protected table is covered by an insert spec in this test', () => {
    expect(SPECS.map((s) => s.table).sort()).toEqual([...PROTECTED].sort());
  });

  test('the boot-time guard passes against this database', () => {
    const res = spawnSync('node', ['scripts/check-db-role.js'], { env: { ...process.env }, encoding: 'utf8' });
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
  });
});

describe('no context: fails closed', () => {
  test.each(PROTECTED)('%s: SELECT sees nothing', async (table) => {
    expect(await noContext((c) => count(c, table))).toBe(0);
  });

  test.each(PROTECTED)('%s: UPDATE and DELETE touch nothing', async (table) => {
    const [where, params] = own(table, 'A');
    const touched = await noContext(async (c) => {
      const upd = await c.query(`UPDATE ${table} SET id = id WHERE ${where}`, params);
      const del = await c.query(`DELETE FROM ${table} WHERE ${where}`, params);
      return (upd.rowCount ?? 0) + (del.rowCount ?? 0);
    });
    expect(touched).toBe(0);
    expect(await asSys((c) => count(c, table, where, params))).toBe(1); // still there
  });

  test.each(SPECS)('$table: INSERT is rejected', async (spec) => {
    const [sql, params] = spec.insert(fx.A.tenant, fx.A);
    await expect(noContext((c) => c.query(sql, params))).rejects.toMatchObject({ code: RLS_VIOLATION });
  });

  test('an empty-string tenant is treated as no context', async () => {
    expect(await inTx([['app.current_tenant_id', '']], (c) => count(c, 'products'))).toBe(0);
  });

  test('a malformed tenant never widens access', async () => {
    const attempt = inTx([['app.current_tenant_id', 'not-a-uuid']], (c) => count(c, 'products'));
    await expect(attempt.then((n) => n === 0, () => true)).resolves.toBe(true);
  });

  test('rls_system only accepts the exact value "on"', async () => {
    for (const value of ['true', '1', 'ON', ' on', 'off', '']) {
      expect(await inTx([['app.rls_system', value]], (c) => count(c, 'products'))).toBe(0);
    }
  });
});

describe('tenant context: sees only its own rows', () => {
  test.each(PROTECTED)('%s: A sees A, never B', async (table) => {
    const [aWhere, aParams] = own(table, 'A');
    const [bWhere, bParams] = own(table, 'B');
    const [a, b] = await asTenant(fx.A.tenant, async (c) => [
      await count(c, table, aWhere, aParams), await count(c, table, bWhere, bParams)]);
    expect(a).toBe(1);
    expect(b).toBe(0);
  });

  test.each(PROTECTED)('%s: A cannot update or delete B rows', async (table) => {
    const [where, params] = own(table, 'B');
    const touched = await asTenant(fx.A.tenant, async (c) => {
      const upd = await c.query(`UPDATE ${table} SET id = id WHERE ${where}`, params);
      const del = await c.query(`DELETE FROM ${table} WHERE ${where}`, params);
      return (upd.rowCount ?? 0) + (del.rowCount ?? 0);
    });
    expect(touched).toBe(0);
  });

  test.each(SPECS.filter((s) => s.table !== 'notification_reads'))('$table: A cannot insert a row owned by B', async (spec) => {
    const [sql, params] = spec.insert(fx.B.tenant, fx.B);
    await expect(asTenant(fx.A.tenant, (c) => c.query(sql, params))).rejects.toMatchObject({ code: RLS_VIOLATION });
  });

  test('notification_reads: A cannot insert a read for B\'s notification', async () => {
    const [sql, params] = SPECS.find((s) => s.table === 'notification_reads')!.insert(fx.B.tenant, fx.B);
    await expect(asTenant(fx.A.tenant, (c) => c.query(sql, params))).rejects.toMatchObject({ code: RLS_VIOLATION });
  });

  test.each(PROTECTED.filter((t) => t !== 'notification_reads'))('%s: A cannot move its own row to B', async (table) => {
    const [where, params] = own(table, 'A');
    await expect(asTenant(fx.A.tenant, (c) =>
      c.query(`UPDATE ${table} SET tenant_id = $${params.length + 1} WHERE ${where}`, [...params, fx.B.tenant]),
    )).rejects.toMatchObject({ code: RLS_VIOLATION });
  });

  test.each(SPECS)('$table: A can write its own rows (INSERT ... RETURNING works)', async (spec) => {
    const [sql, params] = spec.insert(fx.A.tenant, { ...fx.A, user: fx.A.user2 });
    const res = await asTenant(fx.A.tenant, (c) => c.query(`${sql} RETURNING id`, params));
    expect(res.rows).toHaveLength(1);
  });
});

describe('system context', () => {
  test.each(PROTECTED)('%s: sees both tenants', async (table) => {
    const [aWhere, aParams] = own(table, 'A');
    const [bWhere, bParams] = own(table, 'B');
    const [a, b] = await asSys(async (c) => [await count(c, table, aWhere, aParams), await count(c, table, bWhere, bParams)]);
    expect([a, b]).toEqual([1, 1]);
  });

  test('a cross-tenant UPDATE (the key-rotation shape) touches every row it targets', async () => {
    const touched = await asSys(async (c) => {
      const r = await c.query('UPDATE webhook_endpoints SET encrypted_secret = encrypted_secret WHERE id = ANY($1)',
        [[fx.A.ids.webhook_endpoints, fx.B.ids.webhook_endpoints]]);
      return r.rowCount;
    });
    expect(touched).toBe(2);
  });

  test('context does not leak to the next transaction on the same connection', async () => {
    const client = await pool.connect();
    try {
      for (const [key, value] of [['app.rls_system', 'on'], ['app.current_tenant_id', fx.A.tenant]] as const) {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1, $2, true)', [key, value]);
        expect(await count(client, 'products')).toBeGreaterThan(0);
        await client.query('COMMIT');
        expect(await count(client, 'products')).toBe(0);
      }
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.rls_system', 'on', true)");
      await client.query('ROLLBACK');
      expect(await count(client, 'products')).toBe(0);
    } finally {
      client.release();
    }
  });
});

describe('integrity checks still work under RLS', () => {
  test('a unique constraint is enforced inside a tenant', async () => {
    const name = `dup-${digits(6)}`;
    const insert = (c: PoolClient) => c.query(
      `INSERT INTO document_templates (id, tenant_id, document_type, name, data) VALUES ($1,$2,'01',$3,'{}')`,
      [randomUUID(), fx.A.tenant, name]);
    await asTenant(fx.A.tenant, insert);
    await expect(asTenant(fx.A.tenant, insert)).rejects.toMatchObject({ code: '23505' });
  });

  test('the same unique key is allowed in two tenants', async () => {
    const name = `shared-${digits(6)}`;
    for (const label of ['A', 'B'] as Label[]) {
      await asTenant(fx[label].tenant, (c) => c.query(
        `INSERT INTO document_templates (id, tenant_id, document_type, name, data) VALUES ($1,$2,'01',$3,'{}')`,
        [randomUUID(), fx[label].tenant, name]));
    }
  });

  test('a foreign key to a tenant that does not exist is rejected', async () => {
    const ghost = randomUUID();
    await expect(asTenant(ghost, (c) => c.query(
      `INSERT INTO products (id, tenant_id, main_code, description, unit_price, tax_option) VALUES ($1,$2,'x','x',1,'2')`,
      [randomUUID(), ghost]))).rejects.toMatchObject({ code: '23503' });
  });
});

// Everything below goes through the real wrappers and Prisma - the code paths the app uses.
describe('application code paths', () => {
  test('withTenant scopes Prisma queries to the tenant', async () => {
    const rows = await withTenant(fx.A.tenant, (tx) => tx.product.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === fx.A.tenant)).toBe(true);
  });

  test('withTenant rejects a non-uuid tenant id', () => {
    expect(() => withTenant('1; DROP TABLE products', async () => null)).toThrow();
  });

  test('Prisma create() (INSERT ... RETURNING) works inside withTenant', async () => {
    const created = await withTenant(fx.A.tenant, (tx) => tx.client.create({
      data: { tenantId: fx.A.tenant, idType: '05', idNumber: digits(10), name: 'n', email: 'n@example.test' },
    }));
    expect(created.tenantId).toBe(fx.A.tenant);
  });

  test('Prisma create() for another tenant is rejected', async () => {
    await expect(withTenant(fx.A.tenant, (tx) => tx.client.create({
      data: { tenantId: fx.B.tenant, idType: '05', idNumber: digits(10), name: 'n', email: 'n@example.test' },
    }))).rejects.toThrow();
  });

  test('a nested include inside withTenant reads the protected relation', async () => {
    const users = await withTenant(fx.A.tenant, (tx) => tx.user.findMany({
      where: { id: fx.A.user }, include: { issuerAccess: true },
    }));
    expect(users[0].issuerAccess).toHaveLength(1);
  });

  test('the same include outside a wrapper returns nothing (the pitfall tsc cannot catch)', async () => {
    const user = await db.user.findUnique({ where: { id: fx.A.user }, include: { issuerAccess: true } });
    expect(user).not.toBeNull();
    expect(user!.issuerAccess).toEqual([]);
  });

  test('asSystem sees both tenants', async () => {
    const rows = await asSystem('test', (tx) => tx.product.findMany({
      where: { tenantId: { in: [fx.A.tenant, fx.B.tenant] } },
    }));
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([fx.A.tenant, fx.B.tenant]));
  });

  test('concurrent requests for different tenants never see each other', async () => {
    const run = (label: Label) => withTenant(fx[label].tenant, (tx) => tx.product.findMany())
      .then((rows) => rows.length > 0 && rows.every((r) => r.tenantId === fx[label].tenant));
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => run(i % 2 ? 'A' : 'B')));
    expect(results.every(Boolean)).toBe(true);
  });

  test('no context leaks out of a wrapper onto the pool', async () => {
    await withTenant(fx.A.tenant, (tx) => tx.product.findMany());
    await asSystem('test', (tx) => tx.product.findMany());
    for (let i = 0; i < 6; i++) expect(await noContext((c) => count(c, 'products'))).toBe(0);
  });

  test('a rolled-back wrapper does not leak either', async () => {
    await expect(withTenant(fx.A.tenant, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await noContext((c) => count(c, 'products'))).toBe(0);
  });

  describe('paths that have no tenant yet', () => {
    test('login: finding a user by email needs no wrapper', async () => {
      const user = await db.user.findUnique({ where: { email: (await asSys((c) => c.query('SELECT email FROM users WHERE id = $1', [fx.A.user]))).rows[0].email } });
      expect(user?.id).toBe(fx.A.user);
    });

    test('session bootstrap: user + tenant load without a wrapper', async () => {
      const user = await db.user.findUnique({ where: { id: fx.A.user }, include: { tenant: true } });
      expect(user?.tenant?.id).toBe(fx.A.tenant);
    });

    test('webhook receiver: tenant by apiTenantId unwrapped, then a tenant-scoped notification upsert', async () => {
      const tenant = await db.tenant.findFirst({ where: { apiTenantId: fx.A.apiTenant }, select: { id: true } });
      expect(tenant?.id).toBe(fx.A.tenant);
      const apiNotificationId = `wh-${digits(8)}`;
      const row = await withTenant(tenant!.id, (tx) => tx.notification.upsert({
        where: { tenantId_apiNotificationId: { tenantId: tenant!.id, apiNotificationId } },
        create: { tenantId: tenant!.id, apiNotificationId, type: 'T', severity: 'INFO', title: 't', message: 'm', apiCreatedAt: new Date() },
        update: {},
      }));
      expect(row.tenantId).toBe(fx.A.tenant);
    });

    test('onboarding: asSystem creates a tenant with its key and issuer, then that tenant can read them', async () => {
      const ruc = digits(13);
      const created = await asSystem('test: onboarding', async (tx) => {
        const tenant = await tx.tenant.create({ data: { apiTenantId: randomUUID(), ruc, businessName: 'New' } });
        await tx.tenantApiKey.create({ data: {
          tenantId: tenant.id, apiKeyId: randomUUID(), label: 'k', environment: 'sandbox', encryptedKey: 'e', lastFour: '0000',
        } });
        await tx.issuer.create({ data: {
          tenantId: tenant.id, apiIssuerId: randomUUID(), branchCode: '001', issuePointCode: '001', businessName: 'New',
        } });
        return tenant;
      });
      const seen = await withTenant(created.id, async (tx) => ({
        keys: await tx.tenantApiKey.count(), issuers: await tx.issuer.count() }));
      expect(seen).toEqual({ keys: 1, issuers: 1 });
      await asSystem('test: cleanup', (tx) => tx.tenant.delete({ where: { id: created.id } }));
    });

    test('seed: upserting the super admin user needs no wrapper', async () => {
      const email = `seed-${digits(8)}@example.test`;
      const user = await db.user.upsert({ where: { email }, create: { email, isSuperAdmin: true }, update: {} });
      expect(user.isSuperAdmin).toBe(true);
      await db.user.delete({ where: { id: user.id } });
    });

    test('admin tenant list needs no wrapper', async () => {
      const tenants = await db.tenant.findMany({ where: { id: { in: [fx.A.tenant, fx.B.tenant] } } });
      expect(tenants).toHaveLength(2);
    });

    test('verification tokens need no wrapper', async () => {
      const token = await db.verificationToken.create({
        data: { userId: fx.A.user, purpose: 'INVITE', tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) },
      });
      expect(token.userId).toBe(fx.A.user);
      await db.verificationToken.delete({ where: { id: token.id } });
    });
  });
});
