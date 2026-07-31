# Comprobify Web Deployment Reference (Staging)

Last updated: 2026-07-30

This reference describes the staging deployment setup for `comprobify-web`, including infrastructure, required configuration, deployment steps, and post-deployment checks. For the step-by-step guide on how this is set up (and *why*, in detail), see `docs/deployment.md` — this file is the quick-reference sheet of concrete project names and values for the environment that's actually running.

## Architecture

- **GitHub Actions** manages the release pipeline — fast-forwarding the `staging` branch on a tag push (`release-staging.yml`). There is no separate deploy workflow for the app itself; **DigitalOcean App Platform's Autodeploy** setting watches the `staging` branch directly and builds/deploys on every push to it.
- **DigitalOcean App Platform** hosts the Next.js 16 app (`comprobify-web-staging` app) on the `staging` branch. The build command is `npm run build:deploy` (`prisma generate && next build`); the run command is `npm run start:deploy` (`prisma migrate deploy && next start`) — **migrations run at process startup, not at build time**, because App Platform's build phase has no network path to the database (confirmed empirically — Trusted Sources/VPC config made no difference at build time).
- **Terraform** provisions the App Platform app itself (`terraform/environments/staging` → `terraform/modules/app-platform`) — the `digitalocean_app` resource, its DigitalOcean Project assignment, and its two Cloudflare DNS records. There is no manual App Platform console setup. `terraform.yml` runs on push to `staging` (path-filtered to `terraform/**`), applying against a DigitalOcean Spaces state backend (`comprobify-terraform-state` bucket, key `staging/comprobify-web/terraform.tfstate`).
- **DigitalOcean Managed PostgreSQL** provides this app's own tables (`users`, `tenants`, `tenant_api_keys`, `issuers`, `notifications`, `notification_reads`, `webhook_endpoints`, `clients`, `products`, `document_templates`, `document_templates`, `user_issuer_access`, etc. — see `prisma/schema.prisma`). Staging runs on a **Basic-plan cluster shared with the Comprobify API's own database** — not a dedicated instance, and not fronted by any connection pooler (no PgBouncer). Each consumer (this app, the API process, the API worker) caps its own `pg.Pool` concurrency via `?connection_limit=N` on `DATABASE_URL` to stay within its share of the cluster's ~22 backend connections. The connection string, TLS flag, and CA cert are set via Terraform (`TF_VAR_*` secrets in CI), not by hand in the App Platform console.
- **Comprobify API (staging)** is the upstream REST API this app calls server-side only — never from the browser. It now runs on a **DigitalOcean droplet** (project `comprobify-staging`, provisioned by its own Terraform config), not Render. API keys are stored encrypted at rest (`ENCRYPTION_KEY`, AES-256-GCM) and decrypted per-request via `requireContext()`.
- **Sentry** provides error monitoring with the environment tagged `staging`.
- **Cloudflare** provides DNS only for `staging.comprobify.com` / `app-staging.comprobify.com` — both CNAME to the App Platform app's ingress hostname with the proxy off (DNS only), created by Terraform. Unlike a proxied origin, App Platform re-verifies each domain's CNAME on every deploy for its own cert issuance/renewal — a Cloudflare proxy in front would break that verification, so these two domains deliberately skip Cloudflare's WAF/DDoS layer (unlike `api-staging`, which proxies through Cloudflare in front of the droplet).
- **Search engine indexing** — `robots.txt`/`sitemap.xml` (`src/app/robots.ts`/`sitemap.ts`) deliberately disallow everything on this environment: `SEO_INDEXABLE` (`src/lib/seo.ts`) is only true when `NEXT_PUBLIC_APP_ENV=production`, so the real, publicly-reachable staging domain never gets indexed by Google. This is intentional, not a gap to fix.

## Components and Platforms

| Component | Platform | Service / Project name |
|---|---|---|
| Web app | DigitalOcean App Platform | `comprobify-web-staging` (provisioned via Terraform) |
| Database | DigitalOcean Managed PostgreSQL | Shared Basic-plan cluster, also used by the Comprobify API — connection string supplied as `DATABASE_URL` via Terraform (`TF_VAR_*` secrets), not set by hand |
| Error monitoring | Sentry | `comprobify-web` (org slug: `novaej`) |
| DNS | Cloudflare | Domain: `comprobify.com` |
| Upstream API | DigitalOcean Droplet | `comprobify-staging` — see the `comprobify` repo's own `docs/deployment.md` / `docs/terraform-digitalocean-setup.md` |
| Infra-as-code | Terraform | `terraform/environments/staging` → `terraform/modules/app-platform`; state in DigitalOcean Spaces (`comprobify-terraform-state` bucket) |

## DigitalOcean App Platform — `comprobify-web-staging`

Use this section as the baseline configuration for the staging web app. It is fully Terraform-managed — treat the console as read-only for this app.

| Setting | Value |
|---|---|
| Watched branch (Autodeploy) | `staging` |
| Framework | Next.js 16 (Node.js buildpack — no framework-preset auto-detection like Vercel's) |
| Build command | `npm run build:deploy` (`prisma generate && next build`) — must be set explicitly; the buildpack's default (`npm run build`) silently skips `prisma generate` |
| Run command | `npm run start:deploy` (`prisma migrate deploy && next start`) — must also be set explicitly; migrations run here, at process startup, not in the build command |
| Output directory | N/A (App Platform runs `next start`, not a static export) |
| Install command | Buildpack default (`npm ci`) |
| Migrations | Run automatically on every process start via `start:deploy`, before `next start` — not during the build phase (no DB network access at build time) |
| Region | `nyc` (App Platform metro slug); VPC lookup pinned to `nyc1` datacenter, where the database and the API's droplet live |
| Instance size | `basic-xxs` (cheapest tier, ~$5/mo) |
| VPC | Explicit `vpc.id` set in the Terraform spec — App Platform apps do not auto-join a VPC |

### Environment variables

See `terraform/environments/staging/terraform.tfvars` (non-secret values) and the `staging` GitHub Environment's secrets (`TF_VAR_*`, consumed by `terraform.yml`) — not the App Platform console directly. See `docs/deployment.md`'s "Environment variables" section for what each one does.

| Variable | Value |
|---|---|
| `DATABASE_URL` | |
| `DATABASE_SSL` | |
| `DATABASE_SSL_CA` | |
| `COMPROBIFY_API_URL` | |
| `AUTH_SECRET` | |
| `ENCRYPTION_KEY` | |
| `CONTEXT_COOKIE_SECRET` | |
| `NEXT_PUBLIC_APP_URL` | |
| `NEXT_PUBLIC_MARKETING_URL` | |
| `APP_ENV` | |
| `NEXT_PUBLIC_APP_ENV` | |
| `SENTRY_DSN` | |
| `NEXT_PUBLIC_SENTRY_DSN` | |
| `SENTRY_AUTH_TOKEN` | |
| `MAILGUN_API_KEY` | |
| `MAILGUN_DOMAIN` | |
| `MAILGUN_FROM` | |
| `COMPROBIFY_ADMIN_SECRET` | |
| `SUPPORT_EMAIL` | |
| `SUPPORT_PHONE` | |

`ADMIN_SEED_PASSWORD` is not in this list — it's only needed transiently when running `npm run db:seed` against this environment's database, not read at runtime by Next.js, so it doesn't belong as a persistent App Platform variable.

## Database setup

This app's Prisma schema does not use PostgreSQL row-level security — tenant isolation is enforced at the application layer. There are also no separate schemas; everything lives in `public`, managed through `prisma/migrations/` and applied via `prisma migrate deploy` at process startup (not build time — App Platform's build phase cannot reach the database).

Staging's database is **DigitalOcean Managed Postgres, shared with the Comprobify API** (confirmed consistently in both this repo's and the `comprobify` repo's `docs/deployment.md`) — not a Neon project. Neon is still the planned provider for a future, independent **production** database (see `comprobify/docs/deployment.md`'s "Production status" section), but that hasn't been provisioned yet and doesn't apply to staging.

`DATABASE_URL` carries a `?connection_limit=N` query param capping this app's `pg.Pool` concurrency, since it shares its backend-connection budget on the cluster with the Comprobify API's own processes. There is deliberately no `pgbouncer=true` param — this app uses `@prisma/adapter-pg` directly against `pg.Pool`, and there is no PgBouncer anywhere in this deployment for that flag to guard against.

## GitHub Actions — Workflows

| File | Trigger | Effect |
|---|---|---|
| `release-staging.yml` | Push of tag `vX.Y.Z` | Fast-forwards `staging` to the tagged commit and pushes it |
| `release-production.yml` | *(disabled)* GitHub Release published | Fast-forwards `production` to the released commit and pushes it |
| `terraform.yml` | Push to `staging` touching `terraform/**`, or manual `workflow_dispatch` | Runs `terraform plan`/`apply` (or `destroy`) against `terraform/environments/staging` |

### GitHub Actions — Secrets

**Repository secrets** (not environment-scoped)

| Secret | Value |
|---|---|
| `RELEASE_PUSH_TOKEN` | |

**`staging` GitHub Environment secrets** (consumed by `terraform.yml` as `TF_VAR_*`)

| Secret | Value |
|---|---|
| `DO_TOKEN` | |
| `CLOUDFLARE_TOKEN` | |
| `DATABASE_URL` | |
| `AUTH_SECRET` | |
| `ENCRYPTION_KEY` | |
| `CONTEXT_COOKIE_SECRET` | |
| `DATABASE_SSL_CA` | |
| `SENTRY_AUTH_TOKEN` | |
| `MAILGUN_API_KEY` | |
| `COMPROBIFY_ADMIN_SECRET` | |

## DNS (Cloudflare)

| Record | Type | Name | Target | Proxy |
|---|---|---|---|---|
| App | CNAME | `app-staging` | App Platform's `default_ingress` hostname (looked up dynamically by Terraform, not hardcoded) | Off (DNS only) |
| Marketing | CNAME | `staging` | App Platform's `default_ingress` hostname (same target as above — one app serves both hosts) | Off (DNS only) |

Keep both DNS only, not proxied — App Platform re-verifies each domain's CNAME on every deploy for cert issuance, and a Cloudflare proxy in front breaks that verification. This differs from the Comprobify API's `api-staging` record, which proxies through Cloudflare in front of the droplet.

## System dependencies

None. This is a standard Next.js/Node app with no native binary dependencies. XML/XSD validation and PDF generation are Comprobify API concerns.

## Deploying to staging

1. Merge your feature/fix branch into `main` via PR.
2. Cut a `chore/release` branch, run `npm --no-git-tag-version version <patch|minor|major>`, rename `CHANGELOG.md`'s `## [Unreleased]` to the new version with today's date (and open a fresh empty `## [Unreleased]` above it), open a PR, and merge it.
3. Pull `main`, then tag the merge commit:
   ```bash
   git checkout main && git pull origin main
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   ```
4. `release-staging.yml` fast-forwards `staging`; App Platform's Autodeploy picks up the push and builds/deploys automatically. If the same push touches `terraform/**`, `terraform.yml` also reconciles the app's Terraform-managed config.
5. Monitor the build/runtime logs in the App Platform dashboard — the `start:deploy` runtime log confirms `prisma migrate deploy` ran (migrations run at startup, not in the build log).

Current version as of this writing: **v0.9.7**.

## Post-deployment checks

- `https://staging.comprobify.com` loads the landing page.
- `https://app-staging.comprobify.com/login` loads and authenticates successfully.
- A test invoice can be created and reaches `AUTHORIZED` status.
- Sentry dashboard shows no unexpected new errors tagged `staging`.
- `APP_ENV=staging` visible in any Sentry error's tags.
- `https://staging.comprobify.com/robots.txt` returns a blanket `Disallow: /` (this environment must never be indexed — see "Search engine indexing" above).

## Troubleshooting quick-reference

| Symptom | Most likely cause |
|---|---|
| All users redirected to `/login` in a loop | `AUTH_SECRET` missing or wrong — session JWTs can't be verified. |
| Every request logs `[auth][error] UntrustedHost` | Auth.js rejects requests from hosts it doesn't recognize by default; App Platform gets no implicit trust the way Vercel did. Confirm `trustHost: true` is set on the `NextAuth()` config. |
| 500 on login / registration | `DATABASE_URL` misconfigured or migration not applied — check the runtime logs for the `start:deploy` step. |
| Onboarding fails with a generic error, nothing in Sentry | Check `ENCRYPTION_KEY` — must be exactly 64 hex chars (`openssl rand -hex 32`, not `-base64`). |
| API calls return 401 after issuer setup | Provisioned API key invalid or revoked — re-run setup. |
| Invoice status polling stuck | Proxy route can't reach Comprobify API — check `COMPROBIFY_API_URL`. |
| Build fails with `Project not found` on source-map upload | `org` in `next.config.ts` → `withSentryConfig()` is the numeric DSN ID, not the org slug (`novaej`) — fix in Settings → General Settings. |
| API calls return HTML 404 instead of JSON | `COMPROBIFY_API_URL` has a trailing slash — remove it and redeploy. |
| Every DB query fails at startup with `SELF_SIGNED_CERT_IN_CHAIN` | `DATABASE_SSL=true` is set but `DATABASE_SSL_CA` is missing/wrong for the cluster's private CA — download it from the cluster's Connection Details page in the DigitalOcean console. |
| Cert-expiry banner never appears | `notification.issuerId` compared against the wrong field — must use `Issuer.apiIssuerId`, not `Issuer.id`. |
| `/support` shows no contact details | `SUPPORT_EMAIL`/`SUPPORT_PHONE` not set in the Terraform vars / App Platform env. |
