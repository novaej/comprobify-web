# Terraform + DigitalOcean — Infrastructure Setup

Reference for how this app's DigitalOcean App Platform deployment is provisioned: the app spec, domains, and DNS managed by Terraform, application code deployed via App Platform's own built-in Autodeploy. This is the living "how does our infrastructure actually work" document. `docs/deployment.md` covers what's unaffected by hosting details (branching strategy, environment variable *meanings*, migrations, the release/versioning workflow).

This repo hosts on **App Platform (a PaaS)**, not a droplet — there is no server to SSH into, no cloud-init, no Docker Compose stack, no cron files. If you've read the `comprobify` (API) repo's own `docs/terraform-digitalocean-setup.md`, most of that document doesn't apply here; this one is considerably shorter because App Platform absorbs the whole "provision a VM, harden it, install a runtime, run a reverse proxy" layer that repo has to build by hand.

**What lives on DigitalOcean, managed by *this repo's* Terraform:** the App Platform app itself (`comprobify-web-staging`) and its two Cloudflare DNS records.

**What doesn't:** the Postgres database (DigitalOcean Managed Database, a Basic-plan cluster **shared with the Comprobify API** — provisioned and managed outside this repo's Terraform, see `docs/deployment.md`'s "Database setup" section), Sentry, Mailgun, and the Comprobify API's own droplet (see `comprobify/docs/terraform-digitalocean-setup.md`). All of these are external services this app's Terraform only *references* (via plain variables or env var values), never creates. They're grouped into the same `Comprobify Staging` DO Project as this app purely for dashboard purposes — see "DO Projects" below.

---

## Overview of the flow

Unlike the API repo — which runs two deliberately independent pipelines (an infra Terraform workflow and a separate app-deploy CD workflow that SSHes in and rewrites `.env`) — this repo effectively has **one** Terraform-driven config path plus App Platform's own Autodeploy, because App Platform env vars are part of the app spec itself. There's no separate step that "pushes secrets" the way the droplet's CD workflow does; Terraform's `env {}` blocks (`terraform/modules/app-platform/main.tf`) *are* how this app's secrets get set.

```
                    ┌──────────────────────┐
  terraform apply   │  DigitalOcean API +  │   creates/updates the digitalocean_app spec
  (env vars, build/ │   Cloudflare API     │   (env vars, build/run commands, domains)
   run commands,    │                      │   + Cloudflare CNAME records
   domains, sizing) │                      │
 ──────────────────▶│                      │
                    └───────────┬──────────┘
                                │ App Platform detects a spec change and
                                │ builds + deploys automatically as part of apply
                                ▼
                    ┌──────────────────────┐
                    │   App Platform         │◀── ALSO redeploys automatically on every
                    │   comprobify-web-staging│    push to the `staging` branch — this path
                    └──────────────────────┘    never touches Terraform at all (code-only)
```

Two things can each independently trigger a deploy, and neither depends on the other:
1. **A code-only push to `staging`** (via `release-staging.yml` fast-forwarding it on a tag push — see `docs/deployment.md`'s branching strategy) — App Platform's Autodeploy builds and deploys whatever's on the branch. Terraform is never invoked.
2. **A Terraform apply that changes the app spec** (env var value, build/run command, domain, instance size) — this itself causes App Platform to redeploy, using whatever code is *currently* on the watched branch. Terraform's `apply` call blocks waiting for that deploy to actually succeed, and fails (tainting the resource) if it can't — see the trigger note under "CI/CD" below for why this matters for *when* `terraform.yml` runs.

A code deploy can never accidentally change infra config; a Terraform apply always redeploys current code when the spec changes, but never ships code that isn't already on the branch.

---

## Tools used, briefly

| Tool | What it is | What it does here |
|---|---|---|
| **Terraform** | Infrastructure-as-code CLI (HashiCorp) | Reads `.tf` files describing what the App Platform app spec and DNS records *should* look like and makes reality match. Tracks everything it manages in a state file. |
| **DigitalOcean (DO)** | Cloud provider | Hosts the App Platform app. |
| **App Platform** | DO's PaaS offering | Builds and runs this repo directly from its GitHub source — no VM to manage, no container registry to push to by hand. Handles TLS cert issuance/renewal for its custom domains automatically. |
| **DO Spaces** | DO's S3-compatible object storage | Used for exactly one thing here: storing Terraform's state file remotely. Same bucket the `comprobify` API repo's Terraform uses, different state key — see "Remote state" below. |
| **Cloudflare** | DNS service | Owns `comprobify.com`'s DNS. For this app, DNS-only (no proxy) — see "The App Platform module" below for why. |
| **GitHub Actions** | CI/CD automation | Runs `terraform.yml` (this doc) and `release-staging.yml` (app-code releases, see `docs/deployment.md`) — two separate workflows for two separate concerns. |

---

## Prerequisites

### Accounts / tokens

| What | Where to get it | Used for |
|---|---|---|
| DigitalOcean API token, dedicated to this repo's pipeline | DO dashboard → API → Generate New Token (Apps Read/Write, Projects Read/Write, VPC Read scopes only) — not reused from the `comprobify` API repo's own token | Terraform's `digitalocean` provider |
| Cloudflare API token, dedicated to this repo's pipeline | Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom, scoped to the `comprobify.com` zone only, `Zone:DNS:Edit` + `Zone:Zone:Read` | Terraform's `cloudflare` provider |
| DO Spaces access key, scoped to the shared state bucket | DO dashboard → API → Spaces Keys | Terraform remote state backend |

No SSH key pair is needed — there's no droplet to authenticate into.

### Local tools (macOS)

```bash
brew install hashicorp/tap/terraform
terraform -version        # pin/confirm against the required_version in terraform/*/main.tf

brew install doctl         # optional — handy for `doctl apps tier instance-size list`
doctl auth init
```

Terraform only ever runs on your laptop or the GitHub Actions runner (`hashicorp/setup-terraform`) — never anywhere in the deployed app itself, since there's no server for it to run on.

---

## Repo layout

```
terraform/
├── modules/
│   └── app-platform/              # shared module: digitalocean_app + DNS records
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── environments/
│   └── staging/
│       ├── main.tf                 # calls the app-platform module with staging's variables
│       ├── backend.tf              # staging's own remote state target
│       ├── variables.tf            # typed inputs — non-secret vars carry defaults, secrets don't
│       ├── outputs.tf
│       └── terraform.tfvars        # non-secret values only — see the file's own header comment
```

`environments/production` doesn't exist yet — see "What's intentionally still manual" below.

---

## DO Projects — where the resources actually live

Same reasoning as the API repo: a DigitalOcean **Project** is a dashboard-only grouping, not a security boundary. This app's Project is **looked up, not created** — `data "digitalocean_project" { name = "Comprobify ${title(var.environment)}" }` — because the same project already holds the Comprobify API's droplet and the shared Managed Database, each assigned through their own respective flows (not this repo's Terraform). Letting Terraform own the project resource itself would risk config drift on *either* of those triggering an attempt to recreate the whole project.

```hcl
data "digitalocean_project" "this" {
  name = "Comprobify ${title(var.environment)}"
}

resource "digitalocean_project_resources" "this" {
  project   = data.digitalocean_project.this.id
  resources = [digitalocean_app.this.urn]
}
```

---

## Remote state

Reuses the **same** `comprobify-terraform-state` DO Spaces bucket the `comprobify` API repo's Terraform already uses, under a different key so the two states never collide:

```hcl
# environments/staging/backend.tf
terraform {
  backend "s3" {
    endpoints = {
      s3 = "https://nyc3.digitaloceanspaces.com"
    }
    region                      = "us-east-1" # required by the S3 backend syntax, ignored by Spaces
    bucket                      = "comprobify-terraform-state"
    key                         = "staging/comprobify-web/terraform.tfstate"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
```

The API repo uses `staging/comprobify/...`; this repo uses `staging/comprobify-web/...`. One bucket, independent state per key. See `comprobify/docs/terraform-digitalocean-setup.md`'s "Remote state" section for why each `skip_*` flag exists — DO Spaces isn't AWS, and without them `init` fails with a misleading `403 InvalidClientTokenId` that looks like a credentials problem but isn't.

Credentials come from environment variables, never written into a file:

```bash
export AWS_ACCESS_KEY_ID="<Spaces access key, dedicated to this repo>"
export AWS_SECRET_ACCESS_KEY="<Spaces secret key>"
```

> The bucket itself already exists (created once, for the API repo) — nothing to create here, just a dedicated Spaces key for this repo's pipeline.

---

## Provider setup

```hcl
# environments/staging/main.tf
terraform {
  required_version = ">= 1.7"
  required_providers {
    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.40" }
    cloudflare   = { source = "cloudflare/cloudflare", version = "~> 4.0" }
  }
}

provider "digitalocean" {
  token = var.do_token
}

provider "cloudflare" {
  api_token = var.cloudflare_token
}

module "staging" {
  source = "../../modules/app-platform"
  # ... environment, region, domains, and every env var below
}
```

```bash
export TF_VAR_do_token="dop_v1_xxxxx"
export TF_VAR_cloudflare_token="xxxxx"
```

---

## The App Platform module (what actually gets created)

One module (`terraform/modules/app-platform`), currently used by one environment.

```hcl
resource "digitalocean_app" "this" {
  spec {
    name   = "comprobify-web-${var.environment}"
    region = var.region                 # App Platform metro slug, e.g. "nyc" — a
                                         # DIFFERENT namespace than the droplet-level
                                         # "nyc1" used for the VPC lookup below

    vpc {
      id = data.digitalocean_vpc.this.id
    }

    domain {
      name = var.domain_primary         # marketing host, e.g. staging.comprobify.com
      type = "PRIMARY"
    }
    domain {
      name = var.domain_alias           # app host, e.g. app-staging.comprobify.com
      type = "ALIAS"                    # same app serves both — src/proxy.ts routes
                                         # by host header, not two separate apps
    }

    service {
      name               = "web"
      instance_count     = 1
      instance_size_slug = var.instance_size_slug

      github {
        repo           = var.github_repo
        branch         = var.branch      # "staging" — automation-owned, see deployment.md
        deploy_on_push = true            # this is Autodeploy
      }

      build_command = var.build_command  # "npm run build:deploy" — must stay explicit,
      run_command   = var.run_command    # "npm run start:deploy" — the buildpack's own
                                          # defaults (`npm run build` / `npm start`) would
                                          # silently skip `prisma generate`/migrations

      env { key = "DATABASE_URL" ... }   # one env{} block per variable — ~19 total,
      env { key = "AUTH_SECRET" ... }    # see modules/app-platform/main.tf for the full list
      # ...
    }
  }
}
```

**VPC is not automatic.** App Platform apps do not auto-join a VPC — without an explicit `vpc.id`, the app has no private network route to the database at all. `data "digitalocean_vpc" { region = var.vpc_datacenter_region }` looks up the *default* VPC for a datacenter-level region (`nyc1`), which is where the database and the API's droplet already live — this must stay in sync with wherever those actually are, or the app silently loses its private route to the database.

**Every env var is its own `env {}` block**, each with a `type` (`SECRET` vs `GENERAL`) and a `scope` (`RUN_AND_BUILD_TIME` / `RUN_TIME` / `BUILD_TIME`):
- `type = "SECRET"` — encrypted at rest by App Platform, write-only in the console after creation (same UX tradeoff as GitHub Actions Secrets — see the API repo's doc for the reasoning). Used for `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `CONTEXT_COOKIE_SECRET`, `DATABASE_SSL_CA`, `SENTRY_AUTH_TOKEN`, `MAILGUN_API_KEY`, `COMPROBIFY_ADMIN_SECRET`.
- `type = "GENERAL"` — plain text, for values with no real secrecy benefit (`DATABASE_SSL`, `COMPROBIFY_API_URL`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` — DSNs are write-only credential-*adjacent* values, not full credentials — `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `MAILGUN_DOMAIN`, `MAILGUN_FROM`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_APP_URL`).
- `scope` matters because App Platform actually enforces it: `SENTRY_AUTH_TOKEN` is `BUILD_TIME` only (used solely by the Sentry Turbopack plugin during `next build`, never read at runtime — no reason to expose it to the running process). `DATABASE_SSL`/`DATABASE_SSL_CA` are `RUN_TIME` only (migrations and the app's own DB client both run at process startup/request time, never during the build, which has no network path to the database at all — see `docs/deployment.md`). Almost everything else is `RUN_AND_BUILD_TIME` — including `DATABASE_URL` itself, even though nothing actually *connects* to the database at build time: `prisma generate` only reads `schema.prisma`, and the schema's `datasource` block references `env("DATABASE_URL")`, so Prisma's generate step needs the variable to exist as a string, even though it never uses the value. `next_public_app_env` is `RUN_AND_BUILD_TIME` specifically because it's inlined into the client bundle at build time **and** read server-side at request time by `src/lib/seo.ts`'s `robots.ts`/`sitemap.ts` — getting the scope wrong there would silently break one or the other.

**Cloudflare DNS is deliberately unproxied**, unlike the API's `api-staging` record:

```hcl
resource "cloudflare_record" "primary" {
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(var.domain_primary, ".${var.cloudflare_zone_name}")
  type    = "CNAME"
  content = local.app_ingress_hostname   # digitalocean_app.this.default_ingress, scheme trimmed
  proxied = false
  ttl     = 1
}
# cloudflare_record.alias — same shape, for domain_alias
```

App Platform re-verifies each custom domain's CNAME on every deploy as part of its own cert issuance/renewal. With Cloudflare's proxy in front, App Platform would see Cloudflare's proxy IP instead of resolving through to itself — a documented, common failure mode connecting Cloudflare-hosted domains to App Platform. Consequence: these two domains don't get Cloudflare's WAF/DDoS layer the way `api-staging` (proxied, in front of the droplet) does.

---

## First-time setup, step by step

1. Install prerequisites (above).
2. Create the dedicated DO API token and Cloudflare API token (see Prerequisites table for exact scopes).
3. Generate a Spaces access key scoped to the shared `comprobify-terraform-state` bucket (it already exists — created for the API repo).
4. In your own terminal (never paste real token/key values into a chat, commit, or anywhere outside your local shell/GitHub Secrets):
   ```bash
   cd terraform/environments/staging

   export TF_VAR_do_token="<dedicated DO token>"
   export TF_VAR_cloudflare_token="<dedicated Cloudflare token>"
   export AWS_ACCESS_KEY_ID="<Spaces access key>"
   export AWS_SECRET_ACCESS_KEY="<Spaces secret key>"

   # every other TF_VAR_* the module needs (see modules/app-platform/variables.tf's
   # "secret app-level env vars" section) — database_url, auth_secret, encryption_key,
   # context_cookie_secret, database_ssl_ca, sentry_auth_token, mailgun_api_key,
   # comprobify_admin_secret
   ```
5. `terraform init` — downloads providers, connects to remote state.
6. `terraform plan` — review before applying. First run should show a full "create" plan for the app, project assignment, and both DNS records. **Read this output before typing yes.**
7. `terraform apply`, confirm with `yes`. First apply creates the app and triggers its first build/deploy — watch this closely; an app with no VPC/network access configured correctly will build fine but fail to reach the database at runtime.
8. Verify: `terraform output live_url` and `terraform output default_ingress`; `curl -I https://staging.comprobify.com` once DNS propagates (near-instant for an unproxied DNS-only CNAME).
9. Confirm both custom domains show as verified/cert-issued in the App Platform dashboard (Settings → Domains) — this can lag DNS propagation by a minute or two on first apply.

Repeating this for `environments/production` means creating that directory (mirroring `environments/staging`), its own `backend.tf` state key, its own domain vars, and its own `production` GitHub Environment with its own dedicated tokens — see "What's intentionally still manual" below.

---

## CI/CD (GitHub Actions)

One workflow: `.github/workflows/terraform.yml`. Unlike the API repo, there's no second "app deploy" workflow to split infra credentials from app secrets across two GitHub Environments — Terraform *is* what sets this app's secret env vars (via the module's `env {}` blocks), so the same job needs both `DO_TOKEN`/`CLOUDFLARE_TOKEN` (to authenticate the providers) and every app secret (to populate those blocks) in one `terraform apply`.

**Trigger: push to `staging` (path-filtered to `terraform/**`), not push to `main`.** This is a deliberate difference from the API repo's equivalent workflow, which triggers on `main`. Reason: this app's `digitalocean_app` resource couples "infra config" (build/run commands, env vars) with "which branch's code to build" (`github.branch = "staging"`) into one resource — Terraform's create/update call blocks waiting for App Platform to actually deploy that code, and fails (tainting the resource) if it can't. Triggering on `main` would mean a PR changing both `terraform/**` and `package.json` together (e.g. renaming an npm script a `run_command` depends on) could apply the new spec against whatever's still on `staging` — which hasn't caught up yet, since `staging` only moves via the tagged release process (`release-staging.yml`). This is exactly what caused a chain of failed deployments during this app's initial Terraform rollout. `release-staging.yml`'s only job ends with `git push origin staging` (nothing after it), so triggering directly on that push guarantees `staging` has already been fast-forwarded before Terraform ever touches the app, while still only running when `terraform/**` actually changed. (An intermediate version triggered on `release-staging.yml` completing via `workflow_run` — that preserved ordering too, but `workflow_run` can't path-filter, so it ran on every single release regardless of whether `terraform/**` changed.)

```yaml
on:
  push:
    branches: [staging]
    paths: ['terraform/**']
  workflow_dispatch:
    inputs:
      action:
        type: choice
        options: [apply, destroy]
        default: apply

env:
  TF_VAR_do_token: ${{ secrets.DO_TOKEN }}
  TF_VAR_cloudflare_token: ${{ secrets.CLOUDFLARE_TOKEN }}
  TF_VAR_database_url: ${{ secrets.DATABASE_URL }}
  # ...every other TF_VAR_* app secret
  AWS_ACCESS_KEY_ID: ${{ secrets.TERRAFORM_SPACES_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.TERRAFORM_SPACES_SECRET_ACCESS_KEY }}

jobs:
  plan:
    environment: staging
    steps: [checkout, setup-terraform, init, plan (or plan -destroy)]
  apply:
    needs: plan
    environment: staging
    steps: [checkout, setup-terraform, init, apply -auto-approve (or destroy -auto-approve)]
```

**All 10 secrets** (`DO_TOKEN`, `CLOUDFLARE_TOKEN`, and the 8 `TF_VAR_*` app secrets) live in the `staging` GitHub Environment — dedicated, freshly-minted credentials for this repo's pipeline, not reused from the API repo's own tokens.

**`TERRAFORM_SPACES_ACCESS_KEY_ID`/`TERRAFORM_SPACES_SECRET_ACCESS_KEY` are repository secrets, not Environment secrets** — there's only one correct value (this repo's dedicated Spaces key), and every job needs it regardless of which Environment it declares.

**Manual `workflow_dispatch` supports both `apply` (default) and `destroy`**, so a teardown or an ad-hoc apply outside the normal release cadence can run through this same audited pipeline instead of requiring local Terraform CLI access. `destroy` is only ever reachable via explicit manual dispatch, never the automatic push trigger.

For the app-code release path itself (tag → `release-staging.yml` → fast-forward `staging` → App Platform Autodeploy), see `docs/deployment.md`'s "Branching strategy" and "CI/CD pipeline" sections — that part is unchanged by anything in this document.

---

## Day-2 operations

**Destroy staging:**
```bash
cd terraform/environments/staging
terraform destroy
```
Tears down the App Platform app and both Cloudflare DNS records — everything this repo's Terraform manages. **Does not touch the shared database or the Comprobify API's droplet** — those are external to this config entirely, managed by other Terraform (the database) or the `comprobify` repo's own Terraform (the droplet). A destroy here really does mean "this app, gone" — nothing else in the shared `Comprobify Staging` Project is affected.

**Recreate it:**
```bash
terraform apply
```
Unlike the droplet repo, there's no follow-up "push compose files and rewrite `.env`" step — env vars are part of the app spec itself, so the very same `apply` that creates the app also sets every env var and triggers App Platform's first build/deploy of whatever's currently on the `staging` branch. Confirm the new deploy succeeded and DNS/cert verification completed in the App Platform dashboard.

**Resize:**
Change `instance_size_slug` in `terraform.tfvars` (verify the value against `doctl apps tier instance-size list` first — DO has renamed these before), `terraform plan` to confirm the change, `terraform apply`.

**Rotating a secret (e.g. `ENCRYPTION_KEY`, `AUTH_SECRET`, `COMPROBIFY_ADMIN_SECRET`):**

Update the value in the `staging` GitHub Environment's secret, then **manually trigger `terraform.yml`** (`workflow_dispatch`) — the automatic push trigger is path-filtered to `terraform/**`, and a secret value change touches no tracked file, so it will **not** fire the workflow on its own. This is easy to miss: rotating a secret in GitHub and assuming it's live is wrong until an `apply` actually runs. Once applied, Terraform diffs the new value against state, updates that `env {}` block on the app spec, and App Platform redeploys with the new value.

**`ENCRYPTION_KEY` is a special case, and rotating it here is not enough on its own.** It's a single static AES-256-GCM key, not versioned — every existing `TenantApiKey` row was encrypted with the *old* value, so swapping the env var alone makes `decrypt()` fail for every tenant's stored API key the next time `requireContext()` runs. There is no documented re-encryption migration for this in either repo's docs today; treat a real `ENCRYPTION_KEY` rotation as requiring a one-off script that decrypts every row with the old key and re-encrypts with the new one *before* the new value goes live, not as a plain secret swap like `AUTH_SECRET`.

**Troubleshooting a stuck/tainted apply:** if a `terraform apply` fails because App Platform couldn't successfully build/deploy the spec it was given (e.g. a `run_command` typo, or the target branch not having caught up yet — see the trigger note under "CI/CD" above for exactly this failure mode), the resource can end up tainted. Fix the underlying cause (correct the `.tf`/`.tfvars` value, or confirm `staging` has the code the new spec expects), then re-run `apply` — there's no droplet-style "destroy and recreate from scratch" needed for this; App Platform's own deploy history in the dashboard shows exactly which attempt failed and why.

---

## What's intentionally still manual

- The DO Spaces bucket used for state storage (chicken-and-egg, shared with the `comprobify` API repo, already exists).
- The Managed PostgreSQL database and the Comprobify API's own droplet — both provisioned and managed by infrastructure outside this repo's Terraform entirely.
- `ENCRYPTION_KEY` rotation's data re-encryption step (see "Day-2 operations" above) — no script or documented procedure for this exists in this repo yet; it would need to be written before ever rotating this value against real tenant data.
- **Production** — `terraform/environments/production` doesn't exist yet. Provisioning it means: a new environment directory mirroring `staging` (own `backend.tf` state key, own `terraform.tfvars` with production's domains), a `production` GitHub Environment with its own dedicated `DO_TOKEN`/`CLOUDFLARE_TOKEN`/app secrets (never reused from staging's), and uncommenting `release-production.yml`'s trigger (see `docs/deployment.md`'s "Production status" section) — none of that is automated by anything in this repo today.
