# Database Backups — Getting an Importable Dump from Staging (or Production, Once It Exists)

How to pull a `pg_dump` from an environment's DigitalOcean Managed Postgres cluster and import it into your local `comprobify_web_local` database — e.g. to test `scripts/rotate-encryption-key.js` against realistic data, per `docs/guides/encryption-key-rotation.md`'s recommendation to test against a copy of real data before ever rotating for real.

**Only staging exists today.** Per `docs/deployment.md`'s "Production status" section, the production pipeline is written but disabled — no production droplet, database, or secrets exist yet. Everything below applies to staging now and to production once it's provisioned (same cluster-level mechanics, different `DATABASE_URL`).

---

## Before you start: know what you're actually copying

**A staging dump is lower-stakes but not harmless.** Staging is a real, publicly-reachable deployment (`staging.comprobify.com`/`app-staging.comprobify.com`) that real people use to try the product — its `tenants`/`users`/`clients` tables can hold real names, emails, and RUCs, not synthetic test fixtures. It also holds `TenantApiKey.encryptedKey` and `WebhookEndpoint.encryptedSecret` — encrypted at rest with `ENCRYPTION_KEY` (AES-256-GCM, see `docs/guides/encryption-key-rotation.md`), but still real credential material, not something to leave lying around unencrypted-in-transit or on a laptop indefinitely. Treat a dump like the real data it is: don't commit it anywhere, delete the local copy once you're done with it, and don't leave it sitting in a shared location. A future production dump is the same concern with higher real-world stakes.

**The cluster is shared with the Comprobify API (`comprobify`), but this app owns a separate logical database, not just a separate schema** — confirmed in this repo's own `docs/deployment.md` ("Use a separate logical database from the Comprobify API DB") and cross-confirmed in `comprobify`'s own `docs/guides/database-backups.md`, which makes the identical claim from its side. Dumping this app's own `DATABASE_URL`'s database naturally excludes every one of the API's tables (`documents`, `issuers`, `sequential_numbers`, etc.) — nothing extra to filter out. Locally this app's database is `comprobify_web_local` (per `GETTING_STARTED.md`'s "Database setup" section); the staging/production database name is whatever was provisioned on the cluster — check the cluster's Connection Details page in the DO dashboard rather than assuming it matches the local name.

**This app's tenant-owned tables have fail-closed, forced row-level security (ADR-010) — dump as `doadmin`, not the app role.** `FORCE ROW LEVEL SECURITY` applies to the table owner too, so `pg_dump` as the app's own role refuses with `ERROR: query would be affected by row-level security policy` (or, with `--enable-row-security`, silently dumps zero rows). This is the same situation the sibling `comprobify` API's guide documents, for the same reason. The app role is also deliberately *not* what you want here: it must never be a superuser or have `BYPASSRLS` (`scripts/check-db-role.js` enforces that at boot). Use the cluster's `doadmin` credentials for dumps, and verify it can read everything before trusting a dump: `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;` as `doadmin` should show at least one `t`, or `SELECT count(*) FROM clients;` should match the real row count.

**Do not run `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` to make a dump work.** It doesn't just unblock the dump, it disables the protection for real live traffic on the running app's role until someone remembers to turn it back on. Use `doadmin` instead.

**Restoring locally.** A dump taken from an environment that does not have the RLS migration yet restores into the local app role with no special handling; then run `npx prisma migrate deploy` to apply the RLS migration to the copy and rehearse it. A dump taken *after* the migration also restores cleanly (`pg_dump` emits `ENABLE`/`FORCE ROW LEVEL SECURITY` and the policies after the data), but restore it with `--no-owner` so the objects belong to your local app role (not a superuser), and re-check the role with the query above.

---

## 1. Add your IP to Trusted Sources

The cluster restricts connections via DigitalOcean's **Trusted Sources** — confirmed the same cluster (and the same manual, non-Terraform-managed step) `comprobify`'s own guide describes, per `docs/terraform-digitalocean-setup.md`: *"In the DO dashboard: add the reserved IP to the shared Managed Postgres cluster's Trusted Sources (Database → Settings → Trusted Sources)"*. Your laptop isn't on that list by default. DO dashboard → the cluster → **Settings** → **Trusted Sources** → add your current IP (`curl -s ifconfig.me` to get it).

This is a real, if temporary, widening of who can reach the database directly — **remove it again once you're done** (step 6 below). Don't leave it in place indefinitely, especially since the cluster is shared with the live API.

## 2. Get the connection details

DO dashboard → the cluster → **Connection Details**. Use the **"User" dropdown** to pick `doadmin` (see above for why not the app's own role) and this app's own **database** (not the API's `defaultdb`/whatever its own `DB_NAME` is — the two are separate logical databases on the shared cluster, see above). `DB_HOST`/`DB_PORT` are shared with the API (same cluster); only the password/database differ per app.

Pick **`doadmin`** from the "User" dropdown (keeping this app's own database and the same `DB_HOST`/`DB_PORT`). The app's own role cannot dump the RLS-protected tables, see above.

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
