# Deployment

---

## Branching strategy

Two long-lived branches map to deployed environments. They are **automation-owned** — promoted forward by tags and GitHub Releases, never by direct or manual pushes. Feature/fix branches are always cut from `main` and merged back via pull request. This mirrors the release model used by the Comprobify API (`../comprobify/docs/deployment.md`) directly — both repos now run on a DigitalOcean droplet with the same SSH-based `deploy-staging.yml`/`deploy-production.yml` CD pattern (see `docs/terraform-digitalocean-setup.md`). This app ran on DigitalOcean App Platform until that migration; App Platform's own cert-verification requirements meant its Cloudflare DNS records could never be proxied, so this app got none of Cloudflare's WAF/DDoS/bot protection — the droplet closes that gap.

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

Every push to `staging` or `production` (i.e. every fast-forward the release workflows perform) triggers `deploy-staging.yml` / `deploy-production.yml` (see the CI/CD pipeline section below), which builds a Docker image, pushes it to GHCR, and SSHes into the corresponding droplet to pull and restart the containers.

| Branch | Environment | Promoted by |
|--------|-------------|-------------|
| `main` | — (trunk; CI only, no deploy) | PR merge |
| `staging` | Staging (DigitalOcean droplet) | `release-staging.yml` — fast-forwarded on tag push `vX.Y.Z` |
| `production` | Production (DigitalOcean droplet) — *scaffolding written, not yet applied; pipeline disabled* | `release-production.yml` — fast-forwarded when a GitHub Release is published |

**Rules:**
- All development happens in feature/fix branches off `main`, merged via PR (1 approval required)
- `staging` and `production` are **automation-owned** — never push to them directly; they only move forward via fast-forward merges performed by the release workflows. Branch protection restricts direct pushes
- A **tag** (`vX.Y.Z`, semantic versioning) means *"build this, validate it in staging."* Pushing it triggers `release-staging.yml`, which fast-forwards `staging`; the push then triggers `deploy-staging.yml`, which builds/ships the image to the droplet
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

`release-staging.yml` fast-forwards `staging` to `vX.Y.Z` and pushes it; `deploy-staging.yml` picks up the push, builds a Docker image, and ships it to the droplet. Use semantic versioning (`vMAJOR.MINOR.PATCH`) so it's obvious at a glance whether a tag is a feature release (`v1.5.0`) or a hotfix (`v1.4.1`).

The tag still tracks `package.json`'s version — there's just a merge step between bumping it and tagging it, because the squash-merge changes the commit SHA. **Never push a follow-up commit to `main` that changes the version after a tag is created** — that would leave the tagged commit's `package.json` permanently out of sync with its own tag name, and would race with `staging` already having been fast-forwarded to it. If `package.json`'s version and the latest git tag ever drift apart, fix it with a manual one-off sync commit (`chore:`), then resume this sequence for every release after that.

### Promote to production

Once the tag has been validated in staging, promotion is a single deliberate action — **publishing a GitHub Release from that tag**:

1. GitHub UI → **Releases → Draft a new release**
2. Choose the existing tag (e.g. `v1.4.0`) — do not create a new one
3. Paste in that version's section from `CHANGELOG.md` as the release notes (it was already written when the version was bumped — see "Release to staging" above) — no need to regenerate from commits
4. Click **Publish release**

`release-production.yml` then fast-forwards `production` to that commit; `deploy-production.yml` builds and ships it to the production droplet.

> **Currently disabled** — the production droplet, `production` branch, and secrets don't exist yet, even though `deploy-production.yml` and `terraform/environments/production` are now written. See "Production status" below for what's needed to enable this.

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

**Staging:** fully Terraform-managed (see "Terraform-managed infrastructure" below) — `terraform/modules/droplet/main.tf` creates two Cloudflare **A** records, `staging.comprobify.com` and `app-staging.comprobify.com`, both pointing at the droplet's reserved IP and both **proxied through Cloudflare** (`proxied = true`) — unlike the old App Platform setup, a droplet has no cert-verification conflict with Cloudflare's proxy, so these domains get the full WAF/DDoS/bot layer, matching the Comprobify API's own `api-staging.comprobify.com`. Nothing to do by hand. No extra env vars are required either way — the proxy reads the `host` header at runtime.

**Production custom domain setup** *(no `terraform/environments/production` exists yet; once it is provisioned, this is fully Terraform-managed the same way staging is — see `docs/terraform-digitalocean-setup.md`)*: provisioning `environments/production` with the same `droplet` module (own droplet, own reserved IP, own `domain_primary`/`domain_alias` = `comprobify.com`/`app.comprobify.com`) creates both proxied A records automatically — no manual DNS console step, unlike the App Platform era's domain-verification dance.

---

## CI/CD pipeline

### Workflow files

| File | Trigger | Effect |
|------|---------|--------|
| `.github/workflows/release-staging.yml` | Push of tag `vX.Y.Z` | Fast-forwards `staging` to the tagged commit and pushes it |
| `.github/workflows/release-production.yml` | *(disabled)* GitHub Release published | Fast-forwards `production` to the released commit and pushes it |
| `.github/workflows/deploy-staging.yml` | Push to `staging`, or manual `workflow_dispatch` | Builds a Docker image, pushes it to GHCR, and SSHes into the staging droplet to write `.env` and restart the containers — see `docs/terraform-digitalocean-setup.md` |
| `.github/workflows/deploy-production.yml` | *(disabled)* Push to `production`, or manual `workflow_dispatch` | Same shape as `deploy-staging.yml`, written but gated behind an `if: false` guard until `environments/production` is actually applied and its GitHub Environment is populated |
| `.github/workflows/terraform.yml` | Push to `main` touching `terraform/**`, or manual `workflow_dispatch` | Runs `terraform plan`/`apply` (or `destroy`) against `terraform/environments/staging` (`plan-staging`/`apply-staging` jobs) and `terraform/environments/production` (`plan-production`/`apply-production` jobs) — see "Terraform-managed infrastructure" below |
| `.github/workflows/ci.yml` | Pull request or push to `main` | Runs `npm run type-check` and `npm audit --omit=dev --audit-level=high` (informational only for now — see `docs/production-readiness-checklist.md`'s "Security & CI hardening" section). Not yet added as a required status check on `main`'s branch protection rule |

This app now runs on a DigitalOcean droplet, same as the API — App Platform's own Autodeploy-on-push (which used to make this table one row shorter) doesn't apply anymore. Every push to `staging`/`production` needs its own `deploy-*.yml` to actually build and ship the code, same pattern the API repo has always used.

| Branch | Droplet | URL |
|--------|---------|-----|
| `staging` | `comprobify-web-staging` | `staging.comprobify.com` + `app-staging.comprobify.com` |
| `production` | `comprobify-web-production` — *defined in Terraform, never applied* | `comprobify.com` + `app.comprobify.com` |

### Build settings (both environments)

| Setting | Value |
|---------|-------|
| Source directory | `/` (this is a standalone repo, not a monorepo — nothing to scope) |
| Build | `Dockerfile` (repo root) — `.github/workflows/deploy-*.yml` runs `docker build`/`docker push` directly; there is no buildpack involved anymore |
| Build command (inside the image) | `npm run build:deploy` — runs as the `builder` stage's `RUN` in `Dockerfile`. Must stay `build:deploy`, not plain `build` — the latter (`next build` only) silently skips `prisma generate`, and the Prisma Client wouldn't exist yet |
| Run command (container `CMD`) | `npm run start:deploy` — same reasoning as under App Platform: migrations run here, at process startup, not in the build command (see below) |

`build:deploy` runs `prisma generate && next build` — `prisma generate` only reads the schema file and writes generated client code, no database connection needed, so it's safe and necessary at build time. `start:deploy` runs `prisma migrate deploy && next start` — **migrations run at process startup, not at build time**. This was originally confirmed necessary under App Platform (whose build phase had no network path to the database at all, regardless of Trusted Sources/`vpc.id` configuration), and the same constraint still applies for a different reason now: the Docker image is built on a GitHub Actions runner, which is neither on the droplet's DO VPC nor in the database's Trusted Sources list — so the build step genuinely cannot reach the database either way, whatever the underlying platform. This mirrors the comprobify API repo's own pattern (`app.js` calls `migrate()` before accepting requests, for the same underlying reason — its image is also built off-droplet). `prisma migrate deploy` only runs migrations not yet recorded in `_prisma_migrations`, so already-applied ones are skipped automatically — safe to run on every startup, including container restarts with no schema changes.

**`prisma migrate deploy` does not go through this app's `@prisma/adapter-pg` setup.** It spawns a separate native `schema-engine` binary that connects to `DATABASE_URL` with its own independent Postgres connector — none of `src/lib/db.ts`'s pool/SSL wiring applies to it. Watch the runtime logs on first deploy for this step specifically; if it fails with a certificate error while other runtime queries work fine, the fix has to target the schema-engine binary itself, not `DATABASE_SSL`/`DATABASE_SSL_CA`.

### Pipeline stages (staging)

1. **PR merged to `main`, touching `terraform/**`** — `terraform.yml` runs `plan`→`apply` against `terraform/environments/staging` independently of any release, reconciling the droplet/firewall/DNS config the moment the change lands
2. **Tag pushed** (`vX.Y.Z`) — `release-staging.yml` checks out the tag and fast-forward-merges `staging` to it, then pushes
3. **Push to `staging`** — `deploy-staging.yml` builds a Docker image, pushes it to GHCR, and SSHes into the droplet to write `.env` and restart the containers

These two pipelines are fully independent — an infra-only PR (no app code change) ships through step 1 alone; a code-only release ships through steps 2–3 alone with no Terraform involvement at all.

### Terraform-managed infrastructure

The staging droplet itself — its `digitalocean_droplet`/`digitalocean_reserved_ip`/`digitalocean_firewall` resources, its DO Project assignment, and its two Cloudflare DNS records — is provisioned by Terraform (`terraform/environments/staging` → `terraform/modules/droplet`), mirroring the comprobify API repo's own `terraform/environments/staging` → `terraform/modules/droplet` split exactly. **Terraform never sets any app secret or env var** — those live only in `deploy-staging.yml`'s runtime `.env` heredoc (see `docs/terraform-digitalocean-setup.md`'s "Env vars" section), the same separation the API repo has always had between its infra and app-deploy pipelines. `terraform/environments/production` mirrors this exactly (own state key, own `terraform.tfvars`) but has never been applied — see "Production status" below.

**`terraform.yml` triggers off a push to `main` touching `terraform/**`**, mirroring the API repo's own `terraform.yml` exactly — one workflow, two job pairs (`plan-staging`/`apply-staging`, `plan-production`/`apply-production`), each declaring its own `<env>-infra` GitHub Environment so a required-reviewer rule can gate one environment's infra changes without gating the other's. Terraform here only ever manages the droplet/firewall/DNS — never app code or app secrets, which `deploy-staging.yml`/`deploy-production.yml` handle independently over SSH — so an infra change can be reviewed and applied the moment it's merged, without waiting for the next tagged release.

**State backend:** unchanged by the droplet migration — the same `comprobify-terraform-state` DigitalOcean Spaces bucket the API repo uses, under key `staging/comprobify-web/terraform.tfstate` (production: `production/comprobify-web/terraform.tfstate`; the API repo uses `staging/comprobify/...` and `production/comprobify/...`).

**Manual runs:** `workflow_dispatch` on `terraform.yml` supports both `apply` (re-run the normal reconciliation on demand, e.g. after changing `terraform.tfvars`) and `destroy` (tear everything down through the same audited pipeline, rather than deleting resources by hand in the DO/Cloudflare consoles) — both run against every job pair, since there's no per-environment `action` input. `destroy` is only ever reachable via this explicit manual dispatch, never the automatic post-release trigger.

### Production status

**Partially scaffolded, still disabled.** `terraform/environments/production` and the `plan-production`/`apply-production` job pair in `terraform.yml` exist and are written, and `.github/workflows/deploy-production.yml` mirrors `deploy-staging.yml` exactly — production is no longer purely hypothetical. But `release-production.yml`/`deploy-production.yml` both stay behind an `if: false` guard with their real triggers commented out, `terraform/environments/production/terraform.tfvars`'s `ssh_public_key` is still a placeholder, and the production droplet itself has never been `terraform apply`'d — no `production` branch, database, domain, or GitHub Environment secrets exist yet either. Production is deliberately on standby until the remaining setup steps are done, and it depends on coordinating one secret (`INTERNAL_SERVICE_SECRET`) with the Comprobify API's own already-live production deployment — see `docs/deployment-reference-production.md`'s "Coordination with the Comprobify API repo" section.

`docs/production-readiness-checklist.md` is the authoritative, actively-maintained list of exactly what's done versus still pending for this app's production launch — don't rely on a step list here, since the API repo's own equivalent doc explicitly notes one drifted out of sync with reality once already. `docs/deployment-reference-production.md` is the target-configuration reference (mirrors `docs/deployment-reference-staging.md`'s structure) for every concrete value — droplet name, deploy user, GitHub Environment names, DB setup, DNS records — once each piece is ready to provision.

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

### 4. Add secrets and variables (Settings → Secrets and variables → Actions)

| Secret | Scope | Used by |
|---|---|---|
| `RELEASE_PUSH_TOKEN` | Repository | `release-staging.yml` / `release-production.yml` — a fine-grained PAT with `Contents: Read and write` on this repo, needed because the default `GITHUB_TOKEN` cannot push to a protected branch |
| `TERRAFORM_SPACES_ACCESS_KEY_ID` / `TERRAFORM_SPACES_SECRET_ACCESS_KEY` | Repository | `terraform.yml` — a Spaces access key scoped to the shared `comprobify-terraform-state` bucket, dedicated to this repo's pipeline (not the API repo's own key) |

Two GitHub **Environments** (not repository-wide) hold everything else, deliberately kept separate — see "5. Provision via Terraform" below and `docs/terraform-digitalocean-setup.md`'s "Env vars" and "CI/CD" sections for the full list and reasoning:

- **`staging-infra`** — `DO_TOKEN`/`CLOUDFLARE_TOKEN` only, consumed by `terraform.yml`. This is the actual gate for infra changes: a required-reviewer rule added here doesn't affect app deploys at all.
- **`staging`** — everything app-related, consumed by `deploy-staging.yml`: `DROPLET_IP`, `INFRA_SSH_PRIVATE_KEY`, plus every app Secret/Variable.

### 5. Provision the droplet via Terraform, then deploy via `deploy-staging.yml`

The droplet (and its firewall/DNS) is created entirely by `terraform.yml`; the app itself is then shipped by `deploy-staging.yml` over SSH — two separate pipelines, same split the API repo has always used. One-time bootstrap:

1. Create the `staging-infra` GitHub Environment (Settings → Environments → New environment) and add `DO_TOKEN`/`CLOUDFLARE_TOKEN` as Secrets. Optionally add a required-reviewer protection rule here — declared on both `terraform.yml`'s `plan` and `apply` jobs, so it gates both.
2. Create the `staging` GitHub Environment (if it doesn't already exist) and populate it with:
   - **Secrets:** `DROPLET_IP` and `INFRA_SSH_PRIVATE_KEY` (from Terraform's `reserved_ip` output and the dedicated SSH key generated for this droplet, see `docs/terraform-digitalocean-setup.md`), and the app secrets (`DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `CONTEXT_COOKIE_SECRET`, `DATABASE_SSL_CA`, `SENTRY_AUTH_TOKEN`, `MAILGUN_API_KEY`, `COMPROBIFY_ADMIN_SECRET`, `INTERNAL_SERVICE_SECRET`).
   - **Variables:** `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MARKETING_URL`, `PUBLIC_DOMAIN_PRIMARY`, `PUBLIC_DOMAIN_ALIAS`, `COMPROBIFY_API_URL`, `DATABASE_SSL`, `MAILGUN_DOMAIN`, `MAILGUN_FROM`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.
3. Fill in `terraform/environments/staging/terraform.tfvars` with `ssh_public_key` (from the key generated for this droplet) and confirm `droplet_size`/`region`/domains.
4. Merge to `main`, then either wait for the next `terraform/**`-touching change, or run `workflow_dispatch` → `action: apply` manually to provision the droplet immediately.
5. Add the droplet's reserved IP to the shared database's Trusted Sources (DO dashboard — not Terraform-managed).
6. Run `deploy-staging.yml` (push to `staging`, or `workflow_dispatch`) to build the image and start the containers.

Full step-by-step, including the SSH key generation and verification checks, lives in `docs/terraform-digitalocean-setup.md`.

---

## Environment variables

All variables are required. Sourced from the `staging` GitHub Environment's Secrets/Variables and written to `/opt/comprobify-web/.env` on the droplet by `deploy-staging.yml` on every deploy (see `docs/terraform-digitalocean-setup.md`'s "Env vars" section) — Terraform itself no longer sets any of these, unlike the App Platform era's `env {}` blocks.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string for the frontend users table. Use a separate logical database from the Comprobify API DB — on staging/production this app and the API share one DigitalOcean Postgres cluster with no server-side pooler in front of it, so connect to the cluster's direct primary connection (same as the API does) and append `?connection_limit=N` (see below) so this app's client-side pool stays within its share of the cluster's connection budget. |
| `COMPROBIFY_API_URL` | Yes | Base URL of the Comprobify API — no trailing slash (e.g. `https://api.comprobify.com`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Full URL of this app — used to build absolute callback URLs (e.g. webhook receive URL, email verification link). Read server-side in `src/app/actions/{auth,onboarding,users}.ts` and `src/lib/webhook-url.ts`; several of those throw if it's unset. |
| `AUTH_SECRET` | Yes | Random 32+ character string used to sign Auth.js JWTs. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Use a **different value** per environment. |
| `ENCRYPTION_KEY` | Yes | 32-byte hex string used to encrypt `TenantApiKey` values at rest (AES-256-GCM). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Use a **different value** per environment. |
| `CONTEXT_COOKIE_SECRET` | Yes | Secret used to HMAC-sign the `comprobify_ctx` issuer-selection cookie. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Use a **different value** per environment. |
| `SENTRY_DSN` | No | Sentry DSN for server-side error capture. Leave unset locally — Sentry is intentionally disabled in local dev. Same DSN value for staging and production; use `APP_ENV` to distinguish environments. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Same DSN value as `SENTRY_DSN` — the `NEXT_PUBLIC_` prefix is required for the browser SDK to receive it. |
| `APP_ENV` | No | Tags server-side errors with the deployment environment (`staging` or `production`). Used by `sentry.server.config.ts` and `sentry.edge.config.ts`. |
| `NEXT_PUBLIC_APP_ENV` | No | Same as `APP_ENV` but exposed to the browser bundle. Used by `sentry.client.config.ts`. |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth token for source map uploads during build. Obtain from sentry.io → Settings → Auth Tokens. Without it, stack traces in Sentry show minified code instead of original TypeScript. |
| `MAILGUN_API_KEY` | No | Mailgun API key for sending invite emails (`src/lib/mailgun.ts`). Without it, `inviteUserAction`/`resendInviteAction` silently skip sending and only log to Sentry. A separate Mailgun setup from the Comprobify API's own — this app sends its own transactional emails. |
| `MAILGUN_DOMAIN` | No | Mailgun sending domain (e.g. `mg.your-domain.com`). Required alongside `MAILGUN_API_KEY`. |
| `MAILGUN_FROM` | No | From address for invite emails (e.g. `Comprobify <no-reply@mg.your-domain.com>`). |
| `COMPROBIFY_ADMIN_SECRET` | No* | Bearer secret for the Comprobify API's `/admin/*` routes, used by `src/lib/admin-api.ts` for the `/admin` super-admin panel (tenant management, payment-proof review). Must match the API's own `ADMIN_SECRET`. *Required only on the one deployment a super admin actually logs into — normal tenant flows never call `/admin/*`. |
| `INTERNAL_SERVICE_SECRET` | No | Lets the API trust this app's forwarded real-visitor-IP headers on BFF-proxied public calls (register, recover, resend-verification, agreements acceptance) instead of resolving to this app's own droplet egress IP — see CLAUDE.md's "Forwarding the real visitor IP on BFF-proxied public calls". Must match the API's own `INTERNAL_SERVICE_SECRET` exactly. Unset means the feature is inactive on both sides; no behavior change. |
| `ADMIN_SEED_PASSWORD` | No* | Password for the super admin user created by `prisma/seed.js` (`npm run db:seed`). *Not read at runtime by Next.js* — only needed transiently when running the seed script against an environment's database, not as a persistent env var on the app. |
| `SUPPORT_EMAIL` | No | Contact email shown on `/support` (`mailto:` link) and linked from the sidebar, marketing footer, and login/register screens. |
| `SUPPORT_PHONE` | No | Contact phone shown on `/support`, used to build a `https://wa.me/` WhatsApp link. Include the country code; non-digit characters are stripped when building the link. |
| `NEXT_PUBLIC_MARKETING_URL` | No | Public origin of the **marketing** host (`comprobify.com` / `staging.comprobify.com`) — not the app host. Used as the canonical/OG base URL and by `robots.ts`/`sitemap.ts` (`src/lib/seo.ts`). `robots.txt`/`sitemap.xml` only allow indexing when `NEXT_PUBLIC_APP_ENV=production`, so this only matters for the production and staging apps. |

> **Staging:** point `COMPROBIFY_API_URL` at the staging Comprobify API. Use a separate `DATABASE_URL` from production — staging users and production users must be isolated.

> **Production:** point `COMPROBIFY_API_URL` at the production Comprobify API. Generate a fresh `AUTH_SECRET` — never reuse the staging value.

#### `DATABASE_URL` connection budget on a shared cluster

Staging's Postgres lives on a DigitalOcean Basic-plan cluster (~22 total backend connections) shared with the `comprobify` API's own database — not a dedicated instance, and **not fronted by any server-side connection pooler (PgBouncer or otherwise)**. Every client — this app, the API's API process, the API's worker — connects straight to the cluster's primary and is responsible for capping its own concurrency; there's no intermediary multiplexing connections down. The API side enforces its share the same way: `../comprobify/src/config/database.js` is a plain `new Pool({ ..., max: config.db.poolMax })` against the direct primary connection, no pooler involved, `DB_POOL_MAX` set to 6 (API process) / 3 (worker) — see `../comprobify/docs/deployment.md`. That leaves roughly 13 of the cluster's ~22 for this app plus a few spare for admin/migration access. This app's `DATABASE_URL` carries two things as a result:

1. **The cluster's direct primary connection** — the same endpoint the API connects to, not a separate pooled/PgBouncer endpoint (DigitalOcean's optional "Connection Pools" feature is not in use here).
2. **`?connection_limit=8`** as a query param — caps how many connections this app's Prisma client will ever open concurrently. This app runs as a single long-lived `web` container on the droplet, holding one `pg.Pool` for its whole lifetime, so the cap is per-container: total connections from this app equal `connection_limit × container count` if this is ever scaled to multiple replicas — factor that in before changing either number. Enforced entirely client-side by `pg.Pool`'s own `max` option, the same mechanism as `DB_POOL_MAX` on the API side, and works exactly the same whether or not anything sits in front of Postgres.

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

## Rotating secrets (e.g. after a suspected compromise)

Not all of this app's secrets are equally safe to rotate — one of them can cause a real, silent outage if done naively; several others just have a visible-but-harmless side effect (forcing logouts or resetting a cookie); the rest are purely mechanical.

**`ENCRYPTION_KEY` — dangerous, requires a real migration, do not just swap the env var.** This key is the only thing standing between `TenantApiKey.encryptedKey` (decrypted on every server-side API call `requireContext()` makes) and `WebhookEndpoint.encryptedSecret` (decrypted to verify every inbound webhook) and being unreadable garbage. Changing the env var alone, without re-encrypting existing rows first, permanently breaks both at once — every tenant loses API access, and every inbound webhook fails signature verification — a full outage for every already-onboarded tenant, not a gradual degradation. Correct rotation requires: decrypt every affected row with the OLD key, re-encrypt with the NEW key, write it back, *then* cut the env var over — as one script run before the restart, not manually. `scripts/rotate-encryption-key.js` does exactly this — see `docs/guides/encryption-key-rotation.md` for how the script works and the actual commands to run it, locally and on staging/production.

**`AUTH_SECRET` — mechanical, but has a visible side effect: it force-logs-out every active session.** It signs Auth.js's JWT session cookies; nothing in the database is encrypted with it. The moment the new value is live, every existing session cookie fails signature verification and `auth()` treats it as unauthenticated — every logged-in user (across every tenant) is bounced to `/login` on their next request. No data is at risk, but this is disruptive enough to be worth scheduling deliberately (e.g. a maintenance window) rather than rotating casually. Update the value in the `staging`/`production` GitHub Environment's Secrets, then redeploy.

**`CONTEXT_COOKIE_SECRET` — mechanical, smaller side effect than `AUTH_SECRET`.** It only HMAC-*signs* the `comprobify_ctx` issuer-selection cookie (`src/lib/context-cookie.ts`) — it never encrypts anything, and nothing is stored server-side that depends on it. Rotating invalidates existing `comprobify_ctx` cookies; `readCtxCookie()`'s signature check fails, returns `null`, and the affected user is routed back through the issuer picker (or the "no issuer assigned" fallback) on their next request — an inconvenience, not a data loss, and it doesn't log anyone out the way `AUTH_SECRET` does. Update and redeploy same as any other Secret.

**`DATABASE_URL` credentials** — also low-risk. Rotate the password/role at the provider (DigitalOcean Managed Postgres — the same shared cluster the Comprobify API uses, see `docs/guides/database-backups.md`), update the `DATABASE_URL` GitHub Secret, trigger a deploy. No stored data depends on the credential value itself, only on being able to authenticate — a connection-level concern, not a data-level one. Since the cluster is shared, rotating this app's own role/password doesn't affect the API's — they're independent roles even on the same cluster.

**`COMPROBIFY_ADMIN_SECRET` / `INTERNAL_SERVICE_SECRET` — mechanical, but must be coordinated with the API repo, not rotated unilaterally.** Both are bearer secrets compared as plain equality on the Comprobify API side (`authenticate-admin.js` for the first, `trusted-forwarded-ip.js` for the second) — neither encrypts anything stored in this app's own database. But because the *same* value has to match on both sides, rotating only this app's copy (or only the API's) creates a window where every `/admin/*` call 401s (for `COMPROBIFY_ADMIN_SECRET`) or the forwarded-visitor-IP trust silently stops applying (for `INTERNAL_SERVICE_SECRET`, currently unset/inactive by default per `CLAUDE.md` — rotating it while unset is a non-event) until both are updated. Coordinate the redeploy on both repos, or accept a brief mismatch window if the affected surface tolerates it (super-admin panel access for the first; a graceful no-op fallback for the second, see `src/lib/client-forwarding.ts`).

**`MAILGUN_API_KEY` / `SENTRY_AUTH_TOKEN`** — fully mechanical, no coordination needed. Neither is used to encrypt or sign anything this app stores. Regenerate in the respective dashboard (Mailgun / Sentry), update the GitHub Secret, redeploy. `SENTRY_AUTH_TOKEN` is build-time only (source map upload during CI) — rotating it only affects the *next* build, never anything already running.

**`ADMIN_SEED_PASSWORD` — not a live secret at all.** It's read once, transiently, by `prisma/seed.js` to bcrypt-hash and write into the seeded super admin's `passwordHash`; Next.js never reads it at runtime (see the Environment variables table above). Changing this env var does **not** retroactively change the already-seeded admin's live password — that password is a bcrypt hash stored in the `users` row, independent of the env var after seeding. To actually change the live super-admin account's password: use the self-service `/forgot-password` flow (`requestPasswordResetAction` looks up any `User` row by email, not scoped to a tenant, so it works for the super admin too) — the super admin has no `settings/account` page to reach, since `requireContext()` redirects any `isSuperAdmin` user straight to `/admin`. Re-running `npm run db:seed` with a new `ADMIN_SEED_PASSWORD` also works (idempotent upsert on email) but requires direct DB access.

---

## Production checklist

This is a snapshot checklist of configuration to verify at go-live time — for the actively-maintained, up-to-date tracker of what's actually done versus still pending right now, see `docs/production-readiness-checklist.md` instead (this list has drifted before; don't treat an unchecked box here as current status without cross-checking that file).

**Database**
- [ ] `DATABASE_URL` points to a production PostgreSQL instance (separate from staging)
- [ ] If production shares a connection budget with another service (see "DATABASE_URL connection budget on a shared cluster" above), `connection_limit` on `DATABASE_URL` is set deliberately to match the reserved split, not left unset or copied blindly from staging
- [ ] `DATABASE_SSL=true` is set (any real managed Postgres provider enforces TLS)
- [ ] `DATABASE_SSL_CA` is set if the provider uses a private CA (e.g. DigitalOcean) — verify with a real deploy, not just that the var exists, since a missing/wrong CA fails at connection time with `SELF_SIGNED_CERT_IN_CHAIN`
- [ ] `DATABASE_URL` itself has no `sslmode`/`sslcert`/`sslkey`/`sslrootcert` query param — see the note above on why that would silently override `DATABASE_SSL_CA`
- [ ] `npx prisma migrate deploy` ran successfully on the first deploy (automatic via `start:deploy` at process startup, not the build command — check the runtime logs, and separately confirm this step itself succeeded, since it runs through a different connector than the app's other runtime queries — see the CI/CD pipeline section above)
- [ ] Production database has backups enabled
- [ ] `scripts/rotate-encryption-key.js` (see "Rotating secrets" above and `docs/guides/encryption-key-rotation.md`) has been dry-run against a restored copy of production-like data before go-live — don't let the first real run be during an actual incident

**Comprobify API**
- [ ] `COMPROBIFY_API_URL` points to the production Comprobify API (not staging)
- [ ] The Comprobify API's registration rate limiter is active (5 req/hour per IP)
- [ ] `ENCRYPTION_KEY` and `CONTEXT_COOKIE_SECRET` are set (generate fresh values per environment)

**Auth**
- [ ] `AUTH_SECRET` is a unique, randomly generated value — never reuse the staging secret (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] No `COMPROBIFY_API_KEY` or `COMPROBIFY_SANDBOX` env vars set — these are removed

**Droplet**
- [ ] All env vars are set as server-only (no `NEXT_PUBLIC_` prefix on any secret — a Next.js build-time rule, not platform-specific, but easy to get wrong)
- [ ] `Dockerfile`'s `builder` stage runs `npm run build:deploy` and the container's `CMD` is `npm run start:deploy` — verify by checking the built image directly, not just the workflow file, since a typo here fails silently until the container actually starts
- [ ] A **dedicated, production-only** SSH key pair was generated — never the staging key (see `docs/terraform-digitalocean-setup.md`'s "SSH access model")
- [ ] `terraform/environments/production/terraform.tfvars`'s `ssh_public_key` placeholder is replaced with that key's public half before the first `terraform apply`
- [ ] `PUBLIC_DOMAIN_PRIMARY`/`PUBLIC_DOMAIN_ALIAS` GitHub Variables are set to `comprobify.com`/`app.comprobify.com` — `deploy/caddy/Caddyfile` reads these via Caddy's `{$VAR}` substitution, and an unset value means Caddy has no site block to match at all
- [ ] Both custom domains resolve through Cloudflare **proxied** (`proxied = true`) to the production droplet's reserved IP
- [ ] HTTPS enforced — Caddy provisions and renews certs automatically for both custom domains
- [ ] The production droplet's reserved IP is in the production database's Trusted Sources
- [ ] `production` branch is protected in GitHub (no force pushes, restricted push access)
- [ ] Confirm `deploy-production.yml` only triggers on push to `production` — not `main` or any other branch — so unreviewed work can't reach it

**Release pipeline**
- [ ] `RELEASE_PUSH_TOKEN` secret added to the repository (already true — shared with staging)
- [ ] `production` branch created and the `release-production.yml` trigger uncommented + `if: false` guard removed
- [ ] `deploy-production.yml`'s trigger uncommented + `if: false` guard removed (the workflow file itself already exists, mirroring `deploy-staging.yml`)
- [ ] `INTERNAL_SERVICE_SECRET` matches the Comprobify API's own already-live production value exactly — see `docs/deployment-reference-production.md`'s "Coordination with the Comprobify API repo"
- [ ] A tag has been promoted through staging and validated before the first production release

**Sentry**
- [ ] `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` set as GitHub Variables in each environment (same DSN value for both)
- [ ] `APP_ENV` set to `staging` in the staging app and `production` in the production app
- [ ] `NEXT_PUBLIC_APP_ENV` set to match `APP_ENV` in each app
- [ ] `SENTRY_AUTH_TOKEN` set (obtain from sentry.io → Settings → Auth Tokens) so source maps are uploaded and stack traces show original TypeScript lines
- [ ] Verified a test error appears in the Sentry dashboard before going live

---

## Logs

Application logs are no longer in a platform dashboard — SSH into the droplet and use Docker directly, same as the API repo: `docker compose logs -f web` (runtime/server-side logs) from `/opt/comprobify-web`, or `docker compose logs -f caddy` for reverse-proxy/TLS issues. Build logs live in the GitHub Actions run for `deploy-staging.yml`/`deploy-production.yml`, not on the droplet at all — the droplet never builds anything, it only pulls a pre-built image from GHCR.

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
| Onboarding fails with a generic internal-error message, nothing in Sentry | If the catch block doesn't call `Sentry.captureException` (see CLAUDE.md Common Mistake #23), check `ENCRYPTION_KEY` first — it must be exactly 64 hex characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); a base64 value throws inside `encrypt()` before any DB write is attempted. |
| Every DB query fails at startup with `SELF_SIGNED_CERT_IN_CHAIN` | `DATABASE_SSL=true` is set but `DATABASE_SSL_CA` is missing (or wrong) for a provider with a private CA, e.g. DigitalOcean managed Postgres — download the cluster's CA certificate from its Connection Details page and set the full PEM content as `DATABASE_SSL_CA`. |
| DB connections fail entirely, or TLS verification behaves unexpectedly despite `DATABASE_SSL_CA` being set correctly | `DATABASE_URL` has an `sslmode`/`sslcert`/`sslkey`/`sslrootcert` query param on it — node-postgres's connection-string parsing overwrites the explicit `ssl` config `src/lib/db.ts` builds from `DATABASE_SSL_CA`, silently undoing it. Remove any ssl-related param from the URL itself. |
