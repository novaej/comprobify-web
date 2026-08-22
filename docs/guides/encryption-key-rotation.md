# ENCRYPTION_KEY Rotation

See `docs/deployment.md`'s "Rotating secrets" section for *why* this is dangerous and different from rotating `AUTH_SECRET`, `CONTEXT_COOKIE_SECRET`, `COMPROBIFY_ADMIN_SECRET`, or DB credentials — in short, `ENCRYPTION_KEY` is the only thing standing between two tables' encrypted columns and being unreadable garbage:

- `TenantApiKey.encryptedKey` — the tenant API key `requireContext()` decrypts on every server-side call this app makes to the Comprobify API on a user's behalf.
- `WebhookEndpoint.encryptedSecret` — the HMAC secret `src/app/api/webhooks/receive/route.ts` decrypts to verify every inbound webhook delivery.

Swapping the env var alone, without re-encrypting existing rows first, permanently breaks **both** at once — every tenant loses the ability to make any API-backed request, and every inbound webhook fails signature verification. A full outage, not a gradual one, and it hits both tables simultaneously since they share the one key.

`scripts/rotate-encryption-key.js` does the actual re-encryption, across both tables in a single transaction. This guide covers how to run it.

---

## What the script does

Self-contained — it reimplements the exact AES-256-GCM format `src/lib/crypto.ts` uses (`v1:<iv_base64>:<ciphertext_base64>:<tag_base64>`, 12-byte IV — **not** the same format as the sibling `comprobify` API repo's own rotation script, which uses hex-encoded `iv:tag:ciphertext` with a 16-byte IV; don't copy values or assumptions between the two) rather than importing `src/lib/crypto.ts` directly. Two reasons: the script needs to hold two different keys (old and new) in the same run, while `crypto.ts`'s `encrypt`/`decrypt` read a single global `ENCRYPTION_KEY`; and `crypto.ts` has `import 'server-only'` at the top, which throws unconditionally outside Next's own bundler — it cannot be `require()`d from a plain Node script the way this repo's other one-off scripts (`scripts/db-reset.js`, `prisma/seed.js`) run.

This repo has no test runner configured (`package.json` has no `test` script, no Jest/Vitest, no `tests/` directory) — unlike `comprobify`, which keeps a unit test asserting cross-compatibility between its rotation script and its real crypto module. The closest equivalent here is:

```bash
node scripts/rotate-encryption-key.js --self-test
```

No DB, no env vars needed. It encrypts/decrypts a throwaway value with the script's own functions and asserts the output matches `crypto.ts`'s format (`v1:` prefix, 4 `:`-separated parts, 12-byte IV) and round-trips correctly. Re-run this — and update both files together if it fails — any time `src/lib/crypto.ts`'s format changes.

Runs the whole rotation as one transaction: `SELECT ... FOR UPDATE` on every row in both `tenant_api_keys` and `webhook_endpoints` (no `is_active`/`active` filter on either — a revoked API key or a deactivated webhook endpoint still holds real credential material at rest and must stay decryptable), decrypt each with the old key, re-encrypt with the new key, round-trip-verify the result, then `UPDATE`. A concurrent read during the transaction (a live `requireContext()` call, an inbound webhook) blocks briefly rather than seeing a half-rotated state; nothing partial can ever land — one failed row rolls back the entire batch, both tables included.

`--dry-run` runs that identical transaction but `ROLLBACK`s instead of `COMMIT`s at the end — real DB read, real decrypt/re-encrypt/verify against real data, zero writes. Always run this before a real rotation.

---

Test against a copy of real data before ever rotating for real — see `docs/guides/database-backups.md` for getting an importable dump from staging or production.

## Local / dev / staging, with direct DB access

```bash
# Always dry-run first
OLD_ENCRYPTION_KEY=<current key> NEW_ENCRYPTION_KEY=<new key> \
  node scripts/rotate-encryption-key.js --dry-run

# Then for real
OLD_ENCRYPTION_KEY=<current key> NEW_ENCRYPTION_KEY=<new key> \
  node scripts/rotate-encryption-key.js

# Then immediately update ENCRYPTION_KEY (e.g. in .env.local) — don't leave a gap
```

Generate a new key the same way as a first-time one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Needs `DATABASE_URL` (and, against a TLS-required cluster, `DATABASE_SSL`/`DATABASE_SSL_CA`) — the same connection contract `src/lib/db.ts` uses. Loads `.env.local` for a local run, same convention as `scripts/db-reset.js`/`prisma/seed.js`.

---

## On staging/production

The droplet's Postgres isn't publicly reachable by default (DigitalOcean Trusted Sources — see `docs/guides/database-backups.md`), and this app runs as a single `web` container (`deploy/docker-compose.yml`) built from the full-`node_modules` image (not Next's "output: standalone" mode — see the `Dockerfile`'s top comment), so `scripts/` is present at `/app/scripts` inside the running container and this can run via `docker compose exec` the same way `comprobify`'s equivalent script runs against its `api` container:

```bash
ssh -i ~/.ssh/comprobify_web_deploy_staging cpfywebdeploy9x@<droplet reserved IP>   # swap in production's key/user for that environment
cd /opt/comprobify-web

docker compose exec -T -e OLD_ENCRYPTION_KEY=<current> -e NEW_ENCRYPTION_KEY=<new> \
  web node scripts/rotate-encryption-key.js --dry-run

# then, if that looks right:
docker compose exec -T -e OLD_ENCRYPTION_KEY=<current> -e NEW_ENCRYPTION_KEY=<new> \
  web node scripts/rotate-encryption-key.js
```

The container already has `DATABASE_URL`/`DATABASE_SSL`/`DATABASE_SSL_CA` from `/opt/comprobify-web/.env` (written by `deploy-staging.yml`/`deploy-production.yml` on every deploy) — no need to pass those explicitly.

Then immediately update `ENCRYPTION_KEY` in the `staging`/`production` GitHub Environment's Secrets and trigger a redeploy — both `requireContext()` (every tenant API call) and the webhook receiver are broken in the gap between the script committing and the app restarting with the new key, so don't let that gap sit open.

**Known gap:** typing the keys directly in that SSH session lands them in shell history and the droplet's process list (`docker compose exec -e` args are visible via `ps` on the host for the duration of the command). Acceptable for now given how rarely this runs, but worth revisiting (e.g. a stdin prompt instead of env vars) before this is ever run against a real suspected compromise rather than a test — same gap `comprobify`'s equivalent guide flags for its own script.

---

## Verification

This repo has no automated test suite to run the crypto logic under, so verification for this script leans more heavily on manual, real-data checks than `comprobify`'s Jest-backed equivalent does:

1. `node scripts/rotate-encryption-key.js --self-test` — proves the script's `encryptWithKey`/`decryptWithKey` match `src/lib/crypto.ts`'s exact format. No DB, no real keys.
2. `--dry-run` against a real database (local, or a restored copy of staging/production per `docs/guides/database-backups.md`) — proves the script can decrypt *actually-stored* ciphertext (not just its own round-trip) with the real current `ENCRYPTION_KEY`, re-encrypt, and round-trip clean, with zero writes.
3. Before ever rotating a real environment, run a real (non-dry-run) rotation against a restored copy of that environment's data first, confirm the app can still authenticate and send/receive webhooks against the rotated rows, and only then run it against the real environment.
