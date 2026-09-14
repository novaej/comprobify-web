#!/usr/bin/env node
/**
 * Rotates ENCRYPTION_KEY — decrypts every TenantApiKey.encryptedKey and
 * WebhookEndpoint.encryptedSecret with the OLD key, re-encrypts with the NEW
 * key, writes both back. Must run (and succeed) BEFORE cutting the
 * ENCRYPTION_KEY env var over and restarting — see docs/deployment.md's
 * "Rotating secrets" section for why: changing the env var first, without
 * this step, permanently breaks (a) every tenant API call this app makes on
 * a user's behalf (requireContext() can no longer decrypt any TenantApiKey)
 * and (b) inbound webhook HMAC verification (src/app/api/webhooks/receive
 * can no longer decrypt any WebhookEndpoint.encryptedSecret) — a full outage,
 * not a gradual one.
 *
 * Self-contained: reimplements the exact AES-256-GCM format
 * src/lib/crypto.ts uses (`v1:<iv_base64>:<ciphertext_base64>:<tag_base64>`,
 * 12-byte IV) rather than importing that module, since this script needs two
 * different keys (old and new) in the same run and crypto.ts's encrypt/
 * decrypt read a single global ENCRYPTION_KEY. Also, crypto.ts has
 * `import 'server-only'` at the top and is TypeScript — it isn't importable
 * from a plain CommonJS script the way this repo's other one-off scripts
 * (scripts/db-reset.js, prisma/seed.js) run, so it's reimplemented instead of
 * required, same reasoning comprobify's own rotate-encryption-key.js gives
 * for not requiring its crypto.service.js. Run `node scripts/rotate-encryption-key.js
 * --self-test` any time src/lib/crypto.ts changes, to prove this file's
 * format still matches it (see the self-test function below) — this repo has
 * no test runner configured, so that's the closest equivalent to comprobify's
 * unit test file.
 *
 * Usage:
 *   node scripts/rotate-encryption-key.js [--dry-run]
 *   (prompts for OLD_ENCRYPTION_KEY / NEW_ENCRYPTION_KEY interactively, input hidden)
 *   node scripts/rotate-encryption-key.js --self-test   (no DB, no env vars needed)
 *
 * Deliberately does NOT accept the keys as env vars or CLI args — this is the
 * incident-response tool for a suspected key compromise, so it must never be
 * the thing that leaks the *new* key via shell history or `ps` output during
 * the exact moment an attacker with residual access might be watching either.
 * Needs a real interactive terminal (the prompt uses stdin raw mode) — see
 * docs/guides/encryption-key-rotation.md for the `docker compose exec -it`
 * invocation this requires (not `-T`, which disables the TTY the prompt needs).
 * Mirrors the identical fix in comprobify's own rotate-encryption-key.js
 * (docs/security-audit-2026-09-12.md finding #3 over there).
 *
 * --dry-run: runs the exact same transaction (decrypt every row with
 * OLD_ENCRYPTION_KEY, re-encrypt with NEW_ENCRYPTION_KEY, round-trip verify)
 * but rolls back instead of committing — nothing is written. Always run this
 * first, and against a copy of real staging/production data before ever
 * rotating for real — see docs/guides/database-backups.md for pulling an
 * importable dump.
 *
 * Needs DATABASE_URL (and, against staging/production, DATABASE_SSL /
 * DATABASE_SSL_CA) the same as the app itself. Loads .env.local for local
 * runs, same convention as scripts/db-reset.js / prisma/seed.js — on
 * staging/production this instead runs via `docker compose exec`, which
 * already has the real env vars from the container's .env file, so the
 * dotenv load is a no-op there (dotenv never overwrites an already-set var).
 *
 * The whole rotation runs as one transaction with SELECT ... FOR UPDATE
 * across both tables, so a concurrent read (a live requireContext() call, an
 * inbound webhook) either sees the fully-old or fully-new state, never a mix
 * — but the moment this commits, the database holds ciphertext the old key
 * can no longer decrypt. Update ENCRYPTION_KEY and redeploy immediately after
 * a successful (non-dry-run) run; don't leave a gap.
 */

require('dotenv').config({ path: '.env.local' });

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // matches src/lib/crypto.ts's randomBytes(12) — NOT 16

function parseKey(name, hex) {
  if (!hex || hex.length !== 64) {
    throw new Error(`${name} must be a 64-character hex string (32 bytes)`);
  }
  return Buffer.from(hex, 'hex');
}

// Mirrors src/lib/crypto.ts's encrypt(), parameterised by an explicit key.
function encryptWithKey(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

// Mirrors src/lib/crypto.ts's decrypt(), parameterised by an explicit key.
function decryptWithKey(stored, key) {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error(`Unknown encryption format: ${parts[0]}`);
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8'); // throws if the auth tag doesn't match
}

// No DB access, no env vars required — proves this file's encrypt/decrypt
// format is byte-for-byte compatible with src/lib/crypto.ts's real output,
// without importing that module (see file header for why it can't be
// imported directly). Re-run this whenever src/lib/crypto.ts's format
// changes and update both files together if it fails.
function selfTest() {
  const key = crypto.randomBytes(32);
  const plaintext = 'rotate-encryption-key self-test value';

  const encrypted = encryptWithKey(plaintext, key);
  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error(`Self-test failed: expected format "v1:iv:ct:tag", got "${encrypted}"`);
  }
  if (Buffer.from(parts[1], 'base64').length !== IV_LENGTH) {
    throw new Error(`Self-test failed: IV is not ${IV_LENGTH} bytes — check src/lib/crypto.ts hasn't changed its randomBytes() length`);
  }
  const roundTripped = decryptWithKey(encrypted, key);
  if (roundTripped !== plaintext) {
    throw new Error('Self-test failed: round-trip did not return the original plaintext');
  }

  console.log('Self-test passed: encryptWithKey/decryptWithKey match src/lib/crypto.ts\'s v1 format (aes-256-gcm, 12-byte IV, base64, "v1:iv:ct:tag").');
}

// Mirrors src/lib/db.ts's sslConfig() — this script uses a plain `pg` Client
// rather than the Prisma adapter (simpler for a one-off multi-table
// transaction), but must honor the same DATABASE_SSL/DATABASE_SSL_CA
// contract to reach staging/production's DigitalOcean cluster at all.
function sslConfig() {
  if (process.env.DATABASE_SSL !== 'true') return undefined;
  return {
    rejectUnauthorized: true,
    ...(process.env.DATABASE_SSL_CA
      ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') }
      : {}),
  };
}

// Key codes compared numerically (charCodeAt), not as string literals, to
// avoid any ambiguity editing/rendering raw control characters in source.
const KEY_ENTER = 13;
const KEY_CTRL_C = 3;
const KEY_CTRL_D = 4;
const KEY_BACKSPACE = 127;
const KEY_BACKSPACE_ALT = 8;

// Reads one line from stdin with input hidden entirely (not even masked with
// `*` — simplest to get right, and there's no need to let anyone looking at
// the screen even see the key's length). Requires a real TTY: raw mode has
// nothing to attach to otherwise, which is exactly what `docker compose exec
// -T` (no pseudo-terminal) would hit — fails fast with a clear message
// instead of hanging.
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error(
        `Cannot prompt for "${question.trim()}" - stdin is not an interactive terminal. ` +
        'Run this from a real terminal, or via `docker compose exec -it` (not -T).'
      ));
      return;
    }

    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');

    let input = '';
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
    };
    const onData = (char) => {
      const code = char.charCodeAt(0);
      if (code === KEY_ENTER || code === KEY_CTRL_D) {
        cleanup();
        process.stdout.write('\n');
        resolve(input);
      } else if (code === KEY_CTRL_C) {
        cleanup();
        process.stdout.write('\n');
        process.exit(1);
      } else if (code === KEY_BACKSPACE || code === KEY_BACKSPACE_ALT) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const oldKeyHex = await promptHidden('OLD_ENCRYPTION_KEY: ');
  const newKeyHex = await promptHidden('NEW_ENCRYPTION_KEY: ');

  if (oldKeyHex && newKeyHex && oldKeyHex === newKeyHex) {
    throw new Error('OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must differ');
  }
  const oldKey = parseKey('OLD_ENCRYPTION_KEY', oldKeyHex);
  const newKey = parseKey('NEW_ENCRYPTION_KEY', newKeyHex);

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const { Client } = require('pg');
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(),
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    // No isActive/active filter on either table — a revoked TenantApiKey or
    // an inactive WebhookEndpoint still holds real credential material at
    // rest and must stay decryptable (e.g. for audit, or if reactivated),
    // same reasoning as comprobify's rotate-encryption-key.js not filtering
    // on issuers.active.
    const { rows: apiKeyRows } = await client.query(
      'SELECT id, encrypted_key FROM tenant_api_keys FOR UPDATE',
    );
    const { rows: webhookRows } = await client.query(
      'SELECT id, encrypted_secret FROM webhook_endpoints FOR UPDATE',
    );

    console.log(`Found ${apiKeyRows.length} tenant_api_keys row(s) and ${webhookRows.length} webhook_endpoints row(s).`);

    for (const row of apiKeyRows) {
      const plaintext = decryptWithKey(row.encrypted_key, oldKey);
      const reEncrypted = encryptWithKey(plaintext, newKey);

      if (decryptWithKey(reEncrypted, newKey) !== plaintext) {
        throw new Error(`Round-trip verification failed for tenant_api_keys row ${row.id}`);
      }

      if (!dryRun) {
        await client.query('UPDATE tenant_api_keys SET encrypted_key = $1 WHERE id = $2', [reEncrypted, row.id]);
      }
    }

    for (const row of webhookRows) {
      const plaintext = decryptWithKey(row.encrypted_secret, oldKey);
      const reEncrypted = encryptWithKey(plaintext, newKey);

      if (decryptWithKey(reEncrypted, newKey) !== plaintext) {
        throw new Error(`Round-trip verification failed for webhook_endpoints row ${row.id}`);
      }

      if (!dryRun) {
        await client.query('UPDATE webhook_endpoints SET encrypted_secret = $1 WHERE id = $2', [reEncrypted, row.id]);
      }
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log(`[dry run] ${apiKeyRows.length} tenant_api_keys row(s) and ${webhookRows.length} webhook_endpoints row(s) verified — decrypt with OLD_ENCRYPTION_KEY, re-encrypt and round-trip cleanly with NEW_ENCRYPTION_KEY. No changes written.`);
    } else {
      await client.query('COMMIT');
      console.log(`Rotated ${apiKeyRows.length} tenant_api_keys row(s) and ${webhookRows.length} webhook_endpoints row(s) to the new key. Update ENCRYPTION_KEY in every environment and redeploy now — the database already holds ciphertext the old key can no longer decrypt.`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rotation failed, rolled back — no data was changed.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    main();
  }
}

module.exports = { encryptWithKey, decryptWithKey, parseKey, selfTest };
