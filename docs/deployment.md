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

All variables are required unless marked optional. Set them in each Vercel project under **Settings → Environment Variables**.

| Variable | Required | Description |
|----------|----------|-------------|
| `COMPROBIFY_API_URL` | Yes | Base URL of the Comprobify API — no trailing slash (e.g. `https://api.comprobify.com`) |
| `COMPROBIFY_API_KEY` | Yes | API key from your Comprobify issuer. **Never** use a `NEXT_PUBLIC_` prefix — this must stay server-only |
| `COMPROBIFY_SANDBOX` | No | Set to `"true"` when the API key points to a sandbox issuer. Shows the yellow sandbox banner in the UI. Default: unset (treated as false) |
| `NEXTAUTH_SECRET` | Yes | Random 32+ character string used by Next.js. Generate: `openssl rand -base64 32` |

> **Staging:** point `COMPROBIFY_API_URL` at the staging deployment of the Comprobify API and use a sandbox issuer's API key. Set `COMPROBIFY_SANDBOX=true`.

> **Production:** point `COMPROBIFY_API_URL` at the production Comprobify API and use a live issuer's API key. Leave `COMPROBIFY_SANDBOX` unset.

---

## Production checklist

- [ ] `COMPROBIFY_API_URL` points to the production Comprobify API (not staging)
- [ ] `COMPROBIFY_API_KEY` belongs to a live issuer (`sandbox = false` on the API side)
- [ ] `COMPROBIFY_SANDBOX` is **not** set (or set to `"false"`) — sandbox banner must not appear in production
- [ ] `NEXTAUTH_SECRET` is a unique, randomly generated value — never reuse the staging secret
- [ ] `COMPROBIFY_API_KEY` is set as a server-only variable (no `NEXT_PUBLIC_` prefix) in Vercel
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
| Blank page or 500 on all routes | Missing or wrong `COMPROBIFY_API_URL` / `COMPROBIFY_API_KEY` |
| Sandbox banner appearing in production | `COMPROBIFY_SANDBOX=true` set on the production project |
| Invoice status polling stuck | Proxy route `/api/documents/:key/status` can't reach the Comprobify API — check `COMPROBIFY_API_URL` and network access |
| Build failing | Run `npm run build` locally and fix type errors before pushing |
