# Deployment

---

## Branching strategy

Two long-lived branches map to deployed environments. They are **automation-owned** — promoted forward by tags and GitHub Releases, never by direct or manual pushes. Feature/fix branches are always cut from `main` and merged back via pull request. This mirrors the release model used by the Comprobify API (`../comprobify/docs/deployment.md`), substituting DigitalOcean App Platform's native Autodeploy-on-push for the API's Droplet SSH-based `deploy-staging.yml`/`deploy-production.yml`.

```
  feature/xyz              main                                   staging                  production
      │                     │                                       │                          │
      │  PR + merge         │                                       │                          │
      │────────────────────▶│                                       │                          │
      │                     │  bump version (PR) → tag merge commit │                          │
      │                     │── release-staging.yml (ff-merge) ────▶│                          │
      │                     │                                       │                          │
      │                     │  publish GitHub Release from the tag  │                          │
      │                     │── release-production.yml (ff-merge) ──┼─────────────────────────▶│
      │                     │                                                                   │
  hotfix/xyz                │                                                                   │
      │  branch off `production` (or `staging` until production exists),                       │
      │  PR into the hotfix branch, tag vX.Y.Z+1 → same pipeline                                │
      │  → cherry-pick the merged fix back into `main`                                          │
      │─────────────────────────────────────────────────────────────────────────────────────▶  │
```

Every push to `staging` or `production` (i.e. every fast-forward the release workflows perform) is picked up automatically by DigitalOcean App Platform's Autodeploy setting, which builds and deploys the corresponding app (`comprobify-web-staging` / `comprobify-web-production` — see the CI/CD pipeline section below). No deploy step runs inside this repo's workflows.

| Branch | Environment | Promoted by |
|--------|-------------|-------------|
| `main` | — (trunk; CI only, no deploy) | PR merge |
| `staging` | Staging (DigitalOcean App Platform) | `release-staging.yml` — fast-forwarded on tag push `vX.Y.Z` |
| `production` | Production (DigitalOcean App Platform) — *not yet provisioned, pipeline disabled* | `release-production.yml` — fast-forwarded when a GitHub Release is published |

**Rules:**
- All development happens in feature/fix branches off `main`, merged via PR (1 approval required)
- `staging` and `production` are **automation-owned** — never push to them directly; they only move forward via fast-forward merges performed by the release workflows. Branch protection restricts direct pushes
- A **tag** (`vX.Y.Z`, semantic versioning) means *"build this, validate it in staging."* Pushing it triggers `release-staging.yml`, which fast-forwards `staging`. App Platform's Autodeploy deploys the push automatically — no separate deploy workflow needed
- A **published GitHub Release**, created from a tag already validated in staging, means *"staging confirmed it, ship to production."* Publishing it is the deliberate, auditable approval gate between staging and production — no extra tooling needed
- **Hotfixes** branch from the current `production` ref once it exists (until then, branch from `staging`, which is the only environment live today), flow through a PR + tag through the same pipeline, and **must be cherry-picked back into `main`** afterwards so the fix survives the next regular release

---

## Git workflow & commands

### Daily development

```bash
# Start a new feature
git checkout main
git pull origin main
git checkout -b feature/my-feature

# Work, commit, push
git add <files>
git commit -m "feat: describe the change"
git push origin feature/my-feature

# Open a PR to main in GitHub, review, merge

# Clean up
git checkout main && git pull origin main
git branch -d feature/my-feature
```

### Release to staging

Every commit on `main` is a merged PR (often squash-merged, so the SHA on `main` differs from any local commit you made on the branch). That means **`npm version`'s built-in commit+tag step cannot run directly on `main`** — it would push a version-bump commit straight to `main`, bypassing review, and the tag would point at a commit that PR review never saw. `package.json`'s version and the git tag must move together, so bump it the same way every other change ships, then tag the result:

1. Branch off `main`: `git checkout -b chore/release`
2. Bump the version **without** letting npm create its own commit/tag: `npm --no-git-tag-version version <patch|minor|major>` (updates `package.json` + `package-lock.json` only)
3. In the same branch, rename `CHANGELOG.md`'s `## [Unreleased]` header to `## [X.Y.Z] — <today's date>` (matching the version just written) and start a fresh empty `## [Unreleased]` above it
4. Commit (`chore: bump version to X.Y.Z`), open a PR, merge it like any other change
5. **After** that PR is merged, pull `main`, then tag the resulting merge commit directly — not the commit you made on the branch:
   ```bash
   git checkout main
   git pull origin main
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   ```

`release-staging.yml` fast-forwards `staging` to `vX.Y.Z` and pushes it; App Platform's Autodeploy picks up the push and deploys automatically. Use semantic versioning (`vMAJOR.MINOR.PATCH`) so it's obvious at a glance whether a tag is a feature release (`v1.5.0`) or a hotfix (`v1.4.1`).

The tag still tracks `package.json`'s version — there's just a merge step between bumping it and tagging it, because the squash-merge changes the commit SHA. **Never push a follow-up commit to `main` that changes the version after a tag is created** — that would leave the tagged commit's `package.json` permanently out of sync with its own tag name, and would race with `staging` already having been fast-forwarded to it. If `package.json`'s version and the latest git tag ever drift apart, fix it with a manual one-off sync commit (`chore:`), then resume this sequence for every release after that.

### Promote to production

Once the tag has been validated in staging, promotion is a single deliberate action — **publishing a GitHub Release from that tag**:

1. GitHub UI → **Releases → Draft a new release**
2. Choose the existing tag (e.g. `v1.4.0`) — do not create a new one
3. Paste in that version's section from `CHANGELOG.md` as the release notes (it was already written when the version was bumped — see "Release to staging" above) — no need to regenerate from commits
4. Click **Publish release**

`release-production.yml` then fast-forwards `production` to that commit; App Platform deploys it automatically.

> **Currently disabled** — the production App Platform app, `production` branch, and secrets don't exist yet. See "Production status" below for what's needed to enable this.

### Hotfix flow

Branch from the **currently-deployed `production` ref** (not `main`, which may contain unreleased work). Until production is provisioned, branch from `staging` instead — it's the only environment that's actually live.

```bash
# 1. Cut a short-lived integration branch from what's live in prod
git checkout -b hotfix/payment-bug production   # or `staging`, until production exists

# 2. Make the fix on a sub-branch and PR it into the hotfix branch (same review rigor as any change)
git checkout -b fix/payment-rounding hotfix/payment-bug
# ...fix, commit, push, open PR: fix/payment-rounding → hotfix/payment-bug, review + merge...

# 3. Bump the patch version on another sub-branch off the hotfix branch — same rule as a
#    regular release: never let npm tag/commit directly on a branch that gets squash-merged
git checkout -b chore/release hotfix/payment-bug
npm --no-git-tag-version version patch
# rename CHANGELOG.md's `## [Unreleased]` to `## [X.Y.Z] — <today>`, start a fresh `## [Unreleased]`
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump version to X.Y.Z"
# ...open PR: chore/release → hotfix/payment-bug, review + merge...

# 4. Tag the merged result — this feeds the same release pipeline
git checkout hotfix/payment-bug
git pull origin hotfix/payment-bug
git tag -a v1.4.1 -m v1.4.1
git push origin v1.4.1
```

From here, run it through the normal tag → staging → release → production pipeline.

**Don't skip this step:** cherry-pick the merged fix commit back into `main` so it isn't silently lost or reverted on the next regular release.

```bash
git checkout main
git pull origin main
git cherry-pick <hotfix-commit-sha>
git push origin main
```

---

## Domain routing

The proxy (`src/proxy.ts`) separates marketing pages from the app by hostname. Both the marketing and app sites are served from the **same Next.js deployment** — the proxy does the routing.

| Host | Serves | Redirects everything else to |
|------|--------|------------------------------|
| `comprobify.com` | `/` (landing), `/pricing` | `app.comprobify.com` |
| `staging.comprobify.com` | `/` (landing), `/pricing` | `app-staging.comprobify.com` |
| `app.comprobify.com` | All app routes (`/dashboard`, `/invoices`, …) | `comprobify.com` |
| `app-staging.comprobify.com` | All app routes | `staging.comprobify.com` |

Redirects are permanent (301). Localhost and unknown hosts bypass hostname routing so local dev works without any configuration.

**App Platform custom domain setup (production):**
1. In the `comprobify-web-production` app's Settings → Domains, add **both** `comprobify.com` and `app.comprobify.com` — both on the same app, not separate apps.
2. For each, create the DNS record App Platform shows you (typically a CNAME to `<app-name>.ondigitalocean.app`; an apex/root domain needs an ALIAS/ANAME record if your DNS provider supports one, or DO's own nameservers).
3. No extra env vars are required — the proxy reads the `host` header at runtime.

**Staging:**
1. In `comprobify-web-staging`, add `staging.comprobify.com` and `app-staging.comprobify.com` — same app, both domains.
2. Same DNS setup, separate CNAME targets from production.

---

## CI/CD pipeline

### Workflow files

| File | Trigger | Effect |
|------|---------|--------|
| `.github/workflows/release-staging.yml` | Push of tag `vX.Y.Z` | Fast-forwards `staging` to the tagged commit and pushes it |
| `.github/workflows/release-production.yml` | *(disabled)* GitHub Release published | Fast-forwards `production` to the released commit and pushes it |

Unlike the API (which runs on a DigitalOcean Droplet and needs an explicit `deploy-staging.yml` / `deploy-production.yml` to build, push to GHCR, and SSH-deploy), DigitalOcean App Platform's Autodeploy setting watches `staging` and `production` directly — every push to either branch triggers an automatic build and deployment with no additional workflow file required.

| Branch | App Platform app | URL |
|--------|-------------------|-----|
| `staging` | `comprobify-web-staging` | `staging.comprobify.com` + `app-staging.comprobify.com` |
| `production` | `comprobify-web-production` | `comprobify.com` + `app.comprobify.com` |

### Build settings (both apps)

| Setting | Value |
|---------|-------|
| Source directory | `/` (this is a standalone repo, not a monorepo — nothing to scope) |
| Autodeploy | On, for the app's watched branch (`staging` or `production`) |
| Build command | `npm run build:deploy` — **must be set explicitly**; App Platform's Node.js buildpack has no equivalent to Vercel's build-script auto-detection and would otherwise run plain `npm run build` (`next build` only), silently skipping `prisma generate` and most likely failing outright since the Prisma Client wouldn't exist yet |
| Run command | `npm run start:deploy` — **must also be set explicitly**, overriding the buildpack's auto-detected default (`npm start`). See below for why migrations run here instead of in the build command. |

`build:deploy` runs `prisma generate && next build` — `prisma generate` only reads the schema file and writes generated client code, no database connection needed, so it's safe and necessary at build time. `start:deploy` runs `prisma migrate deploy && next start` — **migrations run at process startup, not at build time**, confirmed necessary the hard way: App Platform's build phase has no network path to the database at all, regardless of Trusted Sources configuration or `vpc.id` on the app spec (empirically confirmed — the same public DB endpoint, with Trusted Sources correctly set for the app, was unreachable from the build step while reachable from a local machine with its own IP trusted). This mirrors the comprobify API repo's own pattern (`app.js` calls `migrate()` before accepting requests, for the same underlying reason). `prisma migrate deploy` only runs migrations not yet recorded in `_prisma_migrations`, so already-applied ones are skipped automatically — safe to run on every startup, including instance restarts with no schema changes.

**`prisma migrate deploy` does not go through this app's `@prisma/adapter-pg` setup.** It spawns a separate native `schema-engine` binary that connects to `DATABASE_URL` with its own independent Postgres connector — none of `src/lib/db.ts`'s pool/SSL wiring applies to it. Watch the runtime logs on first deploy for this step specifically; if it fails with a certificate error while other runtime queries work fine, the fix has to target the schema-engine binary itself, not `DATABASE_SSL`/`DATABASE_SSL_CA`.

### Pipeline stages (staging)

1. **Tag pushed** (`vX.Y.Z`) — `release-staging.yml` checks out the tag and fast-forward-merges `staging` to it, then pushes
2. **Push to `staging`** — App Platform's Autodeploy builds and deploys `comprobify-web-staging` automatically

### Production status

The production pipeline is **written but disabled** — `release-production.yml` exists in the repo with its trigger commented out and an `if: false` guard on its job, because the production App Platform app, `production` branch, and secrets don't exist yet.

To enable production once it's provisioned:
1. Create the `production` branch (fast-forwarded only by the automation, same invariant as `staging`)
2. Create the `comprobify-web-production` App Platform app, with **independent** `AUTH_SECRET` / `ENCRYPTION_KEY` / `CONTEXT_COOKIE_SECRET` / `DATABASE_URL` from staging — never share these between environments
3. In `release-production.yml`: uncomment the `release: types: [published]` trigger and remove the `if: false` guard on the `promote` job
4. Add branch protection to `production` (restrict who can push to the automation only; no force pushes) — see GitHub repository setup below

---

## GitHub repository setup

### 1. Branches

Only `staging` exists today (already created). `production` is created when the production environment is provisioned (see "Production status" above):

```bash
git checkout main
git pull origin main
git checkout -b production
git push -u origin production
git checkout main
```

### 2. Protect `main` (Settings → Branches → Add rule)

- **Branch name pattern:** `main`
- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Do not allow bypassing the above settings

### 3. Protect `staging` and `production` (Settings → Branches → Add rule, one for each)

Both branches are **automation-owned** — they only move forward via fast-forward pushes from `release-staging.yml` / `release-production.yml`. Restrict direct human pushes so the fast-forward invariant can't be broken by a stray commit:

- **Branch name pattern:** `staging` (repeat for `production`)
- ✅ Restrict who can push — limit to the automation (e.g. a bot account / fine-grained PAT, or repository admins only as a fallback)
- ✅ Do not allow force pushes

### 4. Add secrets (Settings → Secrets and variables → Actions)

| Secret | Scope | Used by |
|---|---|---|
| `RELEASE_PUSH_TOKEN` | Repository | `release-staging.yml` / `release-production.yml` — a fine-grained PAT with `Contents: Read and write` on this repo, needed because the default `GITHUB_TOKEN` cannot push to a protected branch |

No deploy-hook secret is needed for App Platform either — Autodeploy watches the branch and deploys on push without any token from this repo.

### 5. Connect to DigitalOcean App Platform

1. DigitalOcean console → **Apps → Create App**
2. Select the `comprobify-web` GitHub repository (authorize DO's GitHub App if not already connected)
3. Create **two separate App Platform apps** — one for staging, one for production:
   - Source directory: `/` (standalone repo, not a monorepo)
   - Branch: `staging` or `production` respectively
   - Autodeploy: on
4. Override the **Build Command** to `npm run build:deploy` and the **Run Command** to `npm run start:deploy` — see "Build settings" above for why neither can be left on the buildpack's defaults
5. Add environment variables to each app (see table below)
6. Add both the marketing and app custom domains to the same app — see "Domain routing" above
7. Deploy

---

## Environment variables

All variables are required. Managed via Terraform (`terraform/environments/staging/terraform.tfvars` for non-secret values, CI-supplied `TF_VAR_*` for secrets — see `terraform/environments/staging/variables.tf`) rather than set by hand in the App Platform UI.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string for the frontend users table. Use a separate logical database from the Comprobify API DB — on staging/production this app and the API share one DigitalOcean Postgres cluster with no server-side pooler in front of it, so connect to the cluster's direct primary connection (same as the API does) and append `?connection_limit=N` (see below) so this app's client-side pool stays within its share of the cluster's connection budget. |
| `COMPROBIFY_API_URL` | Yes | Base URL of the Comprobify API — no trailing slash (e.g. `https://api.comprobify.com`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Full URL of this app — used to build absolute callback URLs (e.g. webhook receive URL, email verification link). Read server-side in `src/app/actions/{auth,onboarding,users}.ts` and `src/lib/webhook-url.ts`; several of those throw if it's unset. |
| `AUTH_SECRET` | Yes | Random 32+ character string used to sign Auth.js JWTs. Generate: `openssl rand -hex 32`. Use a **different value** per environment. |
| `ENCRYPTION_KEY` | Yes | 32-byte hex string used to encrypt `TenantApiKey` values at rest (AES-256-GCM). Generate: `openssl rand -hex 32`. Use a **different value** per environment. |
| `CONTEXT_COOKIE_SECRET` | Yes | Secret used to HMAC-sign the `comprobify_ctx` issuer-selection cookie. Generate: `openssl rand -hex 32`. Use a **different value** per environment. |
| `SENTRY_DSN` | No | Sentry DSN for server-side error capture. Leave unset locally — Sentry is intentionally disabled in local dev. Same DSN value for staging and production; use `APP_ENV` to distinguish environments. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Same DSN value as `SENTRY_DSN` — the `NEXT_PUBLIC_` prefix is required for the browser SDK to receive it. |
| `APP_ENV` | No | Tags server-side errors with the deployment environment (`staging` or `production`). Used by `sentry.server.config.ts` and `sentry.edge.config.ts`. |
| `NEXT_PUBLIC_APP_ENV` | No | Same as `APP_ENV` but exposed to the browser bundle. Used by `sentry.client.config.ts`. |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth token for source map uploads during build. Obtain from sentry.io → Settings → Auth Tokens. Without it, stack traces in Sentry show minified code instead of original TypeScript. |
| `MAILGUN_API_KEY` | No | Mailgun API key for sending invite emails (`src/lib/mailgun.ts`). Without it, `inviteUserAction`/`resendInviteAction` silently skip sending and only log to Sentry. A separate Mailgun setup from the Comprobify API's own — this app sends its own transactional emails. |
| `MAILGUN_DOMAIN` | No | Mailgun sending domain (e.g. `mg.your-domain.com`). Required alongside `MAILGUN_API_KEY`. |
| `MAILGUN_FROM` | No | From address for invite emails (e.g. `Comprobify <no-reply@mg.your-domain.com>`). |
| `COMPROBIFY_ADMIN_SECRET` | No* | Bearer secret for the Comprobify API's `/admin/*` routes, used by `src/lib/admin-api.ts` for the `/admin` super-admin panel (tenant management, payment-proof review). Must match the API's own `ADMIN_SECRET`. *Required only on the one deployment a super admin actually logs into — normal tenant flows never call `/admin/*`. |
| `ADMIN_SEED_PASSWORD` | No* | Password for the super admin user created by `prisma/seed.js` (`npm run db:seed`). *Not read at runtime by Next.js* — only needed transiently when running the seed script against an environment's database, not as a persistent env var on the app. |
| `SUPPORT_EMAIL` | No | Contact email shown on `/support` (`mailto:` link) and linked from the sidebar, marketing footer, and login/register screens. |
| `SUPPORT_PHONE` | No | Contact phone shown on `/support`, used to build a `https://wa.me/` WhatsApp link. Include the country code; non-digit characters are stripped when building the link. |
| `NEXT_PUBLIC_MARKETING_URL` | No | Public origin of the **marketing** host (`comprobify.com` / `staging.comprobify.com`) — not the app host. Used as the canonical/OG base URL and by `robots.ts`/`sitemap.ts` (`src/lib/seo.ts`). `robots.txt`/`sitemap.xml` only allow indexing when `NEXT_PUBLIC_APP_ENV=production`, so this only matters for the production and staging apps. |

> **Staging:** point `COMPROBIFY_API_URL` at the staging Comprobify API. Use a separate `DATABASE_URL` from production — staging users and production users must be isolated.

> **Production:** point `COMPROBIFY_API_URL` at the production Comprobify API. Generate a fresh `AUTH_SECRET` — never reuse the staging value.

#### `DATABASE_URL` connection budget on a shared cluster

Staging's Postgres lives on a DigitalOcean Basic-plan cluster (~22 total backend connections) shared with the `comprobify` API's own database — not a dedicated instance, and **not fronted by any server-side connection pooler (PgBouncer or otherwise)**. Every client — this app, the API's API process, the API's worker — connects straight to the cluster's primary and is responsible for capping its own concurrency; there's no intermediary multiplexing connections down. The API side enforces its share the same way: `../comprobify/src/config/database.js` is a plain `new Pool({ ..., max: config.db.poolMax })` against the direct primary connection, no pooler involved, `DB_POOL_MAX` set to 6 (API process) / 3 (worker) — see `../comprobify/docs/deployment.md`. That leaves roughly 13 of the cluster's ~22 for this app plus a few spare for admin/migration access. This app's `DATABASE_URL` carries two things as a result:

1. **The cluster's direct primary connection** — the same endpoint the API connects to, not a separate pooled/PgBouncer endpoint (DigitalOcean's optional "Connection Pools" feature is not in use here).
2. **`?connection_limit=8`** as a query param — caps how many connections this app's Prisma client will ever open concurrently. This app runs as a long-lived App Platform instance holding one `pg.Pool` for its whole lifetime, so the cap is per-instance: total connections from this app equal `connection_limit × instance count` if the app is ever scaled to multiple instances/replicas — factor that in before changing either number. Enforced entirely client-side by `pg.Pool`'s own `max` option, the same mechanism as `DB_POOL_MAX` on the API side, and works exactly the same whether or not anything sits in front of Postgres.

**There is deliberately no `pgbouncer=true` param.** That flag — like `connection_limit` as Prisma normally reads it — is part of Prisma's own connection-string convention, understood only by Prisma's Rust query engine. This app uses `@prisma/adapter-pg` instead (see `src/lib/db.ts`), which hands the connection string straight to node-postgres's `pg.Pool` — `pg` never parses either param out of the URL on its own; `src/lib/db.ts` manually parses `connection_limit` back out of `DATABASE_URL` and forwards it as `pg.Pool`'s own `max` option, so that part still works as intended. `pgbouncer=true` has no equivalent to forward, and there's nothing here for it to guard against anyway: it exists only to tell Prisma's query engine not to cache named prepared statements, which break under *transaction-mode PgBouncer pooling* specifically (a later query landing on a different backend connection than the one that prepared it) — and since there's no PgBouncer anywhere in this deployment, that failure mode doesn't apply regardless of the adapter. (`@prisma/adapter-pg` also wouldn't need the flag even if there were one — see the adapter note above.) Do not add `pgbouncer=true` back in "for completeness" — it would be inert, and its presence would incorrectly suggest a pooler sits in the path that doesn't.

If the reserved-connection split above ever changes (e.g. the API reserves more/fewer connections, or the cluster is upgraded to a larger plan), update `connection_limit` deliberately to match — it is not derived from anything automatically.

#### `DATABASE_URL` and TLS: `DATABASE_SSL` / `DATABASE_SSL_CA`

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_SSL` | Yes (staging/production) | `"true"` to connect over TLS — required by any real managed Postgres provider, including DigitalOcean and Neon. Leave unset locally (plain Postgres, no TLS). |
| `DATABASE_SSL_CA` | No | Full PEM content of the provider's CA certificate. Required only when the provider uses a private, cluster-specific CA rather than a publicly-trusted one — DigitalOcean managed Postgres is one (download from the cluster's Connection Details page); omit for a publicly-trusted chain (e.g. Neon), where `rejectUnauthorized: true` alone already verifies correctly. Without it against a private-CA provider, connections fail with `SELF_SIGNED_CERT_IN_CHAIN`. Mirrors `DB_SSL_CA` in the comprobify API repo (`../comprobify/docs/deployment.md`) — same shape, same reasoning, different apps hitting the same DigitalOcean cluster. |

**These are deliberately separate env vars, not query params on `DATABASE_URL`** — unlike `connection_limit` (a harmless no-op if misused), an `sslmode`/`sslcert`/`sslkey`/`sslrootcert` param in the URL is actively dangerous here. node-postgres's `ConnectionParameters` constructor does `Object.assign({}, config, parse(connectionString))` (`node_modules/pg/lib/connection-parameters.js`) — whatever the connection string's own query params produce **overwrites** any explicit config passed alongside it for the same key. Since `src/lib/db.ts` passes an explicit `ssl: { rejectUnauthorized: true, ca }` object into `PrismaPg`'s config, an `sslmode` living in `DATABASE_URL` would silently replace that object with an effectively-empty one — the same outcome as not setting `DATABASE_SSL_CA` at all, but harder to notice since it'd look configured. Set TLS only through `DATABASE_SSL`/`DATABASE_SSL_CA`; never add `sslmode` (or the `sslcert`/`sslkey`/`sslrootcert` trio) back into `DATABASE_URL`.

### Removed variables (no longer needed)

| Variable | Reason removed |
|----------|----------------|
| `COMPROBIFY_API_KEY` | API keys are now per-tenant, stored encrypted in the `TenantApiKey` table, resolved via `requireContext()` |
| `COMPROBIFY_SANDBOX` | Sandbox/production state is per-tenant, stored in `Tenant.environment` |
| `NEXTAUTH_SECRET` | Renamed to `AUTH_SECRET` (Auth.js v5 convention) |

---

## Production checklist

**Database**
- [ ] `DATABASE_URL` points to a production PostgreSQL instance (separate from staging)
- [ ] If production shares a connection budget with another service (see "DATABASE_URL connection budget on a shared cluster" above), `connection_limit` on `DATABASE_URL` is set deliberately to match the reserved split, not left unset or copied blindly from staging
- [ ] `DATABASE_SSL=true` is set (any real managed Postgres provider enforces TLS)
- [ ] `DATABASE_SSL_CA` is set if the provider uses a private CA (e.g. DigitalOcean) — verify with a real deploy, not just that the var exists, since a missing/wrong CA fails at connection time with `SELF_SIGNED_CERT_IN_CHAIN`
- [ ] `DATABASE_URL` itself has no `sslmode`/`sslcert`/`sslkey`/`sslrootcert` query param — see the note above on why that would silently override `DATABASE_SSL_CA`
- [ ] `npx prisma migrate deploy` ran successfully on the first deploy (automatic via `start:deploy` at process startup, not the build command — check the runtime logs, and separately confirm this step itself succeeded, since it runs through a different connector than the app's other runtime queries — see the CI/CD pipeline section above)
- [ ] Production database has backups enabled

**Comprobify API**
- [ ] `COMPROBIFY_API_URL` points to the production Comprobify API (not staging)
- [ ] The Comprobify API's registration rate limiter is active (5 req/hour per IP)
- [ ] `ENCRYPTION_KEY` and `CONTEXT_COOKIE_SECRET` are set (generate fresh values per environment)

**Auth**
- [ ] `AUTH_SECRET` is a unique, randomly generated value — never reuse the staging secret (`openssl rand -hex 32`)
- [ ] No `COMPROBIFY_API_KEY` or `COMPROBIFY_SANDBOX` env vars set — these are removed

**App Platform**
- [ ] All env vars are set as server-only (no `NEXT_PUBLIC_` prefix on any secret — a Next.js build-time rule, not platform-specific, but easy to get wrong)
- [ ] Build Command is explicitly set to `npm run build:deploy` and Run Command to `npm run start:deploy` — the buildpack's defaults (`npm run build` / `npm start`) silently skip `prisma generate`/migrations respectively
- [ ] Custom domains configured in App Platform and DNS records updated
- [ ] HTTPS enforced — App Platform provisions and renews certs automatically for custom domains
- [ ] `production` branch is protected in GitHub (no force pushes, restricted push access)
- [ ] Confirm the production app's Autodeploy only watches `production` — not `main` or any other branch — so unreviewed work can't reach it

**Release pipeline**
- [ ] `RELEASE_PUSH_TOKEN` secret added to the repository
- [ ] `production` branch created and the `release-production.yml` trigger uncommented + `if: false` guard removed
- [ ] A tag has been promoted through staging and validated before the first production release

**Sentry**
- [ ] `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` set in each App Platform app (same DSN value for both)
- [ ] `APP_ENV` set to `staging` in the staging app and `production` in the production app
- [ ] `NEXT_PUBLIC_APP_ENV` set to match `APP_ENV` in each app
- [ ] `SENTRY_AUTH_TOKEN` set (obtain from sentry.io → Settings → Auth Tokens) so source maps are uploaded and stack traces show original TypeScript lines
- [ ] Verified a test error appears in the Sentry dashboard before going live

---

## Logs

Application logs are available in the App Platform dashboard under the app → **Runtime Logs** (server-side) and **Build Logs**; **Insights** has aggregated metrics.

Key things to monitor:

| Symptom | Likely cause |
|---------|--------------|
| All users redirected to `/login` in a loop | `AUTH_SECRET` missing or wrong — session JWTs can't be verified |
| 500 on login / registration | `DATABASE_URL` misconfigured or migration not applied — run `npx prisma migrate deploy` |
| Issuer setup fails in onboarding | Comprobify API rejected the registration — check `COMPROBIFY_API_URL` and the API's own droplet logs (`journalctl` / `docker compose logs api`, see `../comprobify/docs/terraform-digitalocean-setup.md`) |
| API calls return 401 after issuer setup | The provisioned API key is invalid or was revoked — re-run setup |
| Sandbox banner appears for production users | User's `environment` column is still `'sandbox'` — they must use the "Activate production" button in Settings |
| Invoice status polling stuck | Proxy route `/api/documents/:key/status` can't reach the Comprobify API — check `COMPROBIFY_API_URL` and network access |
| Build failing | Run `npm run build` locally and fix type errors before pushing |
| API calls fail with `Unexpected token '<' ... is not valid JSON` | `COMPROBIFY_API_URL` has a trailing slash, producing a double slash (`...com//v1/...`) that the API's router doesn't match — it falls through to a generic HTML 404 instead of a JSON error. Remove the trailing slash and redeploy. |
| Build fails source map upload with `Project not found` | `org` in `next.config.ts`'s `withSentryConfig()` call is the numeric ID from the DSN hostname (`o<id>.ingest...`) instead of the organization **slug** — find the slug under Sentry → Settings → General Settings. |
| Onboarding fails with a generic internal-error message, nothing in Sentry | If the catch block doesn't call `Sentry.captureException` (see CLAUDE.md Common Mistake #23), check `ENCRYPTION_KEY` first — it must be exactly 64 hex characters (`openssl rand -hex 32`); a base64 value throws inside `encrypt()` before any DB write is attempted. |
| Every DB query fails at startup with `SELF_SIGNED_CERT_IN_CHAIN` | `DATABASE_SSL=true` is set but `DATABASE_SSL_CA` is missing (or wrong) for a provider with a private CA, e.g. DigitalOcean managed Postgres — download the cluster's CA certificate from its Connection Details page and set the full PEM content as `DATABASE_SSL_CA`. |
| DB connections fail entirely, or TLS verification behaves unexpectedly despite `DATABASE_SSL_CA` being set correctly | `DATABASE_URL` has an `sslmode`/`sslcert`/`sslkey`/`sslrootcert` query param on it — node-postgres's connection-string parsing overwrites the explicit `ssl` config `src/lib/db.ts` builds from `DATABASE_SSL_CA`, silently undoing it. Remove any ssl-related param from the URL itself. |
