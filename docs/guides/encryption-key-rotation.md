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

**The script prompts for both keys interactively, with input hidden — it deliberately does not accept `OLD_ENCRYPTION_KEY`/`NEW_ENCRYPTION_KEY` as env vars or CLI arguments.** This is the incident-response tool for a suspected key compromise, so it must never be the thing that leaks the *new* key via shell history or `ps` output during the exact moment an attacker with residual access might be watching either — see "Why the interactive prompt" below for the full reasoning. This needs a real interactive terminal (the prompt uses stdin raw mode) — running it non-interactively (piped/redirected stdin, or `docker compose exec -T`) fails fast with a clear error instead of hanging.

---

Test against a copy of real data before ever rotating for real — see `docs/guides/database-backups.md` for getting an importable dump from staging or production.

## Local / dev / staging, with direct DB access

```bash
# Always dry-run first
node scripts/rotate-encryption-key.js --dry-run
# OLD_ENCRYPTION_KEY: <type it, hidden>
# NEW_ENCRYPTION_KEY: <type it, hidden>

# Then for real
node scripts/rotate-encryption-key.js
# OLD_ENCRYPTION_KEY: <type it, hidden>
# NEW_ENCRYPTION_KEY: <type it, hidden>

# Then immediately update ENCRYPTION_KEY (e.g. in .env.local) — don't leave a gap
```

Generate a new key the same way as a first-time one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Needs `DATABASE_URL` (and, against a TLS-required cluster, `DATABASE_SSL`/`DATABASE_SSL_CA`) — the same connection contract `src/lib/db.ts` uses. Loads `.env.local` for a local run, same convention as `scripts/db-reset.js`/`prisma/seed.js`.

---

## On staging/production

The droplet's Postgres isn't publicly reachable by default (DigitalOcean Trusted Sources — see `docs/guides/database-backups.md`), and this app runs as a single `web` container (`deploy/docker-compose.yml`) built from the full-`node_modules` image (not Next's "output: standalone" mode — see the `Dockerfile`'s top comment), so `scripts/` is present at `/app/scripts` inside the running container and this can run via `docker compose exec` the same way `comprobify`'s equivalent script runs against its `api` container.

**Use `-it`, not `-T`** — the script's interactive prompt needs a real pseudo-terminal to read hidden input from; `-T` disables that and the script will fail fast with a clear error instead of hanging:

```bash
ssh -i ~/.ssh/comprobify_web_deploy_staging cpfywebdeploy9x@<droplet reserved IP>   # swap in production's key/user for that environment
cd /opt/comprobify-web

docker compose exec -it web node scripts/rotate-encryption-key.js --dry-run
# OLD_ENCRYPTION_KEY: <type it, hidden>
# NEW_ENCRYPTION_KEY: <type it, hidden>

# then, if that looks right:
docker compose exec -it web node scripts/rotate-encryption-key.js
# OLD_ENCRYPTION_KEY: <type it, hidden>
# NEW_ENCRYPTION_KEY: <type it, hidden>
```

The container already has `DATABASE_URL`/`DATABASE_SSL`/`DATABASE_SSL_CA` from `/opt/comprobify-web/.env` (written by `deploy-staging.yml`/`deploy-production.yml` on every deploy) — no need to pass those explicitly.

Then immediately update `ENCRYPTION_KEY` in the `staging`/`production` GitHub Environment's Secrets and trigger a redeploy — both `requireContext()` (every tenant API call) and the webhook receiver are broken in the gap between the script committing and the app restarting with the new key, so don't let that gap sit open.

### Why the interactive prompt

This script exists specifically for incident response to a *suspected key compromise* — which means whoever's in there may already have residual access to this exact droplet (a backdoor, a lingering shell) and could be watching `ps`/reading shell history in real time while you run it. The old key being readable that way isn't new information to them (they're already assumed to have it, however they got in) — what actually matters is the *new* key, the one meant to lock them back out. Typing either key as `-e KEY=value` (a prior version of this doc) or any other CLI-argument/env-var form leaves it sitting in both the shell's history file and the process list (`ps aux`, visible on the droplet host for the duration of the command) for anyone with access to that same droplet to read — including, in this scenario, the new key you're trying to establish. Prompting for it interactively with hidden input means neither key ever appears in a command line or gets echoed anywhere — only whoever's physically watching the screen at the moment of typing sees it.

This is a different, narrower problem than `/opt/comprobify-web/.env` sitting on the droplet in plaintext (a separate, already-accepted trade-off — see `docs/deployment.md`'s "Rotating secrets" section). After a successful rotation, the new key does land in `.env` the same way the old one did, which is fine and expected — normal operation, not an incident. The point of the prompt is only to avoid an *additional*, avoidable leak of the new key during the narrow window of the rotation itself. Mirrors the identical fix comprobify's own `docs/guides/encryption-key-rotation.md` made for the same class of gap (`docs/security-audit-2026-09-12.md` finding #3 over there).

---

## Verification

This repo has no automated test suite to run the crypto logic under, so verification for this script leans more heavily on manual, real-data checks than `comprobify`'s Jest-backed equivalent does:

1. `node scripts/rotate-encryption-key.js --self-test` — proves the script's `encryptWithKey`/`decryptWithKey` match `src/lib/crypto.ts`'s exact format. No DB, no real keys.
2. `--dry-run` against a real database (local, or a restored copy of staging/production per `docs/guides/database-backups.md`) — proves the script can decrypt *actually-stored* ciphertext (not just its own round-trip) with the real current `ENCRYPTION_KEY`, re-encrypt, and round-trip clean, with zero writes.
3. Before ever rotating a real environment, run a real (non-dry-run) rotation against a restored copy of that environment's data first, confirm the app can still authenticate and send/receive webhooks against the rotated rows, and only then run it against the real environment.
