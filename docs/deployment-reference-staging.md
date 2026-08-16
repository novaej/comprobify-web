# Comprobify Web Deployment Reference (Staging)

Last updated: 2026-08-16

This reference describes the staging deployment setup for `comprobify-web`, including infrastructure, required configuration, deployment steps, and post-deployment checks. For the step-by-step guide on how this is set up (and *why*, in detail), see `docs/deployment.md` and `docs/terraform-digitalocean-setup.md` — this file is the quick-reference sheet of concrete project names and values for the environment that's actually running.

## Architecture

- **GitHub Actions** manages two independent pipelines: the release pipeline (`release-staging.yml`, fast-forwarding the `staging` branch on a tag push) and the app deploy pipeline (`deploy-staging.yml`, triggered by that push — builds a Docker image, pushes it to GHCR, and SSHes into the droplet to restart the containers).
- **DigitalOcean Droplet** hosts the Next.js 16 app (`comprobify-web-staging` droplet, `s-1vcpu-1gb`) behind a Caddy reverse proxy. The build command is `npm run build:deploy` (`prisma generate && next build`, run inside `Dockerfile`'s build stage); the run command is `npm run start:deploy` (`prisma migrate deploy && next start`) — migrations run at container startup, not at image-build time (the GitHub Actions runner building the image has no network route to the database).
- **Terraform** provisions the droplet itself (`terraform/environments/staging` → `terraform/modules/droplet`) — the droplet, its reserved IP, its Cloudflare-only firewall, its DigitalOcean Project assignment, and its two Cloudflare DNS records. Terraform does **not** set any app secret/env var — those are written directly to the droplet's `.env` file by `deploy-staging.yml` over SSH. `terraform.yml` runs on push to `main` (path-filtered to `terraform/**`), applying against a DigitalOcean Spaces state backend (`comprobify-terraform-state` bucket, key `staging/comprobify-web/terraform.tfstate`).
- **DigitalOcean Managed PostgreSQL** provides this app's own tables (`users`, `tenants`, `tenant_api_keys`, `issuers`, `notifications`, `notification_reads`, `webhook_endpoints`, `clients`, `products`, `document_templates`, `user_issuer_access`, etc. — see `prisma/schema.prisma`). Staging runs on a **Basic-plan cluster shared with the Comprobify API's own database** — not a dedicated instance, and not fronted by any connection pooler (no PgBouncer). Each consumer (this app, the API process, the API worker) caps its own `pg.Pool` concurrency via `?connection_limit=N` on `DATABASE_URL` to stay within its share of the cluster's ~22 backend connections. The droplet's reserved IP must be added to the cluster's **Trusted Sources** manually (DO dashboard) — not Terraform-managed for either repo.
- **Comprobify API (staging)** is the upstream REST API this app calls server-side only — never from the browser. It runs on its own **DigitalOcean droplet** (project `comprobify-staging`, provisioned by its own Terraform config) — this app's droplet is a separate resource in the same shared `Comprobify Staging` DO Project, purely for dashboard grouping. API keys are stored encrypted at rest (`ENCRYPTION_KEY`, AES-256-GCM) and decrypted per-request via `requireContext()`.
- **Sentry** provides error monitoring with the environment tagged `staging`.
- **Cloudflare** provides both DNS and proxying for `staging.comprobify.com` / `app-staging.comprobify.com` — both **A** records, pointing at the droplet's reserved IP, `proxied = true`, created by Terraform, giving both domains Cloudflare's WAF/DDoS/bot layer.
- **Search engine indexing** — `robots.txt`/`sitemap.xml` (`src/app/robots.ts`/`sitemap.ts`) deliberately disallow everything on this environment: `SEO_INDEXABLE` (`src/lib/seo.ts`) is only true when `NEXT_PUBLIC_APP_ENV=production`, so the real, publicly-reachable staging domain never gets indexed by Google. This is intentional, not a gap to fix.

## Components and Platforms

| Component | Platform | Service / Project name |
|---|---|---|
| Web app | DigitalOcean Droplet | `comprobify-web-staging` (provisioned via Terraform, `s-1vcpu-1gb`) |
| Database | DigitalOcean Managed PostgreSQL | Shared Basic-plan cluster, also used by the Comprobify API — connection string supplied as `DATABASE_URL` via a GitHub Environment secret, written to the droplet's `.env` on every deploy |
| Error monitoring | Sentry | `comprobify-web` (org slug: `novaej`) |
| DNS | Cloudflare | Domain: `comprobify.com` — proxied |
| Upstream API | DigitalOcean Droplet | `comprobify-staging` — see the `comprobify` repo's own `docs/deployment.md` / `docs/terraform-digitalocean-setup.md` |
| Infra-as-code | Terraform | `terraform/environments/staging` → `terraform/modules/droplet`; state in DigitalOcean Spaces (`comprobify-terraform-state` bucket) |
| Container registry | GitHub Container Registry | `ghcr.io/novaej/comprobify-web` |

## DigitalOcean Droplet — `comprobify-web-staging`

Use this section as the baseline configuration for the staging web app. It is fully Terraform-managed for its infra (droplet/firewall/DNS) — treat the DO console as read-only for those. App secrets/config are managed via the `staging` GitHub Environment, not the console either.

| Setting | Value |
|---|---|
| Deployed by | `deploy-staging.yml` on push to `staging`, or manual `workflow_dispatch` |
| Framework | Next.js 16, built into a Docker image (`Dockerfile`, repo root) — no buildpack |
| Build command (inside the image) | `npm run build:deploy` (`prisma generate && next build`) |
| Run command (container `CMD`) | `npm run start:deploy` (`prisma migrate deploy && next start`) — migrations run here, at container startup |
| Migrations | Run automatically on every container start via `start:deploy`, before `next start` — not during image build (the GitHub Actions runner building the image has no DB network access) |
| Region | `nyc1` — same datacenter as the shared database and the API's own droplet |
| Droplet size | `s-1vcpu-1gb` (~$6/mo) — resized from the $4/mo tier after SSH connection resets under load |
| Deploy user | `cpfywebdeploy9x` — unprivileged, docker-group only, no sudo |
| Firewall | 80/443 restricted to Cloudflare's live IPv4 ranges; 22 open to `0.0.0.0/0` with defense at the identity layer (key-only auth, no root, `fail2ban`) |
| Health check | `GET /api/health` exists (`src/app/api/health/route.ts`) but isn't wired to any platform-level probe — Caddy/Docker Compose have no application health check today; `restart: unless-stopped` is the container-recovery mechanism |

### Environment variables

Everything lives in the `staging` GitHub Environment, as either a Secret or a Variable, and `deploy-staging.yml` writes all of it into `/opt/comprobify-web/.env` on the droplet on every deploy. Nothing here is set by hand in a console. See `docs/deployment.md`'s "Environment variables" section for what each one does.

| Variable | Kind | Value |
|---|---|---|
| `DATABASE_URL` | Secret | |
| `DATABASE_SSL` | Variable | `true` |
| `DATABASE_SSL_CA` | Secret | |
| `COMPROBIFY_API_URL` | Variable | `https://api-staging.comprobify.com` |
| `AUTH_SECRET` | Secret | |
| `ENCRYPTION_KEY` | Secret | |
| `CONTEXT_COOKIE_SECRET` | Secret | |
| `NEXT_PUBLIC_APP_URL` | Variable | `https://app-staging.comprobify.com` |
| `NEXT_PUBLIC_MARKETING_URL` | Variable | `https://staging.comprobify.com` |
| `APP_ENV` | Variable | `staging` |
| `NEXT_PUBLIC_APP_ENV` | Variable | `staging` |
| `SENTRY_DSN` | Variable | `https://dda17234977e8471d407795aaa6672e1@o4511524451385344.ingest.us.sentry.io/4511524532256768` |
| `NEXT_PUBLIC_SENTRY_DSN` | Variable | same value as `SENTRY_DSN` |
| `SENTRY_AUTH_TOKEN` | Secret | build-time only — passed as a Docker `--build-arg`, never written to the runtime `.env` |
| `MAILGUN_API_KEY` | Secret | |
| `MAILGUN_DOMAIN` | Variable | `mg.comprobify.com` |
| `MAILGUN_FROM` | Variable | `Comprobify <no-reply@mg.comprobify.com>` |
| `COMPROBIFY_ADMIN_SECRET` | Secret | |
| `INTERNAL_SERVICE_SECRET` | Secret | |
| `SUPPORT_EMAIL` | Variable | `support@comprobify.com` |
| `SUPPORT_PHONE` | Variable | `+593 963839195` |

Plus two infra-only Secrets that have no runtime `.env` entry at all — `DROPLET_IP` (the Terraform `reserved_ip` output) and `INFRA_SSH_PRIVATE_KEY` (the private half of the droplet's dedicated SSH key) — used only by `deploy-staging.yml`'s SCP/SSH steps to reach the droplet in the first place. `ADMIN_SEED_PASSWORD` is not in this list at all — it's only needed transiently when running `npm run db:seed` against this environment's database, not read at runtime by Next.js.

## Database setup

This app's Prisma schema does not use PostgreSQL row-level security — tenant isolation is enforced at the application layer. There are also no separate schemas; everything lives in `public`, managed through `prisma/migrations/` and applied via `prisma migrate deploy` at container startup (not image-build time — the GitHub Actions runner has no route to the database).

Staging's database is **DigitalOcean Managed Postgres, shared with the Comprobify API** (confirmed consistently in both this repo's and the `comprobify` repo's `docs/deployment.md`) — not a Neon project. Neon is still the planned provider for a future, independent **production** database (see `comprobify/docs/deployment.md`'s "Production status" section), but that hasn't been provisioned yet and doesn't apply to staging.

`DATABASE_URL` carries a `?connection_limit=N` query param capping this app's `pg.Pool` concurrency, since it shares its backend-connection budget on the cluster with the Comprobify API's own processes. There is deliberately no `pgbouncer=true` param — this app uses `@prisma/adapter-pg` directly against `pg.Pool`, and there is no PgBouncer anywhere in this deployment for that flag to guard against.

**The droplet's reserved IP must be added to the cluster's Trusted Sources** (DO dashboard → database → Settings → Trusted Sources) before any query will succeed — this is a manual step for both this repo and the API repo, not Terraform-managed by either.

## GitHub Actions — Workflows

| File | Trigger | Effect |
|---|---|---|
| `release-staging.yml` | Push of tag `vX.Y.Z` | Fast-forwards `staging` to the tagged commit and pushes it |
| `release-production.yml` | *(disabled)* GitHub Release published | Fast-forwards `production` to the released commit and pushes it |
| `deploy-staging.yml` | Push to `staging`, or manual `workflow_dispatch` | Builds a Docker image, pushes it to `ghcr.io/novaej/comprobify-web`, SCPs `deploy/docker-compose.yml`/`deploy/caddy/Caddyfile` to the droplet, writes `.env` over SSH, restarts the containers |
| `terraform.yml` | Push to `main` touching `terraform/**`, or manual `workflow_dispatch` | Runs `terraform plan`/`apply` (or `destroy`) against `terraform/environments/staging` — droplet/firewall/DNS only, no app secrets |

### GitHub Actions — Secrets

**Repository secrets** (not environment-scoped)

| Secret | Value |
|---|---|
| `RELEASE_PUSH_TOKEN` | |
| `TERRAFORM_SPACES_ACCESS_KEY_ID` / `TERRAFORM_SPACES_SECRET_ACCESS_KEY` | |

**`staging-infra` GitHub Environment secrets** (consumed only by `terraform.yml`)

| Secret | Value |
|---|---|
| `DO_TOKEN` | |
| `CLOUDFLARE_TOKEN` | |

**`staging` GitHub Environment secrets** (consumed only by `deploy-staging.yml`)

| Secret | Value |
|---|---|
| `DROPLET_IP` | Terraform's `reserved_ip` output |
| `INFRA_SSH_PRIVATE_KEY` | Private half of `comprobify_web_deploy_staging` |
| `DATABASE_URL` | |
| `AUTH_SECRET` | |
| `ENCRYPTION_KEY` | |
| `CONTEXT_COOKIE_SECRET` | |
| `DATABASE_SSL_CA` | |
| `SENTRY_AUTH_TOKEN` | |
| `MAILGUN_API_KEY` | |
| `COMPROBIFY_ADMIN_SECRET` | |
| `INTERNAL_SERVICE_SECRET` | |

**`staging` GitHub Environment variables**

| Variable | Value |
|---|---|
| `APP_ENV` | `staging` |
| `NEXT_PUBLIC_APP_ENV` | `staging` |
| `NEXT_PUBLIC_APP_URL` | `https://app-staging.comprobify.com` |
| `NEXT_PUBLIC_MARKETING_URL` | `https://staging.comprobify.com` |
| `COMPROBIFY_API_URL` | `https://api-staging.comprobify.com` |
| `DATABASE_SSL` | `true` |
| `MAILGUN_DOMAIN` | `mg.comprobify.com` |
| `MAILGUN_FROM` | `Comprobify <no-reply@mg.comprobify.com>` |
| `SUPPORT_EMAIL` | `support@comprobify.com` |
| `SUPPORT_PHONE` | `+593 963839195` |
| `SENTRY_DSN` | `https://dda17234977e8471d407795aaa6672e1@o4511524451385344.ingest.us.sentry.io/4511524532256768` |
| `NEXT_PUBLIC_SENTRY_DSN` | same value as `SENTRY_DSN` |

## DNS (Cloudflare)

| Record | Type | Name | Target | Proxy |
|---|---|---|---|---|
| App | A | `app-staging` | Droplet's reserved IP (Terraform output, not hardcoded) | **On (proxied)** |
| Marketing | A | `staging` | Droplet's reserved IP (same target — one droplet/container serves both hosts) | **On (proxied)** |

Both proxied through Cloudflare, matching the Comprobify API's `api-staging` record.

## System dependencies

None beyond Docker/Docker Compose on the droplet (installed by cloud-init) and Caddy (runs as its own container). This is a standard Next.js/Node app with no native binary dependencies in the image itself — XML/XSD validation and PDF generation are Comprobify API concerns.

## Deploying to staging

1. Merge your feature/fix branch into `main` via PR.
2. Cut a `chore/release` branch, run `npm --no-git-tag-version version <patch|minor|major>`, rename `CHANGELOG.md`'s `## [Unreleased]` to the new version with today's date (and open a fresh empty `## [Unreleased]` above it), open a PR, and merge it.
3. Pull `main`, then tag the merge commit:
   ```bash
   git checkout main && git pull origin main
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   ```
4. `release-staging.yml` fast-forwards `staging`; `deploy-staging.yml` picks up the push, builds a Docker image, pushes it to GHCR, and restarts the containers on the droplet. Any merged `terraform/**` change is applied separately by `terraform.yml` on its own `main`-push trigger, independent of the release cadence.
5. Monitor the run in the GitHub Actions tab (build/push/SCP/SSH steps); once it finishes, `docker compose logs -f web` on the droplet confirms `prisma migrate deploy` ran (migrations run at container startup, not in the CI build log).

Current version as of this writing: **v0.9.13**.

## Post-deployment checks

- `https://staging.comprobify.com` loads the landing page.
- `https://app-staging.comprobify.com/login` loads and authenticates successfully.
- A test invoice can be created and reaches `AUTHORIZED` status.
- Sentry dashboard shows no unexpected new errors tagged `staging`.
- `APP_ENV=staging` visible in any Sentry error's tags.
- `https://staging.comprobify.com/robots.txt` returns a blanket `Disallow: /` (this environment must never be indexed — see "Search engine indexing" above).
- `dig staging.comprobify.com` / `dig app-staging.comprobify.com` resolve to Cloudflare's proxy IPs, not the droplet's own reserved IP directly — confirms proxying is actually on.

## Troubleshooting quick-reference

| Symptom | Most likely cause |
|---|---|
| All users redirected to `/login` in a loop | `AUTH_SECRET` missing or wrong — session JWTs can't be verified. |
| Every request logs `[auth][error] UntrustedHost` | Auth.js rejects requests from hosts it doesn't recognize by default. Confirm `trustHost: true` is set on the `NextAuth()` config. |
| 500 on login / registration | `DATABASE_URL` misconfigured, migration not applied, or the droplet's reserved IP isn't in the database's Trusted Sources yet — check `docker compose logs web` for the `start:deploy` step. |
| Onboarding fails with a generic error, nothing in Sentry | Check `ENCRYPTION_KEY` — must be exactly 64 hex chars (`openssl rand -hex 32`, not `-base64`). |
| API calls return 401 after issuer setup | Provisioned API key invalid or revoked — re-run setup. |
| Invoice status polling stuck | Proxy route can't reach Comprobify API — check `COMPROBIFY_API_URL`. |
| Build fails with `Project not found` on source-map upload | `org` in `next.config.ts` → `withSentryConfig()` is the numeric DSN ID, not the org slug (`novaej`) — fix in Settings → General Settings. |
| API calls return HTML 404 instead of JSON | `COMPROBIFY_API_URL` has a trailing slash — remove it and redeploy. |
| Every DB query fails at startup with `SELF_SIGNED_CERT_IN_CHAIN` | `DATABASE_SSL=true` is set but `DATABASE_SSL_CA` is missing/wrong for the cluster's private CA — download it from the cluster's Connection Details page in the DigitalOcean console. |
| Cert-expiry banner never appears | `notification.issuerId` compared against the wrong field — must use `Issuer.apiIssuerId`, not `Issuer.id`. |
| `/support` shows no contact details | `SUPPORT_EMAIL`/`SUPPORT_PHONE` GitHub Variable not set. |
| `deploy-staging.yml`'s SSH/SCP step fails to connect | Confirm `DROPLET_IP` is the **reserved** IP (`terraform output reserved_ip`), not the droplet's ephemeral own address, and that `INFRA_SSH_PRIVATE_KEY` matches the public key actually in `terraform.tfvars`. |
| Domain loads over plain HTTP or shows a cert warning | Caddy hasn't finished its automatic Let's Encrypt issuance yet (first request after DNS propagates), or the ACME HTTP-01 challenge on port 80 is being blocked — confirm the firewall's Cloudflare IP ranges are current (`terraform plan` re-fetches them live on every run). |
| `docker compose up -d` doesn't pick up a Caddyfile-only change | `docker compose up -d` only recreates a container when the *service definition* changes — a bind-mounted file edit needs an explicit `docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`, which `deploy-staging.yml`'s last step already runs on every deploy. |
| `terraform init` fails with `Failed to query available provider packages` for `hashicorp/digitalocean`/`hashicorp/cloudflare` | `terraform/modules/droplet` is missing its own `required_providers` block with explicit `source` — a child module without one falls back to the legacy `hashicorp/<name>` registry namespace instead of inheriting the root's `digitalocean/digitalocean`/`cloudflare/cloudflare` sources. |
