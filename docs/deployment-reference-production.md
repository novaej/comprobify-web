# Comprobify Web Deployment Reference (Production)

Last updated: 2026-09-10

**Not yet provisioned.** This is the target-configuration reference for production — mirrors `docs/deployment-reference-staging.md`'s structure, with production's own concrete values, but nothing here has been applied yet. `docs/production-readiness-checklist.md` is the authoritative, actively-maintained tracker of exactly what's done versus still pending — don't infer status from this file, it's the configuration target, not a progress log. For the step-by-step guide on how this is set up (and *why*, in detail), see `docs/deployment.md` and `docs/terraform-digitalocean-setup.md`.

## Architecture

Identical shape to staging (see `docs/deployment-reference-staging.md`'s own Architecture section and `docs/architecture-production.drawio`), with these differences:

- **DigitalOcean Droplet** — `comprobify-web-production`, its own dedicated resource, not sharing anything with staging's droplet.
- **DigitalOcean Managed PostgreSQL** — a **dedicated production cluster**, separate from staging's shared Basic-plan cluster. Exact plan/topology (whether it's shared with the Comprobify API's own production database the way staging shares one, or fully independent) is not yet decided — see `docs/production-readiness-checklist.md`. Whatever the final shape, the same `?connection_limit=N` discipline documented in `docs/deployment.md`'s "DATABASE_URL connection budget on a shared cluster" section applies if the cluster ends up shared with anything else.
- **Comprobify API (production)** — `api.comprobify.com`, **already live** (the API repo's own production went live first; see `../comprobify/docs/production-readiness-checklist.md`). This app's production launch must coordinate `INTERNAL_SERVICE_SECRET` with the API's already-live production value — see "Coordination with the Comprobify API repo" below.
- **Cloudflare** — `comprobify.com` / `app.comprobify.com`, both proxied A records pointing at the production droplet's own reserved IP (distinct from staging's).
- **Sentry** — same project as staging (`comprobify-web`, org `novaej`), environment tagged `production` via `APP_ENV`/`NEXT_PUBLIC_APP_ENV`.
- **Search engine indexing** — unlike staging, `SEO_INDEXABLE` (`src/lib/seo.ts`) is `true` when `NEXT_PUBLIC_APP_ENV=production`, so `robots.txt`/`sitemap.xml` actually allow indexing of the marketing routes here. This is the *only* environment where that should be true — double-check `NEXT_PUBLIC_APP_ENV` is exactly `production` before the first real deploy, or the marketing site never gets indexed.

## Components and Platforms

| Component | Platform | Service / Project name |
|---|---|---|
| Web app | DigitalOcean Droplet | `comprobify-web-production` (Terraform, `terraform/environments/production`, `s-1vcpu-1gb` to start) |
| Database | DigitalOcean Managed PostgreSQL | Dedicated production cluster — TBD, see "Architecture" above |
| Error monitoring | Sentry | `comprobify-web` (org slug: `novaej`) — same project as staging, `environment: production` |
| DNS | Cloudflare | Domain: `comprobify.com` — proxied |
| Upstream API | DigitalOcean Droplet | `comprobify-production` — already live, see the `comprobify` repo's own `docs/deployment-reference-production.md` |
| Infra-as-code | Terraform | `terraform/environments/production` → `terraform/modules/droplet`; state in DigitalOcean Spaces (`comprobify-terraform-state` bucket, key `production/comprobify-web/terraform.tfstate`) |
| Container registry | GitHub Container Registry | `ghcr.io/novaej/comprobify-web` — same image repo as staging, different tag per deploy |

## DigitalOcean Droplet — `comprobify-web-production`

| Setting | Value |
|---|---|
| Deployed by | `deploy-production.yml` on push to `production` — currently disabled (`if: false`, trigger commented out) |
| Framework | Next.js 16, built into a Docker image (`Dockerfile`, repo root) — same image build as staging |
| Build command (inside the image) | `npm run build:deploy` (`prisma generate && next build`) |
| Run command (container `CMD`) | `npm run start:deploy` (`prisma migrate deploy && next start`) — migrations run here, at container startup |
| Region | `nyc1` — same datacenter as staging and the API's own production droplet |
| Droplet size | `s-1vcpu-1gb` to start (same as staging's current size — staging itself started smaller and was resized under load, see `docs/terraform-digitalocean-setup.md`) |
| Deploy user | `cpfywebdeploy4c7a` — unprivileged, docker-group only, no sudo, deliberately distinct from staging's `cpfywebdeploy9x` and from the API repo's own production deploy user |
| Firewall | 80/443 restricted to Cloudflare's live IPv4 ranges; 22 open to `0.0.0.0/0` with defense at the identity layer (key-only auth, no root, `fail2ban`) — identical model to staging |
| Health check | `GET /api/health` — same route as staging; wire up an uptime monitor against it (see `docs/deployment.md`'s "Health check route" section for why never `/`) |

### Environment variables

Everything will live in the `production` GitHub Environment, as either a Secret or a Variable, and `deploy-production.yml` writes all of it into `/opt/comprobify-web/.env` on the droplet on every deploy — same mechanism as staging, nothing set by hand in a console. **Every value below marked with a value is a placeholder for what it will be, not what's currently configured** — the `production` GitHub Environment doesn't exist yet. See `docs/deployment.md`'s "Environment variables" section for what each one does.

| Variable | Kind | Value |
|---|---|---|
| `DATABASE_URL` | Secret | Points at the dedicated production cluster — **never staging's** |
| `DATABASE_SSL` | Variable | `true` |
| `DATABASE_SSL_CA` | Secret | |
| `COMPROBIFY_API_URL` | Variable | `https://api.comprobify.com` |
| `AUTH_SECRET` | Secret | **Freshly generated** — never reuse staging's value (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Secret | **Freshly generated** — never reuse staging's value (`openssl rand -hex 32`) |
| `CONTEXT_COOKIE_SECRET` | Secret | **Freshly generated** — never reuse staging's value (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | Variable | `https://app.comprobify.com` |
| `NEXT_PUBLIC_MARKETING_URL` | Variable | `https://comprobify.com` |
| `PUBLIC_DOMAIN_PRIMARY` | Variable | `comprobify.com` — bare hostname, consumed only by `caddy`'s Caddyfile |
| `PUBLIC_DOMAIN_ALIAS` | Variable | `app.comprobify.com` — bare hostname, consumed only by `caddy`'s Caddyfile |
| `APP_ENV` | Variable | `production` |
| `NEXT_PUBLIC_APP_ENV` | Variable | `production` — drives `SEO_INDEXABLE`, see "Architecture" above |
| `SENTRY_DSN` | Variable | Same DSN value as staging's (`https://dda17234977e8471d407795aaa6672e1@o4511524451385344.ingest.us.sentry.io/4511524532256768`) — one Sentry project, `APP_ENV` distinguishes environments |
| `NEXT_PUBLIC_SENTRY_DSN` | Variable | Same value as `SENTRY_DSN` |
| `SENTRY_AUTH_TOKEN` | Secret | Build-time only — can reuse staging's token (it authenticates to the Sentry org/project, not per-environment) |
| `MAILGUN_API_KEY` | Secret | Can reuse staging's key if sending from the same Mailgun account/domain — confirm before first deploy |
| `MAILGUN_DOMAIN` | Variable | `mg.comprobify.com` |
| `MAILGUN_FROM` | Variable | `Comprobify <no-reply@mg.comprobify.com>` |
| `COMPROBIFY_ADMIN_SECRET` | Secret | Must match the Comprobify API's own production `ADMIN_SECRET` exactly |
| `INTERNAL_SERVICE_SECRET` | Secret | **Must match the Comprobify API's own production `INTERNAL_SERVICE_SECRET` exactly** — see "Coordination with the Comprobify API repo" below. Unlike staging (where this can stay unset with no behavior change), the API's production deployment already requires this for `POST /v1/register`/`/recover`/`/resend-verification`/`/verify-email` to work at all (ADR-035) |
| `SUPPORT_EMAIL` | Variable | `support@comprobify.com` |
| `SUPPORT_PHONE` | Variable | `+593 963839195` — confirm this is still the right production support number before launch |

Plus two infra-only Secrets with no runtime `.env` entry — `DROPLET_IP` (the Terraform `reserved_ip` output) and `INFRA_SSH_PRIVATE_KEY` (the private half of the **dedicated production** SSH key — never staging's `comprobify_web_deploy_staging`).

## Coordination with the Comprobify API repo

**`INTERNAL_SERVICE_SECRET` cannot be generated unilaterally on this side alone.** The Comprobify API's production deployment is already live and already requires this secret at startup (comprobify's ADR-035) — the API won't boot without it set to *something*, but a value that doesn't match this app's production config boots fine and silently `403`s every `POST /v1/register`/`/recover`/`/resend-verification` call with `INTERNAL_SERVICE_ONLY`. Both deployments must agree on the exact same value before this app's production goes live. See `../comprobify/docs/production-readiness-checklist.md`'s own note on this.

**Onboarding the first real production tenant happens through this app, not the API directly.** Direct `POST /v1/register` against the production API is no longer possible (ADR-035, registration is web-app-only) — so the API repo's own "onboard the first real tenant" checklist item is *also* gated on this app's production deployment being live with a matching `INTERNAL_SERVICE_SECRET`.

**Card payments (Payphone, ADR-028)** need no additional configuration on this app's side — `PAYPHONE_TOKEN`/`PAYPHONE_STORE_ID` and the registered Web Domain/Response URL live entirely on the Comprobify API side, one application per environment. The production Payphone application must be registered against **this app's actual production domain** (`app.comprobify.com`, specifically `https://app.comprobify.com/es/payphone/return` — see CLAUDE.md's "Registering the return URL is per Payphone *application*") once this app's production domain is live — tracked in the API repo's own checklist, not duplicated here.

## Database setup

Same tenant-isolation model as staging (application-layer, no PostgreSQL RLS, no separate schemas — see `docs/deployment-reference-staging.md`'s "Database setup" section). Migrations apply the same way, via `prisma migrate deploy` at container startup.

**Not yet decided:** whether production's database is its own dedicated DigitalOcean Managed Postgres cluster, shares a cluster with the Comprobify API's own production database, or uses a different provider entirely. Whichever it is, the droplet's reserved IP must be added to that cluster's Trusted Sources before any query will succeed — same manual step staging requires.

## GitHub Actions — Workflows

| File | Trigger | Effect |
|---|---|---|
| `release-production.yml` | *(disabled)* GitHub Release published | Fast-forwards `production` to the released commit and pushes it |
| `deploy-production.yml` | *(disabled)* Push to `production`, or manual `workflow_dispatch` | Builds a Docker image, pushes it to `ghcr.io/novaej/comprobify-web`, SCPs `deploy/docker-compose.yml`/`deploy/caddy/Caddyfile` to the droplet, writes `.env` over SSH, restarts the containers |
| `terraform.yml` (`plan-production`/`apply-production` jobs) | Push to `main` touching `terraform/**`, or manual `workflow_dispatch` | Runs `terraform plan`/`apply` (or `destroy`) against `terraform/environments/production` — droplet/firewall/DNS only, no app secrets |

### GitHub Actions — Secrets

**Repository secrets** — shared with staging, nothing new needed (`RELEASE_PUSH_TOKEN`, `TERRAFORM_SPACES_ACCESS_KEY_ID`/`TERRAFORM_SPACES_SECRET_ACCESS_KEY`).

**`production-infra` GitHub Environment secrets** (consumed only by `terraform.yml`'s `plan-production`/`apply-production` jobs) — **does not exist yet**

| Secret | Value |
|---|---|
| `DO_TOKEN` | Dedicated production token — never reuse staging's |
| `CLOUDFLARE_TOKEN` | Dedicated production token — never reuse staging's |

**`production` GitHub Environment secrets** (consumed only by `deploy-production.yml`) — **does not exist yet**

| Secret | Value |
|---|---|
| `DROPLET_IP` | Terraform's `reserved_ip` output, once applied |
| `INFRA_SSH_PRIVATE_KEY` | Private half of `comprobify_web_deploy_production` — a **dedicated** key pair, generated fresh |
| `DATABASE_URL` | |
| `AUTH_SECRET` | |
| `ENCRYPTION_KEY` | |
| `CONTEXT_COOKIE_SECRET` | |
| `DATABASE_SSL_CA` | |
| `SENTRY_AUTH_TOKEN` | |
| `MAILGUN_API_KEY` | |
| `COMPROBIFY_ADMIN_SECRET` | |
| `INTERNAL_SERVICE_SECRET` | Must match the Comprobify API's own production value — see "Coordination with the Comprobify API repo" above |

**`production` GitHub Environment variables**

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `NEXT_PUBLIC_APP_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | `https://app.comprobify.com` |
| `NEXT_PUBLIC_MARKETING_URL` | `https://comprobify.com` |
| `PUBLIC_DOMAIN_PRIMARY` | `comprobify.com` |
| `PUBLIC_DOMAIN_ALIAS` | `app.comprobify.com` |
| `COMPROBIFY_API_URL` | `https://api.comprobify.com` |
| `DATABASE_SSL` | `true` |
| `MAILGUN_DOMAIN` | `mg.comprobify.com` |
| `MAILGUN_FROM` | `Comprobify <no-reply@mg.comprobify.com>` |
| `SUPPORT_EMAIL` | `support@comprobify.com` |
| `SUPPORT_PHONE` | `+593 963839195` |
| `SENTRY_DSN` | same value as staging's |
| `NEXT_PUBLIC_SENTRY_DSN` | same value as `SENTRY_DSN` |

## DNS (Cloudflare)

| Record | Type | Name | Target | Proxy |
|---|---|---|---|---|
| App | A | `app` | Production droplet's reserved IP (Terraform output, not hardcoded) | **On (proxied)** |
| Marketing | A | `@` (bare `comprobify.com`) | Production droplet's reserved IP (same target — one droplet/container serves both hosts) | **On (proxied)** |

Both proxied through Cloudflare, matching the Comprobify API's own `api.comprobify.com` record.

## System dependencies

Same as staging — nothing beyond Docker/Docker Compose (installed by cloud-init) and Caddy.

## Deploying to production

Not yet possible — see `docs/production-readiness-checklist.md` for the full punch list. Once enabled, the flow is: promote a tag already validated in staging by publishing a GitHub Release from it (see `docs/deployment.md`'s "Promote to production" section) — `release-production.yml` fast-forwards `production`, `deploy-production.yml` picks up the push and ships it.

## Post-deployment checks

Same checks as staging (see `docs/deployment-reference-staging.md`'s own list), plus:

- `https://comprobify.com/robots.txt` **allows** indexing (the opposite of staging's blanket disallow) — confirms `NEXT_PUBLIC_APP_ENV=production` actually took effect.
- A real invoice created through this app reaches `AUTHORIZED` against SRI's actual **production** SOAP endpoint (`ambiente = 2`), not the test endpoint — confirms `COMPROBIFY_API_URL` points at the production API, not staging.
- `POST /v1/register` (via this app's own registration form) succeeds — confirms `INTERNAL_SERVICE_SECRET` matches the API's production value; a silent `INTERNAL_SERVICE_ONLY` 403 here means the secrets are out of sync.

## Troubleshooting quick-reference

Same table as `docs/deployment-reference-staging.md`'s own "Troubleshooting quick-reference" section — every entry there applies here unchanged, with the production domain/branch substituted for staging's.
