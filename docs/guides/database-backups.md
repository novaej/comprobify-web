# Database Backups — Getting an Importable Dump from Staging (or Production, Once It Exists)

How to pull a `pg_dump` from an environment's DigitalOcean Managed Postgres cluster and import it into your local `comprobify_web_local` database — e.g. to test `scripts/rotate-encryption-key.js` against realistic data, per `docs/guides/encryption-key-rotation.md`'s recommendation to test against a copy of real data before ever rotating for real.

**Only staging exists today.** Per `docs/deployment.md`'s "Production status" section, the production pipeline is written but disabled — no production droplet, database, or secrets exist yet. Everything below applies to staging now and to production once it's provisioned (same cluster-level mechanics, different `DATABASE_URL`).

---

## Before you start: know what you're actually copying

**A staging dump is lower-stakes but not harmless.** Staging is a real, publicly-reachable deployment (`staging.comprobify.com`/`app-staging.comprobify.com`) that real people use to try the product — its `tenants`/`users`/`clients` tables can hold real names, emails, and RUCs, not synthetic test fixtures. It also holds `TenantApiKey.encryptedKey` and `WebhookEndpoint.encryptedSecret` — encrypted at rest with `ENCRYPTION_KEY` (AES-256-GCM, see `docs/guides/encryption-key-rotation.md`), but still real credential material, not something to leave lying around unencrypted-in-transit or on a laptop indefinitely. Treat a dump like the real data it is: don't commit it anywhere, delete the local copy once you're done with it, and don't leave it sitting in a shared location. A future production dump is the same concern with higher real-world stakes.

**The cluster is shared with the Comprobify API (`comprobify`), but this app owns a separate logical database, not just a separate schema** — confirmed in this repo's own `docs/deployment.md` ("Use a separate logical database from the Comprobify API DB") and cross-confirmed in `comprobify`'s own `docs/guides/database-backups.md`, which makes the identical claim from its side. Dumping this app's own `DATABASE_URL`'s database naturally excludes every one of the API's tables (`documents`, `issuers`, `sequential_numbers`, etc.) — nothing extra to filter out. Locally this app's database is `comprobify_web_local` (per `GETTING_STARTED.md`'s "Database setup" section); the staging/production database name is whatever was provisioned on the cluster — check the cluster's Connection Details page in the DO dashboard rather than assuming it matches the local name.

**This app's own tables have no row-level security — verified, not assumed.** `docs/deployment-reference-staging.md`'s "Database setup" section states this explicitly: *"This app's Prisma schema does not use PostgreSQL row-level security — tenant isolation is enforced at the application layer."* Confirmed independently here too: no migration under `prisma/migrations/` sets `ROW LEVEL SECURITY` or `FORCE ROW LEVEL SECURITY` anywhere (`grep -rli "row level security" prisma/migrations` finds nothing). This is a real difference from the sibling `comprobify` API repo, which does `FORCE ROW LEVEL SECURITY` on several of its own tables specifically so RLS applies even to the table-owning role — see its own `docs/guides/database-backups.md` for why that forces API dumps to authenticate as `doadmin` instead of the app's own role. **That specific problem does not apply to this app's tables** — the app's own role (`comprobify_web_app` locally; whatever the staging/production role is called) should `pg_dump` its own database cleanly with no RLS-related refusal.

Still, don't take that as permanent — if a future migration ever adds `FORCE ROW LEVEL SECURITY` to one of this app's own tables and nobody updates this note, `pg_dump` as the app's own role will fail with `ERROR: query would be affected by row-level security policy`, and its own HINT will suggest `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY`. **Do not do that** — it doesn't just unblock the dump, it disables the RLS protection for real live traffic on the running app's own role until someone remembers to turn it back on, not an acceptable trade-off for a one-off backup. If that ever happens, fall back to the cluster's admin (`doadmin`) credentials for the dump instead, same principle `comprobify`'s guide already documents — see step 2 below for how to get those from the same DO dashboard page.

---

## 1. Add your IP to Trusted Sources

The cluster restricts connections via DigitalOcean's **Trusted Sources** — confirmed the same cluster (and the same manual, non-Terraform-managed step) `comprobify`'s own guide describes, per `docs/terraform-digitalocean-setup.md`: *"In the DO dashboard: add the reserved IP to the shared Managed Postgres cluster's Trusted Sources (Database → Settings → Trusted Sources)"*. Your laptop isn't on that list by default. DO dashboard → the cluster → **Settings** → **Trusted Sources** → add your current IP (`curl -s ifconfig.me` to get it).

This is a real, if temporary, widening of who can reach the database directly — **remove it again once you're done** (step 6 below). Don't leave it in place indefinitely, especially since the cluster is shared with the live API.

## 2. Get the connection details

DO dashboard → the cluster → **Connection Details**. Use the **"User" dropdown** to pick this app's own role (e.g. `comprobify_web_app`, or whatever it's actually named on that cluster — check rather than guess) and this app's own **database** (not the API's `defaultdb`/whatever its own `DB_NAME` is — the two are separate logical databases on the shared cluster, see above). `DB_HOST`/`DB_PORT` are shared with the API (same cluster); only the user/password/database differ per app.

Since this app has no RLS on its own tables (see above), the app's own role is sufficient and is the lower-privilege choice — prefer it over `doadmin` unless a future RLS migration changes that (in which case switch the "User" dropdown to `doadmin` instead, keeping `DB_HOST`/`DB_PORT` the same).

Check the cluster's actual Postgres major version on that same Connection Details page (or `SELECT version();` once connected) — match it below rather than guessing, since `pg_dump` isn't always safe to run against a much newer or older server major version than itself.

## 3. Install Postgres client tools locally, if you don't have them

```bash
brew install libpq
brew link --force libpq   # puts pg_dump/pg_restore/psql on PATH
```

## 4. Dump directly to your laptop

```bash
pg_dump "postgresql://<app role>:<app role password>@<DB_HOST>:<DB_PORT>/<DB_NAME>?sslmode=require" \
  --no-owner --no-privileges -F c -f ./backup.dump
```

`-F c` (custom format) — compressed, and supports `pg_restore`'s `--clean`/selective-restore/parallel-restore options on the way back in. `--no-owner --no-privileges` strips role-specific `GRANT`/`OWNER TO` statements, since your local role may not exactly match the staging/production role name — without this, restoring could fail or silently skip ownership it can't apply. `sslmode=require` matches `DATABASE_SSL=true`'s intent; the cluster's private CA (`DATABASE_SSL_CA`) doesn't need to be presented client-side for a plain `require` (no `verify-full`) connection.

## 5. Import it into your local database

Restores into `comprobify_web_local` (per `.env.local`), replacing what's there:

```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  -h localhost -p 5432 -U comprobify_web_app -d comprobify_web_local \
  ./backup.dump
```

`--clean --if-exists` drops existing objects before recreating them, so this is safe to run against a database that already has the schema applied (from `npx prisma migrate deploy`/`npm run migrate`) — it won't error on "already exists."

## 6. Clean up

```bash
rm ./backup.dump
```

And remove your IP from the cluster's Trusted Sources again (DO dashboard → the cluster → Settings) — don't leave direct access open past this session, especially once production exists.

---

## Alternative: dump from the droplet instead

If you'd rather not touch Trusted Sources at all (e.g. a dynamic IP that changes often, making step 1/6 annoying to repeat), the staging droplet's reserved IP is already trusted — SSH in and run `pg_dump` there instead, via a throwaway container since the droplet has Docker but no Postgres client tools installed (same reasoning as `comprobify`'s equivalent section — its own droplet doesn't have them either):

```bash
ssh -i ~/.ssh/comprobify_web_deploy_staging cpfywebdeploy9x@<droplet reserved IP>   # swap in production's key/user once it exists
docker run --rm postgres:<matching major>-alpine \
  pg_dump "postgresql://<app role>:<app role password>@<DB_HOST>:<DB_PORT>/<DB_NAME>?sslmode=require" \
  --no-owner --no-privileges -F c > /opt/comprobify-web/backup.dump
```

Then `scp` it down and delete the remote copy:

```bash
# from your local machine, not the SSH session
scp -i ~/.ssh/comprobify_web_deploy_staging cpfywebdeploy9x@<droplet reserved IP>:/opt/comprobify-web/backup.dump ./backup.dump

# back on the droplet
rm /opt/comprobify-web/backup.dump
```

Then continue from step 5 above (import), then step 6 (clean up — just the local file this time; no Trusted Sources change needed either way, since the droplet was already on the list).
