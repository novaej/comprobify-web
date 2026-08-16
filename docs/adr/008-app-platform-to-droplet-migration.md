# ADR-008: Move Hosting from DigitalOcean App Platform to a Droplet

**Status:** Accepted
**Date:** 2026-08-16

## Context

This app ran on DigitalOcean App Platform (a PaaS), with `staging.comprobify.com`/`app-staging.comprobify.com` pointed at it via Cloudflare CNAME records. Those records had to stay **unproxied** (`proxied = false`, DNS-only): App Platform re-verifies each custom domain's CNAME on every deploy as part of its own cert issuance/renewal, and a Cloudflare proxy in front makes App Platform resolve to Cloudflare's proxy IP instead of itself, breaking that verification — a documented, common failure mode connecting Cloudflare-hosted domains to App Platform.

The consequence: this app got none of Cloudflare's WAF/DDoS/bot-mitigation layer, unlike the Comprobify API's own `api-staging.comprobify.com`, which runs on a droplet behind a fully proxied Cloudflare record with a network-level firewall restricting inbound traffic to Cloudflare's own IP ranges.

Two ways to close that gap were considered:

**Option A — keep App Platform, work around the cert conflict.** Upload a Cloudflare Origin CA certificate as a custom cert on the App Platform domain (removing App Platform's need to self-verify via CNAME), flip Cloudflare's proxy on, and set the zone's SSL/TLS mode to Full (strict). This gets Cloudflare's WAF/DDoS/bot layer in front of the custom domain — but App Platform still exposes a default public ingress hostname (`*.ondigitalocean.app`) that resolves to the same app regardless of custom-domain DNS, and App Platform has no equivalent of a droplet's network-level firewall to block direct requests to it. Closing that residual gap would require an app-layer workaround: a Cloudflare-injected shared-secret header, checked in `src/proxy.ts` on every request — weaker than a network-level block, and adds a secret to rotate and a new code path to maintain.

**Option B — move to a droplet**, mirroring the Comprobify API's own setup (`comprobify/terraform/modules/droplet`): Docker + Caddy + Terraform-provisioned firewall/reserved-IP/DNS, deployed via a separate SSH-based CD workflow. A droplet has no cert-verification conflict with Cloudflare's proxy, and — unlike App Platform — exposes no default public ingress a request could use to bypass Cloudflare; the `digitalocean_firewall` resource restricts inbound 80/443 to Cloudflare's own IP ranges at the network level, which Option A could only approximate at the application level.

## Decision

**Option B.** This app now runs on a DigitalOcean droplet (`terraform/modules/droplet`), with both custom domains resolving as Cloudflare **A** records, `proxied = true`. See `docs/terraform-digitalocean-setup.md` for the full setup and `docs/deployment.md`/`docs/deployment-reference-staging.md` for the release pipeline and current config.

Structural changes this required:

- **App secrets/env vars are no longer part of the Terraform spec.** App Platform's `env {}` blocks meant Terraform itself set every secret as part of the app resource; a droplet has no such mechanism, so `.github/workflows/deploy-staging.yml` (new — this app previously had no app-deploy workflow at all, since App Platform's Autodeploy watched the branch directly) writes `/opt/comprobify-web/.env` over SSH on every deploy, sourced from the `staging` GitHub Environment's Secrets and Variables.
- **`NEXT_PUBLIC_*` values and `SENTRY_AUTH_TOKEN` are passed as Docker `--build-arg`s**, not runtime env vars — they're needed during `next build` (client-bundle inlining, source-map upload), which now happens inside the image build rather than on App Platform's own build step.
- **Migrations still run via `start:deploy` at process start, not at build time** — previously because App Platform's build phase had no DB network path, now because the GitHub Actions runner building the Docker image isn't on the droplet's VPC or in the database's Trusted Sources either. Same conclusion, different underlying reason.
- **A separate SSH key pair per environment.** The API repo's own droplet setup reuses one SSH key pair across staging and production; this repo deliberately does not follow that shortcut, generating an independent key per environment so a leaked staging key can't reach production (see `docs/terraform-digitalocean-setup.md`'s "SSH access model").
- **`terraform.yml` triggers on push to `main`** (path-filtered to `terraform/**`), matching the API repo's own workflow — infra changes apply on merge, independent of the app release cadence, since Terraform here never touches app code or app secrets.

## Consequences

### Positive
- Both custom domains get Cloudflare's WAF/DDoS/bot-mitigation layer, matching the API's own droplet.
- No default public ingress hostname exists to bypass Cloudflare — the network-level firewall genuinely closes the gap Option A could only approximate.
- Consistent architecture with the Comprobify API repo — the same Terraform module shape, the same Docker/Caddy/CD pattern, easier for anyone who already knows one repo's infra to work on the other's.

### Negative
- **New operational ownership.** OS patching (`unattended-upgrades`, mitigated but not eliminated), Docker image builds, and container restarts (`restart: unless-stopped`) are now this repo's responsibility — App Platform handled all of this. There is no zero-downtime deploy strategy today; a `docker compose up -d` restart has a brief gap.
- **The cheapest droplet tier will likely need resizing.** The API's own droplet needed a resize off its equivalent $4/mo starting tier after hitting OOM/swapping under real load; a Next.js SSR process plus Prisma is likely at least as memory-hungry. A 1G swap file is provisioned from day one as a backstop, not a substitute for right-sizing once real usage is observed.
- **The Docker image is larger than necessary for now.** `Dockerfile` deliberately does not use Next.js's `output: "standalone"` mode for this first migration, to minimize new failure surface — it copies the full `node_modules` runtime image through and reuses the exact `build:deploy`/`start:deploy` scripts App Platform already ran. See `NEXT_STEPS.md`.
- **A forwarded-IP header assumption needs re-verification.** `src/lib/client-forwarding.ts`'s `extractForwardedIp()` was written assuming App Platform's ingress set `X-Forwarded-For` with the real client as the first entry — never confirmed even then. Caddy now sits in front instead and forwards the resolved client IP as its own `X-Real-Client-IP` header (same convention the API's own Caddy-fronted droplet uses); `X-Forwarded-For` behind Caddy may not carry what this function expects. Currently harmless — `INTERNAL_SERVICE_SECRET` ships unset by default, so this path is inactive — but must be checked before that secret is ever turned on for real. See `NEXT_STEPS.md`.
