# Deployment

---

## Branching strategy

Three long-lived branches map directly to environments. Feature branches are always cut from `main` and merged back into `main` via pull request.

```
  feature/xyz              main               staging                prod
      │                     │                    │                     │
      │  PR + merge         │                    │                     │
      │────────────────────▶│                    │                     │
      │                     │  merge main →      │                     │
      │                     │  staging           │                     │
      │                     │───────────────────▶│──▶ Vercel auto ────▶ comprobify-web-staging
      │                     │                    │                     │
      │                     │  merge staging →   │                     │
      │                     │  prod (full release)                     │
      │                     │────────────────────┼────────────────────▶│──▶ Vercel auto ──▶ comprobify-web-prod
      │                     │                    │                     │
      │                     │  cherry-pick       │                     │
      │                     │  (selective deploy)│                     │
      │                     │────────────────────┼── commit SHA ──────▶│──▶ Vercel auto ──▶ comprobify-web-prod
      │                     │                    │                     │
  hotfix/xyz                │                    │                     │
      │  PR + merge         │                    │                     │
      │────────────────────▶│                    │                     │
      │                     │  cherry-pick       │                     │
      │                     │  to prod           │                     │
      │                     │────────────────────┼── commit SHA ──────▶│──▶ Vercel auto ──▶ comprobify-web-prod
      │                     │                    │                     │
      │                     │  cherry-pick       │                     │
      │                     │  to staging (sync) │                     │
      │                     │───────────────────▶│                     │
```

| Branch | Environment | Trigger |
|--------|-------------|---------|
| `main` | Local / CI tests | — |
| `staging` | Staging (Vercel) | Push to `staging` |
| `prod` | Production (Vercel) | Push to `prod` |

**Rules:**
- All development work happens in `feature/*` branches off `main`
- Never commit directly to `staging` or `prod`
- Always flow commits **downward**: `main` → `staging` → `prod`
- For hotfixes: fix in `main` first, then cherry-pick to `prod`

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

### Deploy to staging

```bash
# Merge main into staging — triggers the staging deploy automatically
git checkout staging
git pull origin staging
git merge main
git push origin staging
git checkout main
```

### Deploy to production

```bash
# Full release: merge staging into prod
git checkout prod
git pull origin prod
git merge staging
git push origin prod

# Or: cherry-pick specific commits from main to prod
git checkout prod
git pull origin prod
git cherry-pick <commit-sha>   # repeat for each commit needed
git push origin prod
git checkout main
```

> **Cherry-pick caveat:** cherry-picked commits get a new SHA. If you later do a full `merge staging → prod`, git won't recognise them as already merged and may produce conflicts. To avoid this, after cherry-picking into prod always cherry-pick the same commits into staging so all three branches stay consistent. Periodically do a full merge from staging to prod to reset the debt.

### Sync after cherry-picking

```bash
# After cherry-picking to prod, keep staging consistent
git checkout staging
git cherry-pick <commit-sha>   # same commit(s)
git push origin staging
git checkout main
```

### Hotfix on production

```bash
# Always fix in main first
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix
# fix, commit, push
git push origin hotfix/critical-fix
# PR → main, merge

# Then cherry-pick to prod (and staging to keep in sync)
git checkout prod
git pull origin prod
git cherry-pick <hotfix-commit-sha>
git push origin prod

git checkout staging
git pull origin staging
git cherry-pick <hotfix-commit-sha>
git push origin staging

git checkout main
```

---

## CI/CD pipeline

Vercel watches the `staging` and `prod` branches directly. Every push triggers an automatic build and deployment — no workflow files needed.

| Branch | Vercel project | URL |
|--------|----------------|-----|
| `staging` | `comprobify-web-staging` | `comprobify-web-staging.vercel.app` (or custom domain) |
| `prod` | `comprobify-web-prod` | `comprobify-web-prod.vercel.app` (or custom domain) |

### Build settings (both projects)

| Setting | Value |
|---------|-------|
| Framework preset | Next.js |
| Build command | `npm run build` |
| Output directory | `.next` (Vercel default) |
| Install command | `npm ci` |
| Node.js version | 18.x or 20.x |

Vercel handles the rest automatically: installs dependencies, builds the app, and routes traffic to the new deployment.

---

## GitHub repository setup

One-time setup after creating the `staging` and `prod` branches.

### 1. Create the branches

```bash
git checkout main
git pull origin main

git checkout -b staging
git push -u origin staging

git checkout main
git checkout -b prod
git push -u origin prod

git checkout main
```

### 2. Protect `main` (Settings → Branches → Add rule)

- **Branch name pattern:** `main`
- ✅ Require a pull request before merging
- ✅ Require approvals: 1
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Do not allow bypassing the above settings

### 3. Protect `prod` (Settings → Branches → Add rule)

- **Branch name pattern:** `prod`
- ✅ Restrict who can push — add only yourself
- ✅ Do not allow force pushes

### 4. Leave `staging` open

`staging` does not need branch protection. Merges from `main` are fast and frequent. Direct push is fine.

### 5. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the `comprobify-web` GitHub repository
3. Create **two separate Vercel projects** — one for staging, one for production:
   - In each project's **Settings → Git**, set the **Production Branch** to `staging` or `prod` respectively
4. Add environment variables to each project (see table below)
5. Deploy

---

## Environment variables

All variables are required. Set them in each Vercel project under **Settings → Environment Variables**.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string for the frontend users table. Use a separate database from the Comprobify API DB. Recommended: [Neon](https://neon.tech) free tier on Vercel. |
| `COMPROBIFY_API_URL` | Base URL of the Comprobify API — no trailing slash (e.g. `https://api.comprobify.com`) |
| `COMPROBIFY_ADMIN_SECRET` | Admin secret for issuer provisioning. Must match the `COMPROBIFY_ADMIN_SECRET` set in the Comprobify API. Used server-side only — never exposed to the browser. |
| `AUTH_SECRET` | Random 32+ character string used to sign Auth.js JWTs. Generate: `openssl rand -base64 32`. Use a **different value** per environment. |

> **Staging:** point `COMPROBIFY_API_URL` at the staging Comprobify API. Use a separate `DATABASE_URL` from production — staging users and production users must be isolated.

> **Production:** point `COMPROBIFY_API_URL` at the production Comprobify API. Generate a fresh `AUTH_SECRET` — never reuse the staging value.

### Removed variables (no longer needed)

| Variable | Reason removed |
|----------|----------------|
| `COMPROBIFY_API_KEY` | API keys are now per-user, stored in the `users` table, and fetched via `requireApiKey()` |
| `COMPROBIFY_SANDBOX` | Sandbox/production state is now per-user, stored in `users.environment` and read from the auth session |
| `NEXTAUTH_SECRET` | Renamed to `AUTH_SECRET` (Auth.js v5 convention) |

---

## Production checklist

**Database**
- [ ] `DATABASE_URL` points to a production PostgreSQL instance (separate from staging)
- [ ] `npx prisma migrate deploy` has been run against the production database
- [ ] Production database has backups enabled

**Comprobify API**
- [ ] `COMPROBIFY_API_URL` points to the production Comprobify API (not staging)
- [ ] `COMPROBIFY_ADMIN_SECRET` matches the production Comprobify API's admin secret
- [ ] The Comprobify API's admin endpoints have rate limiting enabled

**Auth**
- [ ] `AUTH_SECRET` is a unique, randomly generated value — never reuse the staging secret (`openssl rand -base64 32`)
- [ ] No `COMPROBIFY_API_KEY` or `COMPROBIFY_SANDBOX` env vars set — these are removed

**Vercel**
- [ ] All env vars are set as server-only (no `NEXT_PUBLIC_` prefix on any secret)
- [ ] Custom domain configured in Vercel and DNS records updated
- [ ] HTTPS enforced — Vercel handles this automatically for custom domains
- [ ] `prod` branch is protected in GitHub (no force pushes, restricted push access)
- [ ] Vercel deployment previews are disabled or restricted for the `prod` project

---

## Logs

Application logs are available in the Vercel dashboard under **Deployments → Functions** (server-side) and **Runtime Logs**.

Key things to monitor:

| Symptom | Likely cause |
|---------|--------------|
| All users redirected to `/login` in a loop | `AUTH_SECRET` missing or wrong — session JWTs can't be verified |
| 500 on login / registration | `DATABASE_URL` misconfigured or migration not applied — run `npx prisma migrate deploy` |
| Issuer setup fails in Settings | `COMPROBIFY_ADMIN_SECRET` missing or doesn't match the Comprobify API's admin secret |
| API calls return 401 after issuer setup | The provisioned API key is invalid or was revoked — re-run setup |
| Sandbox banner appears for production users | User's `environment` column is still `'sandbox'` — they must use the "Activate production" button in Settings |
| Invoice status polling stuck | Proxy route `/api/documents/:key/status` can't reach the Comprobify API — check `COMPROBIFY_API_URL` and network access |
| Build failing | Run `npm run build` locally and fix type errors before pushing |
