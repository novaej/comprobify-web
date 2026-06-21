# Deployment

---

## Branching strategy

Two long-lived branches map to deployed environments. They are **automation-owned** — promoted forward by tags and GitHub Releases, never by direct or manual pushes. Feature/fix branches are always cut from `main` and merged back via pull request. This mirrors the release model used by the Comprobify API (`../comprobify/docs/deployment.md`), substituting Vercel's native Git integration for Render's deploy hooks.

```
  feature/xyz              main                                   staging                  production
      │                     │                                       │                          │
      │  PR + merge         │                                       │                          │
      │────────────────────▶│                                       │                          │
      │                     │  git tag vX.Y.Z + push                │                          │
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

Every push to `staging` or `production` (i.e. every fast-forward the release workflows perform) is picked up automatically by Vercel's Git integration, which builds and deploys the corresponding project (`comprobify-web-staging` / `comprobify-web-production` — see the CI/CD pipeline section below). No deploy step runs inside this repo's workflows.

| Branch | Environment | Promoted by |
|--------|-------------|-------------|
| `main` | — (trunk; CI only, no deploy) | PR merge |
| `staging` | Staging (Vercel) | `release-staging.yml` — fast-forwarded on tag push `vX.Y.Z` |
| `production` | Production (Vercel) — *not yet provisioned, pipeline disabled* | `release-production.yml` — fast-forwarded when a GitHub Release is published |

**Rules:**
- All development happens in feature/fix branches off `main`, merged via PR (1 approval required)
- `staging` and `production` are **automation-owned** — never push to them directly; they only move forward via fast-forward merges performed by the release workflows. Branch protection restricts direct pushes
- A **tag** (`vX.Y.Z`, semantic versioning) means *"build this, validate it in staging."* Pushing it triggers `release-staging.yml`, which fast-forwards `staging`. Vercel's Git integration deploys the push automatically — no separate deploy workflow needed
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

Tag the commit on `main` you want to promote — this is the only manual step; the workflow handles the rest.

```bash
git checkout main
git pull origin main
git tag v1.4.0
git push origin v1.4.0
```

`release-staging.yml` fast-forwards `staging` to `v1.4.0` and pushes it; Vercel's Git integration picks up the push and deploys automatically. Use semantic versioning (`vMAJOR.MINOR.PATCH`) so it's obvious at a glance whether a tag is a feature release (`v1.5.0`) or a hotfix (`v1.4.1`).

### Promote to production

Once the tag has been validated in staging, promotion is a single deliberate action — **publishing a GitHub Release from that tag**:

1. GitHub UI → **Releases → Draft a new release**
2. Choose the existing tag (e.g. `v1.4.0`) — do not create a new one
3. (Optional) generate release notes from the commits since the previous tag — this doubles as the changelog entry, since the publish event *is* the production-ship event
4. Click **Publish release**

`release-production.yml` then fast-forwards `production` to that commit; Vercel deploys it automatically.

> **Currently disabled** — the production Vercel project, `production` branch, and secrets don't exist yet. See "Production status" below for what's needed to enable this.

### Hotfix flow

Branch from the **currently-deployed `production` ref** (not `main`, which may contain unreleased work). Until production is provisioned, branch from `staging` instead — it's the only environment that's actually live.

```bash
# 1. Cut a short-lived integration branch from what's live in prod
git checkout -b hotfix/payment-bug production   # or `staging`, until production exists

# 2. Make the fix on a sub-branch and PR it into the hotfix branch (same review rigor as any change)
git checkout -b fix/payment-rounding hotfix/payment-bug
# ...fix, commit, push, open PR: fix/payment-rounding → hotfix/payment-bug, review + merge...

# 3. Tag the merged result — this feeds the same release pipeline
git checkout hotfix/payment-bug
git pull origin hotfix/payment-bug
git tag v1.4.1
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

**Vercel custom domain setup (production):**
1. In `comprobify-web-production`, add **both** `comprobify.com` and `app.comprobify.com` as custom domains.
2. Point the DNS records for each to Vercel as instructed.
3. No extra env vars are required — the proxy reads the `host` header at runtime.

**Staging:**
1. In `comprobify-web-staging`, add `staging.comprobify.com` and `app-staging.comprobify.com`.
2. Same DNS setup, separate CNAME targets from production.

---

## CI/CD pipeline

### Workflow files

| File | Trigger | Effect |
|------|---------|--------|
| `.github/workflows/release-staging.yml` | Push of tag `vX.Y.Z` | Fast-forwards `staging` to the tagged commit and pushes it |
| `.github/workflows/release-production.yml` | *(disabled)* GitHub Release published | Fast-forwards `production` to the released commit and pushes it |

Unlike the API (which runs on Render and needs an explicit `deploy-staging.yml` / `deploy-production.yml` to call a Render deploy hook), Vercel's Git integration watches `staging` and `production` directly — every push to either branch triggers an automatic build and deployment with no additional workflow file required.

| Branch | Vercel project | URL |
|--------|----------------|-----|
| `staging` | `comprobify-web-staging` | `staging.comprobify.com` + `app-staging.comprobify.com` |
| `production` | `comprobify-web-production` | `comprobify.com` + `app.comprobify.com` |

### Build settings (both projects)

| Setting | Value |
|---------|-------|
| Framework preset | Next.js |
| Build command | `npm run build` |
| Output directory | `.next` (Vercel default) |
| Install command | `npm ci` |
| Node.js version | 18.x or 20.x |

### Pipeline stages (staging)

1. **Tag pushed** (`vX.Y.Z`) — `release-staging.yml` checks out the tag and fast-forward-merges `staging` to it, then pushes
2. **Push to `staging`** — Vercel's Git integration builds and deploys `comprobify-web-staging` automatically

### Production status

The production pipeline is **written but disabled** — `release-production.yml` exists in the repo with its trigger commented out and an `if: false` guard on its job, because the production Vercel project, `production` branch, and secrets don't exist yet.

To enable production once it's provisioned:
1. Create the `production` branch (fast-forwarded only by the automation, same invariant as `staging`)
2. Create the `comprobify-web-production` Vercel project, with **independent** `AUTH_SECRET` / `ENCRYPTION_KEY` / `CONTEXT_COOKIE_SECRET` / `DATABASE_URL` from staging — never share these between environments
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

No Vercel deploy-hook secret is needed — Vercel's Git integration deploys on push without any token from this repo.

### 5. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the `comprobify-web` GitHub repository
3. Create **two separate Vercel projects** — one for staging, one for production:
   - In each project's **Settings → Git**, set the **Production Branch** to `staging` or `production` respectively
4. Add environment variables to each project (see table below)
5. Deploy

---

## Environment variables

All variables are required. Set them in each Vercel project under **Settings → Environment Variables**.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string for the frontend users table. Use a separate database from the Comprobify API DB. Recommended: [Neon](https://neon.tech) free tier on Vercel. |
| `COMPROBIFY_API_URL` | Yes | Base URL of the Comprobify API — no trailing slash (e.g. `https://api.comprobify.com`) |
| `AUTH_SECRET` | Yes | Random 32+ character string used to sign Auth.js JWTs. Generate: `openssl rand -base64 32`. Use a **different value** per environment. |
| `ENCRYPTION_KEY` | Yes | 32-byte hex string used to encrypt `TenantApiKey` values at rest (AES-256-GCM). Generate: `openssl rand -hex 32`. Use a **different value** per environment. |
| `CONTEXT_COOKIE_SECRET` | Yes | Secret used to HMAC-sign the `comprobify_ctx` issuer-selection cookie. Generate: `openssl rand -hex 32`. Use a **different value** per environment. |
| `SENTRY_DSN` | No | Sentry DSN for server-side error capture. Leave unset locally — Sentry is intentionally disabled in local dev. Same DSN value for staging and production; use `APP_ENV` to distinguish environments. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Same DSN value as `SENTRY_DSN` — the `NEXT_PUBLIC_` prefix is required for the browser SDK to receive it. |
| `APP_ENV` | No | Tags server-side errors with the deployment environment (`staging` or `production`). Used by `sentry.server.config.ts` and `sentry.edge.config.ts`. |
| `NEXT_PUBLIC_APP_ENV` | No | Same as `APP_ENV` but exposed to the browser bundle. Used by `sentry.client.config.ts`. |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth token for source map uploads during build. Obtain from sentry.io → Settings → Auth Tokens. Without it, stack traces in Sentry show minified code instead of original TypeScript. |

> **Staging:** point `COMPROBIFY_API_URL` at the staging Comprobify API. Use a separate `DATABASE_URL` from production — staging users and production users must be isolated.

> **Production:** point `COMPROBIFY_API_URL` at the production Comprobify API. Generate a fresh `AUTH_SECRET` — never reuse the staging value.

### Removed variables (no longer needed)

| Variable | Reason removed |
|----------|----------------|
| `COMPROBIFY_API_KEY` | API keys are now per-tenant, stored encrypted in the `TenantApiKey` table, resolved via `requireContext()` |
| `COMPROBIFY_SANDBOX` | Sandbox/production state is per-tenant, stored in `Tenant.environment` |
| `COMPROBIFY_ADMIN_SECRET` | Admin API removed — issuer setup uses `POST /v1/register` (self-service) |
| `NEXTAUTH_SECRET` | Renamed to `AUTH_SECRET` (Auth.js v5 convention) |

---

## Production checklist

**Database**
- [ ] `DATABASE_URL` points to a production PostgreSQL instance (separate from staging)
- [ ] `npx prisma migrate deploy` has been run against the production database
- [ ] Production database has backups enabled

**Comprobify API**
- [ ] `COMPROBIFY_API_URL` points to the production Comprobify API (not staging)
- [ ] The Comprobify API's registration rate limiter is active (5 req/hour per IP)
- [ ] `ENCRYPTION_KEY` and `CONTEXT_COOKIE_SECRET` are set (generate fresh values per environment)

**Auth**
- [ ] `AUTH_SECRET` is a unique, randomly generated value — never reuse the staging secret (`openssl rand -base64 32`)
- [ ] No `COMPROBIFY_API_KEY` or `COMPROBIFY_SANDBOX` env vars set — these are removed

**Vercel**
- [ ] All env vars are set as server-only (no `NEXT_PUBLIC_` prefix on any secret)
- [ ] Custom domain configured in Vercel and DNS records updated
- [ ] HTTPS enforced — Vercel handles this automatically for custom domains
- [ ] `production` branch is protected in GitHub (no force pushes, restricted push access)
- [ ] Vercel deployment previews are disabled or restricted for the `production` project

**Release pipeline**
- [ ] `RELEASE_PUSH_TOKEN` secret added to the repository
- [ ] `production` branch created and the `release-production.yml` trigger uncommented + `if: false` guard removed
- [ ] A tag has been promoted through staging and validated before the first production release

**Sentry**
- [ ] `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` set in each Vercel project (same DSN value for both)
- [ ] `APP_ENV` set to `staging` in the staging project and `production` in the production project
- [ ] `NEXT_PUBLIC_APP_ENV` set to match `APP_ENV` in each project
- [ ] `SENTRY_AUTH_TOKEN` set (obtain from sentry.io → Settings → Auth Tokens) so source maps are uploaded and stack traces show original TypeScript lines
- [ ] Verified a test error appears in the Sentry dashboard before going live

---

## Logs

Application logs are available in the Vercel dashboard under **Deployments → Functions** (server-side) and **Runtime Logs**.

Key things to monitor:

| Symptom | Likely cause |
|---------|--------------|
| All users redirected to `/login` in a loop | `AUTH_SECRET` missing or wrong — session JWTs can't be verified |
| 500 on login / registration | `DATABASE_URL` misconfigured or migration not applied — run `npx prisma migrate deploy` |
| Issuer setup fails in onboarding | Comprobify API rejected the registration — check `COMPROBIFY_API_URL` and Render logs on the API side |
| API calls return 401 after issuer setup | The provisioned API key is invalid or was revoked — re-run setup |
| Sandbox banner appears for production users | User's `environment` column is still `'sandbox'` — they must use the "Activate production" button in Settings |
| Invoice status polling stuck | Proxy route `/api/documents/:key/status` can't reach the Comprobify API — check `COMPROBIFY_API_URL` and network access |
| Build failing | Run `npm run build` locally and fix type errors before pushing |
