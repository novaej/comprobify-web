# Terraform + DigitalOcean — Infrastructure Setup

Reference for how this app's DigitalOcean compute layer is provisioned and deployed: a droplet managed by Terraform, application code deployed via a separate GitHub Actions CI/CD pipeline. This is the living "how does our infrastructure actually work" document. `docs/deployment.md` covers what's unaffected by hosting details (branching strategy, environment variable *meanings*, migrations, the release/versioning workflow).

This repo's setup mirrors the `comprobify` (API) repo's own `docs/terraform-digitalocean-setup.md` closely — if you've read that one, most of it applies here directly. This doc calls out only what differs.

**What lives on DigitalOcean, managed by this repo's Terraform:** one droplet per environment (`comprobify-web-staging`, live; `comprobify-web-production`, written but never applied — see "What's intentionally still manual" below), each with its own reserved IP, firewall, and two Cloudflare DNS records.

**What doesn't:** the Postgres database (DigitalOcean Managed Database, a Basic-plan cluster **shared with the Comprobify API** — provisioned and managed outside this repo's Terraform entirely, see `docs/deployment.md`'s "Database setup" section), Sentry, Mailgun, and the Comprobify API's own droplet (`comprobify/terraform`). All are grouped into the same `Comprobify Staging` DO Project as this app purely for dashboard purposes — see "DO Projects" below.

---

## Overview of the flow

Two independent pipelines, same shape as the API repo:

1. **Infrastructure pipeline (Terraform)** — rare, reviewed changes: create/resize/destroy the droplet, change a firewall rule, update a DNS record. `.github/workflows/terraform.yml`.
2. **Application pipeline (GitHub Actions CD)** — frequent: every push to `staging` builds a Docker image, pushes it to GHCR, and tells the droplet to pull + restart the containers. `.github/workflows/deploy-staging.yml`. Never invokes Terraform.

```
                    +----------------------+
  terraform apply   |  DigitalOcean API +  |   creates/updates droplet,
  (rare, reviewed)  |   Cloudflare API     |   firewall, SSH key, DNS records
 ------------------>|                      |
                    +----------+-----------+
                               | cloud-init (first boot only:
                               | hardening, nothing app-specific)
                               v
                    +----------------------+
                    |   Droplet (Docker)    |
  docker compose    |  +--------+ +------+  |
  pull && up -d     |  | caddy  | | web  |  |<-- pulls image from GHCR
  (every app push)  |  +--------+ +------+  |
                    +----------------------+
        ^
        | SSH, triggered by GitHub Actions on push to staging
```

A code deploy can never accidentally recreate the droplet; an infra change can never accidentally ship new app code.

---

## Tools used, briefly

Same tools as the API repo's droplet, minus RabbitMQ/Redis/worker (this app has neither) — see `comprobify/docs/terraform-digitalocean-setup.md`'s own table for the full explanation of each. The one meaningful difference: **GHCR (GitHub Container Registry)** here holds `ghcr.io/novaej/comprobify-web`, a separate image from the API's `ghcr.io/novaej/comprobify`.

---

## Prerequisites

### Accounts / tokens

| What | Where to get it | Used for |
|---|---|---|
| DigitalOcean API token, dedicated to this repo's pipeline | DO dashboard → API → Generate New Token (read+write) | Terraform's `digitalocean` provider — stored as `DO_TOKEN` in the `staging-infra` GitHub Environment |
| Cloudflare API token, dedicated to this repo's pipeline | Cloudflare dashboard → My Profile → API Tokens → Create Token → Custom, scoped to the `comprobify.com` zone only, `Zone:DNS:Edit` + `Zone:Zone:Read` | Terraform's `cloudflare` provider — stored as `CLOUDFLARE_TOKEN` in the `staging-infra` GitHub Environment |
| DO Spaces access key, scoped to the shared state bucket | DO dashboard → API → Spaces Keys | Terraform remote state backend — stored as repository secrets (not Environment-scoped, see "CI/CD" below) |
| SSH key pair, dedicated to this repo's droplet | Generate below — a **separate** pair per environment, never shared between staging and production (see "SSH access model" below) | Access for the unprivileged deploy user cloud-init creates — private half stored as `INFRA_SSH_PRIVATE_KEY` in the `staging` GitHub Environment (not `staging-infra` — see "CI/CD" below for the split) |

```bash
ssh-keygen -t ed25519 -C "comprobify-web-deploy-staging" -f ~/.ssh/comprobify_web_deploy_staging
```

### Local tools (macOS)

```bash
brew install hashicorp/tap/terraform
terraform -version        # pin/confirm against the required_version in terraform/*/main.tf

brew install doctl         # optional — DO CLI, handy for ad-hoc checks
doctl auth init
```

Terraform only ever runs on your laptop or the GitHub Actions runner (`hashicorp/setup-terraform`) — never on the droplet itself.

---

## Repo layout

```
terraform/
├── modules/
│   └── droplet/                   # shared module: droplet + firewall + DNS + cloud-init
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── cloud-init.yaml.tftpl
├── environments/
│   ├── staging/
│   │   ├── main.tf                 # calls the droplet module with staging's variables
│   │   ├── backend.tf              # staging's own remote state target
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfvars        # non-secret values only
│   └── production/                 # same shape as staging/ — see "What's intentionally still manual" below
│       ├── main.tf
│       ├── backend.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── terraform.tfvars        # ssh_public_key is still a REPLACE_ME placeholder until the first apply
```

`environments/production` exists in the repo (mirrors `environments/staging` exactly, own state key, own domains/deploy user) but has never been `terraform apply`'d — no droplet, DNS record, or GitHub Environment exists for it yet. See "What's intentionally still manual" below and `docs/production-readiness-checklist.md` for the current status.

---

## DO Projects — where the resources actually live

A DigitalOcean **Project** is a dashboard-only grouping (which droplets/databases show up together in the UI) — it is **not** a network or security boundary. `Comprobify Staging` already exists and already holds the Comprobify API's own droplet and the shared Managed Database, each assigned through their own respective flows — never let Terraform manage the project resource itself, or config drift on any of those could trigger an attempt to recreate the whole project.

```hcl
data "digitalocean_project" "this" {
  name = "Comprobify ${title(var.environment)}"
}

resource "digitalocean_project_resources" "this" {
  project   = data.digitalocean_project.this.id
  resources = [digitalocean_droplet.this.urn]
}
```

---

## Remote state

A DO **Spaces** bucket (S3-compatible), shared with the `comprobify` API repo under a different key so the two states never collide:

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

The API repo uses `staging/comprobify/...`; this repo uses `staging/comprobify-web/...`. Credentials come from environment variables, never written into a file:

```bash
export AWS_ACCESS_KEY_ID="<Spaces access key, dedicated to this repo>"
export AWS_SECRET_ACCESS_KEY="<Spaces secret key>"
```

> The bucket itself already exists — nothing to create here, just a dedicated Spaces key for this repo's pipeline.

---

## Provider setup

```hcl
# environments/staging/main.tf
terraform {
  required_version = ">= 1.7"
  required_providers {
    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.40" }
    cloudflare   = { source = "cloudflare/cloudflare", version = "~> 4.0" }
    http         = { source = "hashicorp/http", version = "~> 3.4" }
  }
}

provider "digitalocean" {
  token = var.do_token
}

provider "cloudflare" {
  api_token = var.cloudflare_token
}
```

```bash
export TF_VAR_do_token="dop_v1_xxxxx"
export TF_VAR_cloudflare_token="xxxxx"
```

**`terraform/modules/droplet` declares its own `required_providers` block too** (same sources/versions as the root), not just the root module — a child module that uses provider resources without its own explicit `source` falls back to the legacy `hashicorp/<name>` registry namespace, which doesn't exist for `digitalocean`/`cloudflare` and fails `terraform init` with `Failed to query available provider packages`.

---

## The droplet module (what actually gets created)

```hcl
resource "digitalocean_ssh_key" "infra" {
  name       = "comprobify-web-infra-${var.environment}"
  public_key = var.ssh_public_key
}

resource "digitalocean_droplet" "this" {
  name        = "comprobify-web-${var.environment}"
  region      = var.region       # "nyc1" — same datacenter as the shared database
  size        = var.droplet_size # "s-1vcpu-1gb" for staging
  image       = var.image_slug   # plain "ubuntu-24-04-x64" — see note below
  ssh_keys    = [digitalocean_ssh_key.infra.id]
  resize_disk = false            # a resize that grows disk can never shrink back
  user_data   = templatefile("${path.module}/cloud-init.yaml.tftpl", { ... })
}

resource "digitalocean_reserved_ip" "this" {
  region = var.region
}
resource "digitalocean_reserved_ip_assignment" "this" {
  ip_address = digitalocean_reserved_ip.this.ip_address
  droplet_id = digitalocean_droplet.this.id
}

data "http" "cloudflare_ipv4" {
  url = "https://www.cloudflare.com/ips-v4"
}

resource "digitalocean_firewall" "this" {
  name        = "comprobify-web-${var.environment}-fw"
  droplet_ids = [digitalocean_droplet.this.id]

  inbound_rule { protocol = "tcp"; port_range = "443"; source_addresses = local.cloudflare_ipv4_ranges }
  inbound_rule { protocol = "tcp"; port_range = "80";  source_addresses = local.cloudflare_ipv4_ranges }
  inbound_rule { protocol = "tcp"; port_range = "22";  source_addresses = ["0.0.0.0/0"] }
  outbound_rule { protocol = "tcp"; port_range = "1-65535"; destination_addresses = ["0.0.0.0/0", "::/0"] }
  outbound_rule { protocol = "udp"; port_range = "1-65535"; destination_addresses = ["0.0.0.0/0", "::/0"] }
}

resource "cloudflare_record" "primary" {
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(var.domain_primary, ".${var.cloudflare_zone_name}")
  type    = "A"
  content = digitalocean_reserved_ip.this.ip_address
  proxied = true
  ttl     = 1
}
# cloudflare_record.alias — same shape, for domain_alias
```

**Two Cloudflare A records**, `primary` (`staging.comprobify.com`) and `alias` (`app-staging.comprobify.com`), both pointing at the same reserved IP, both `proxied = true` — the same droplet/container serves both hosts, `src/proxy.ts`'s host-header logic routes between marketing and app content, not two separate deployments. Both are fully proxied through Cloudflare, getting its WAF/DDoS/bot layer, matching the Comprobify API's own `api-staging.comprobify.com`.

**80/443 restricted to Cloudflare's live IPv4 ranges only** (fetched via the `http` data source, not hardcoded — avoids the firewall silently going stale). Bypassing this by hitting the droplet's raw IP directly would skip Cloudflare's proxy — and its WAF/DDoS protection — entirely.

**Reserved IP is a standalone resource**, decoupled from the droplet's own lifecycle — created without `droplet_id` set inline, with a separate `digitalocean_reserved_ip_assignment` holding the droplet pointer, so a droplet replacement (any `user_data`/cloud-init edit, an SSH key rotation) only ever touches the assignment, never recreates the reserved IP. This is what DNS and the `DROPLET_IP` GitHub Secret point at — never the droplet's own ephemeral `droplet_ip`.

**`image_slug` is a plain OS image (`ubuntu-24-04-x64`), not a DO Marketplace app image** — the cheapest droplet tier's 10GB disk doesn't fit several Marketplace images (including the Docker one), so Docker is installed via cloud-init instead.

**A 1G swap file is provisioned on first boot** (`cloud-init.yaml.tftpl`) — a backstop against a transient memory spike (a burst of concurrent server-rendered pages, a large PDF preview request) triggering an OOM kill, not a substitute for right-sizing the droplet once real usage is observed.

**No worker/Redis/RabbitMQ/cron section in cloud-init** — this app has none of those; it's a single Next.js container plus Caddy.

---

## SSH access model

**SSH is open to the internet (`0.0.0.0/0`) on this droplet, deliberately.** Key-only auth already means brute-forcing in is not possible regardless of who can reach port 22; defense against everything else is layered at the identity/privilege level instead:

- **No root login at all** (`PermitRootLogin no`).
- **A single unprivileged deploy user**, `cpfywebdeploy9x` (deliberately not a guessable name like `deploy`/`admin`/`ubuntu`, and deliberately distinct from the comprobify API repo's own `cpfydeploy9x`) — the only account SSH will accept. Member of the `docker` group only, **no sudo access at all**.
- **`MaxAuthTries 3` / `LoginGraceTime 30`** — caps auth attempts and how long an unauthenticated connection can be held open.
- **`fail2ban`** — bans an IP outright after repeated failed attempts.

If genuine root access is ever needed, DigitalOcean's browser-based Droplet Console (Droplet → Access → Launch Droplet Console) gives a real root shell independent of sshd entirely.

**A separate SSH key pair per environment, not one shared pair.** `comprobify_web_deploy_staging` is dedicated to the staging droplet; when `environments/production` is provisioned, generate a fully independent `comprobify_web_deploy_production` rather than reusing staging's. Each private half only ever lives in its own environment's GitHub `INFRA_SSH_PRIVATE_KEY` secret — a leaked staging key then can't reach production.

---

## The application stack: `docker-compose.yml`, Caddy, and env vars

One file per droplet, committed to the repo. Lives at `deploy/docker-compose.yml` and `deploy/caddy/Caddyfile` (a directory mount, not a single-file mount — a single-file bind mount pins to that file's inode at container-start time, so a deploy that replaces the host file via unlink+recreate leaves the running container reading the old, now-unlinked inode forever, invisible to `caddy reload`).

```yaml
# deploy/docker-compose.yml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./caddy:/etc/caddy
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [web]

  web:
    image: ghcr.io/novaej/comprobify-web:${IMAGE_TAG:-latest}
    restart: unless-stopped
    env_file: .env
    expose: ["3000"]
    mem_limit: 384m
```

Only two services — no `worker`/`redis`/`rabbitmq` (this app has none of those). `expose` (not `ports`) on `web` means it's reachable from `caddy` over the Compose network but never bound to the host directly.

```
# deploy/caddy/Caddyfile
staging.comprobify.com, app-staging.comprobify.com {
    reverse_proxy web:3000 {
        header_up X-Real-Client-IP {client_ip}
    }
}
```

One block naming **both** hostnames — Caddy requests and renews separate certificates per SNI name automatically, no extra config needed. Caddy's own `trusted_proxies`/`client_ip_headers` global block (Cloudflare's published IP ranges, `CF-Connecting-IP`) is identical to the API repo's own Caddyfile — Caddy requests its own Let's Encrypt certificate automatically on first request, which works sitting behind Cloudflare's proxy since Cloudflare forwards the ACME HTTP-01 challenge through on port 80.

### The Dockerfile — build image vs. runtime image

`Dockerfile` (repo root) is a three-stage build: `deps` (installs full `node_modules`, including dev dependencies — needed for `next build`), `builder` (`npm run build:deploy`, i.e. `prisma generate && next build`), `runner` (copies the built app through, runs as the built-in `node` user, `CMD ["npm", "run", "start:deploy"]`). Not using Next.js's `output: "standalone"` mode — the full `node_modules` runtime image is larger, but it reuses the exact `build:deploy`/`start:deploy` scripts directly. `output: "standalone"` (smaller image, faster cold start) is tracked as a future optimization — see `NEXT_STEPS.md`.

**`NEXT_PUBLIC_*` values, `SENTRY_AUTH_TOKEN`, and `DATABASE_URL` must be passed as Docker build args, not just runtime env vars.** Next.js inlines `NEXT_PUBLIC_*` into the client (and server) bundle during `next build`, and the Sentry webpack/turbopack plugin that uploads source maps only runs during that same build step — neither is read again once the container starts. `DATABASE_URL` is a different case: `src/lib/db.ts` creates the Prisma client eagerly at module scope (`export const db = ... createPrismaClient()`), which parses `DATABASE_URL` with `new URL()` — and Next's build-time page-data collection statically imports every route module, including ones that transitively import `db.ts`, so that module executes during `next build` too, even though nothing actually connects to the database at that point. Missing it fails the build outright with `TypeError: Invalid URL { input: 'undefined' }` on whichever route happens to import `db.ts` first. The Dockerfile declares `ARG`/`ENV` pairs for `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MARKETING_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_RELEASE`, and `DATABASE_URL`; `.github/workflows/deploy-staging.yml`'s `docker build` step passes each via `--build-arg`. Miss one of the `NEXT_PUBLIC_*`/`SENTRY_AUTH_TOKEN`/`SENTRY_RELEASE` ones and the symptom is subtle instead of a hard failure — the app still boots and mostly works, but client-side Sentry silently has no DSN, `robots.ts`/`sitemap.ts` behave as if running in the wrong environment, or (for `SENTRY_RELEASE`) events just stop showing up under any release in the Sentry dashboard, since `.dockerignore` excludes `.git` and there's no CI env var Sentry's own auto-detection recognizes inside a plain Docker build.

### Env vars — Secrets vs. Variables, and how they reach the droplet

`deploy-staging.yml` writes `/opt/comprobify-web/.env` directly over SSH on every deploy, reading from the GitHub `staging` Environment's Secrets and Variables:

- **Secrets** (encrypted, write-only after saving) — for anything credential-shaped: `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `CONTEXT_COOKIE_SECRET`, `DATABASE_SSL_CA`, `SENTRY_AUTH_TOKEN` (build-time only, see above), `MAILGUN_API_KEY`, `COMPROBIFY_ADMIN_SECRET`, `INTERNAL_SERVICE_SECRET`, plus `DROPLET_IP`/`INFRA_SSH_PRIVATE_KEY` (connection details to infrastructure, kept to the stricter default even though an IP alone isn't devastating).
- **Variables** (plain text, visible in the UI) — for everything else: `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MARKETING_URL`, `COMPROBIFY_API_URL`, `DATABASE_SSL`, `MAILGUN_DOMAIN`, `MAILGUN_FROM`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`.

See `docs/deployment.md`'s "Environment variables" section for what each one does.

`terraform.yml` never sets any app secret — it only ever needs `DO_TOKEN`/`CLOUDFLARE_TOKEN` (from the `staging-infra` GitHub Environment, to authenticate the providers) plus the Spaces state-backend credentials (repository secrets). This is a deliberately separate Environment from `staging` — see "CI/CD" below.

---

## First-time setup, step by step

1. Install prerequisites (above).
2. Generate the SSH key pair; paste the public half's content into `ssh_public_key` in `terraform/environments/staging/terraform.tfvars`.
3. Create the dedicated DO API token and Cloudflare API token (see Prerequisites table for exact scopes).
4. Generate a Spaces access key scoped to the shared `comprobify-terraform-state` bucket.
5. Create the `staging-infra` GitHub Environment (Settings → Environments → New environment) and add `DO_TOKEN`/`CLOUDFLARE_TOKEN` as its Secrets. Optionally add a required-reviewer protection rule — this is the gate for infra changes specifically (see "CI/CD" below).
6. In your own terminal (never paste real token/key values into a chat, commit, or anywhere outside your local shell/GitHub Secrets):
   ```bash
   cd terraform/environments/staging
   export TF_VAR_do_token="<dedicated DO token>"
   export TF_VAR_cloudflare_token="<dedicated Cloudflare token>"
   export AWS_ACCESS_KEY_ID="<Spaces access key>"
   export AWS_SECRET_ACCESS_KEY="<Spaces secret key>"
   ```
7. `terraform init` — downloads providers, connects to the remote state backend.
8. `terraform plan` — review before applying. **Read this output before typing yes.**
9. `terraform apply`, confirm with `yes`. Droplet boots, cloud-init hardens it.
10. Verify: `terraform output` shows both `droplet_ip` (ephemeral) and `reserved_ip` (stable — use this one from here on); `ssh -i ~/.ssh/comprobify_web_deploy_staging cpfywebdeploy9x@$(terraform output -raw reserved_ip)` connects; `dig staging.comprobify.com` resolves through Cloudflare once the record propagates.
11. In the DO dashboard: add the reserved IP to the shared Managed Postgres cluster's **Trusted Sources** (Database → Settings → Trusted Sources).
12. Create (or reuse) the `staging` GitHub Environment and add `DROPLET_IP` (the `reserved_ip` output) and `INFRA_SSH_PRIVATE_KEY` (the private half from step 2) to its Secrets, plus the Variables listed in "Env vars" above. This is a **separate** Environment from `staging-infra` — `DO_TOKEN`/`CLOUDFLARE_TOKEN` don't belong here, and none of `staging`'s app secrets belong in `staging-infra`.
13. Run the app deploy workflow once (push to `staging`, or `workflow_dispatch` on `deploy-staging.yml`) — it pushes the compose files, writes `.env`, and starts the containers.
14. Verify: both domains resolve through Cloudflare (proxied); HTTPS works with a browser-trusted cert; `/api/health` responds; log in and load `/dashboard` (proves Trusted Sources was set up correctly).

The same steps against `environments/production` (the directory already exists — see "Repo layout" above) provision production: replace the `REPLACE_WITH_PRODUCTION_SSH_PUBLIC_KEY` placeholder in its `terraform.tfvars` with a **separate** SSH key pair's public half (see "SSH access model" above), create its own `production-infra` GitHub Environment (`DO_TOKEN`/`CLOUDFLARE_TOKEN`) and `production` GitHub Environment (app secrets, `DROPLET_IP`, `INFRA_SSH_PRIVATE_KEY`) — never reused from staging's — then run `terraform apply` and `deploy-production.yml` (uncommenting its guards first, see `docs/production-readiness-checklist.md`) the same way.

---

## CI/CD (GitHub Actions)

Two workflows, gated by path/branch so neither triggers the other.

### Infra workflow — `.github/workflows/terraform.yml`

**Trigger: push to `main` touching `terraform/**`, or manual `workflow_dispatch`.** `terraform apply` is idempotent — it diffs the `.tf`/`.tftpl` files against the last-applied state and only touches what actually changed; a push that doesn't alter any resource's configuration produces a "no changes" plan.

**One real exception: a few resource attributes are Terraform "ForceNew,"** meaning a change destroys and recreates the droplet instead of updating it in place — `user_data` (the cloud-init script) and the SSH key's `public_key`. Thanks to the Reserved IP, this doesn't change the public address the droplet is reachable at, so `DROPLET_IP` and DNS stay untouched across the replacement — but the app still needs redeploying afterward (`deploy-staging.yml`/`deploy-production.yml`), since the new droplet has Docker installed but nothing running yet.

**One workflow, two job pairs — `plan-staging`/`apply-staging` and `plan-production`/`apply-production`** — sharing the same trigger, mirroring the comprobify API repo's own `terraform.yml` exactly:

```yaml
jobs:
  plan-staging:
    if: vars.STAGING_INFRA_ENABLED == 'true'
    environment: staging-infra
    steps: [checkout, setup-terraform, init, plan (or plan -destroy)]
  apply-staging:
    needs: plan-staging
    if: vars.STAGING_INFRA_ENABLED == 'true'
    environment: staging-infra
    steps: [checkout, setup-terraform, init, apply -auto-approve (or destroy -auto-approve)]

  plan-production:
    environment: production-infra
    steps: [checkout, setup-terraform, init, plan (or plan -destroy)]
  apply-production:
    needs: plan-production
    environment: production-infra
    steps: [checkout, setup-terraform, init, apply -auto-approve (or destroy -auto-approve)]
```

Each job's own `TF_VAR_do_token`/`TF_VAR_cloudflare_token`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are set per-step, not in a shared top-level `env:` block, so each job pair only ever resolves its own `<env>-infra` Environment's secret value under that name.

**`DO_TOKEN`/`CLOUDFLARE_TOKEN` live in each environment's own `<env>-infra` GitHub Environment — deliberately separate from `staging`/`production`** (which `deploy-staging.yml`/`deploy-production.yml` use for app secrets, `DROPLET_IP`, and `INFRA_SSH_PRIVATE_KEY`). This is the actual credential/blast-radius boundary between infra and app deploys: a required-reviewer protection rule can be added to either `<env>-infra` Environment alone to gate that environment's infra changes specifically, without also gating the other environment's infra or either environment's app deploys.

**Both `plan` and `apply` declare the same `<env>-infra` Environment, not just `apply`.** GitHub only grants a job access to an Environment's secrets — and only applies that Environment's protection rules — to jobs that declare it. Declaring it on both means a required-reviewer rule added to `staging-infra`/`production-infra` gates `plan` as well as `apply`: you'd approve before seeing the plan's diff, not after reading it. Deliberate trade-off for staying consistent with `deploy-staging.yml`'s single-Environment-per-workflow shape, rather than introducing a second, plan-only Environment just to keep `plan` ungated.

**`TERRAFORM_SPACES_ACCESS_KEY_ID`/`TERRAFORM_SPACES_SECRET_ACCESS_KEY` are repository secrets, not Environment secrets** — there's only one correct value, and every job needs it regardless of which Environment (`staging-infra`/`production-infra`) it declares.

**Manual `workflow_dispatch` supports both `apply` (default) and `destroy`**, so a teardown or an ad-hoc apply outside the normal push trigger can run through this same audited pipeline instead of requiring local Terraform CLI access. `destroy` is only ever reachable via explicit manual dispatch, never the automatic push trigger, and applies to both environments' job pairs identically — there's no per-environment `action` input.

### Toggling staging infra on/off — `STAGING_INFRA_ENABLED`

`plan-staging`/`apply-staging` are gated on `if: vars.STAGING_INFRA_ENABLED == 'true'` — a plain **repository variable** (Settings → Secrets and variables → Actions → Variables tab, not Environment-scoped, since a job's own `if:` is evaluated before its `environment:` context resolves), not a code change, so flipping it needs no PR. `plan-production`/`apply-production` carry no such gate — production always applies. This mirrors the comprobify API repo's own `terraform.yml` toggle exactly.

**As of this writing, `STAGING_INFRA_ENABLED` doesn't exist as a repository variable, so `plan-staging`/`apply-staging` are off by default.** This stops CI from automatically reconciling `terraform/environments/staging` on every `terraform/**`-touching push to `main` — it does **not** destroy or otherwise affect the staging droplet that's currently running. `deploy-staging.yml` (the separate app-deploy pipeline) has no dependency on this variable and keeps shipping tag releases to staging normally. To make a real infra change to staging: set `STAGING_INFRA_ENABLED=true`, let the change land (or `workflow_dispatch` the workflow manually), then decide whether to flip it back off.

**This is a different decision from actually destroying staging's droplet between uses**, which is what the API repo does once its production carries real traffic (its own staging droplet and DB get torn down by hand, recreated only when a change needs validating there — see `comprobify/docs/terraform-digitalocean-setup.md`'s own "Toggling staging infra on/off" section for that full cycle). This repo has only adopted the on/off switch itself, not that destroy-between-uses policy — see `docs/production-readiness-checklist.md`'s "Staging lifecycle once production is live" section for the current state of that separate decision.

### App deploy workflow — `.github/workflows/deploy-staging.yml`

**Trigger: push to `staging`, or manual `workflow_dispatch`.** Builds the Docker image (with the `--build-arg`s described above), pushes it to `ghcr.io/novaej/comprobify-web:${{ github.sha }}`, copies `deploy/docker-compose.yml`/`deploy/caddy/Caddyfile` to the droplet, and SSHs in to write `.env` and restart the stack — same shape as `comprobify/.github/workflows/deploy-staging.yml` (the droplet needing its own separate `docker login` from the runner's, `docker compose exec caddy caddy reload` being necessary because a bind-mounted Caddyfile change is invisible to `docker compose up -d`'s own change detection, etc.).

For the app-code release path itself (tag → `release-staging.yml` → fast-forward `staging`), see `docs/deployment.md`'s "Branching strategy" — that's what triggers `deploy-staging.yml` to run.

---

## Day-2 operations

Same operations as the API repo's droplet — destroy/recreate, resize, SSH key rotation, the "SSH works once then resets" troubleshooting flow — see `comprobify/docs/terraform-digitalocean-setup.md`'s "Day-2 operations" section for the full walkthrough; everything there applies here with `comprobify-web`/`cpfywebdeploy9x`/`comprobify_web_deploy_staging` substituted for `comprobify`/`cpfydeploy9x`/`comprobify_deploy`.

**Rotating `ENCRYPTION_KEY` is not a plain secret swap.** It's a single static AES-256-GCM key, not versioned, so every existing `TenantApiKey` row was encrypted with the old value. See `docs/deployment.md`'s "Day-2 operations" note — there is no documented re-encryption migration for this yet.

---

## What's intentionally still manual

- The DO Spaces bucket used for state storage (chicken-and-egg, shared with the `comprobify` API repo, already exists).
- The Managed PostgreSQL database and the Comprobify API's own droplet — both provisioned and managed by infrastructure outside this repo's Terraform entirely.
- Adding the droplet's reserved IP to the database's Trusted Sources — a manual DO dashboard step for both this repo and the API repo today.
- `ENCRYPTION_KEY` rotation's data re-encryption step — no script or documented procedure exists yet.
- **Production** — the code scaffolding exists (`terraform/environments/production`, the `plan-production`/`apply-production` job pair in `terraform.yml`, `.github/workflows/deploy-production.yml`), but nothing has actually been provisioned: `terraform.tfvars`'s `ssh_public_key` is still a placeholder, no `production-infra` or `production` GitHub Environment exists, and `terraform apply` has never run against this directory. See `docs/production-readiness-checklist.md` for the exact remaining steps — generate a **separate, dedicated** SSH key pair (see "SSH access model" above — do not reuse staging's), create the `production-infra` GitHub Environment (`DO_TOKEN`/`CLOUDFLARE_TOKEN`) and the `production` GitHub Environment (app secrets, `DROPLET_IP`, `INFRA_SSH_PRIVATE_KEY`), then uncomment the disabled triggers on `release-production.yml`/`deploy-production.yml`.
