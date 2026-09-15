# Trivy image baseline — 2026-09-15

Full triage record for `docs/production-readiness-checklist.md`'s "Trivy's `node:24-slim`/`caddy:2-alpine` baseline" item — mirrors the level of detail the Comprobify API repo's `docs/security-audit-2026-09-12.md` (finding #5) recorded for its own equivalent base images, so there's a real point of comparison between the two repos rather than just a summary paragraph.

**Methodology:** `trivy image --severity HIGH,CRITICAL --scanners vuln <image>@<digest>`, run locally against the exact digests pinned in `Dockerfile` and `deploy/docker-compose.yml` — the same images `deploy-production.yml`'s Trivy step scans, at the same severity floor. `node:24-slim`'s numbers below were cross-checked against the real `deploy-production.yml` run for the first production deploy (`gh run view 34912258368 --repo novaej/comprobify-web --log`), which scanned the full built app image (`ghcr.io/novaej/comprobify-web:c51e2d3…`) and reported identical debian-layer counts (58, 54 HIGH/4 CRITICAL) — confirming the base image is what's driving the findings, not anything added in this app's own build layers. `caddy:2-alpine` isn't scanned by any workflow today (the deploy workflows only scan the app image they build; Caddy is pulled pre-built, never rebuilt or pushed by this repo) — scanned directly here for completeness, matching that the API repo's own audit covered both images even though only one goes through CI's Trivy step.

Trivy CLI version: 0.74.0. Vulnerability DB current as of scan date.

---

## `node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`

Pinned in all three `Dockerfile` stages (`deps`, `builder`, `runner`).

### Debian 12.15 OS packages — 58 findings (54 HIGH, 4 CRITICAL)

By fix status: 48 `affected` (no patch shipped by Debian yet), 7 `fix_deferred` (Debian has explicitly deferred fixing these for this release), 1 `will_not_fix`, only **2 `fixed`** (a patched package version exists in Debian's repos already — `libpcre2-8-0` — but the pinned digest predates it; adopting it means the `node:24-slim` tag being rebuilt, not something re-pinning our own `Dockerfile` line can do on its own).

| Package | CVE | Severity | Status | Installed | Fixed |
|---|---|---|---|---|---|
| perl-base | CVE-2026-13221 | CRITICAL | affected | 5.36.0-7+deb12u3 | - |
| perl-base | CVE-2026-42496 | CRITICAL | fix_deferred | 5.36.0-7+deb12u3 | - |
| perl-base | CVE-2026-8376 | CRITICAL | affected | 5.36.0-7+deb12u3 | - |
| zlib1g | CVE-2023-45853 | CRITICAL | will_not_fix | 1:1.2.13.dfsg-1 | - |
| bsdutils | CVE-2026-53613 | HIGH | affected | 1:2.38.1-5+deb12u3 | - |
| bsdutils | CVE-2026-76642 | HIGH | affected | 1:2.38.1-5+deb12u3 | - |
| bsdutils | CVE-2026-78408 | HIGH | affected | 1:2.38.1-5+deb12u3 | - |
| bsdutils | CVE-2026-78409 | HIGH | affected | 1:2.38.1-5+deb12u3 | - |
| bsdutils | CVE-2026-78410 | HIGH | affected | 1:2.38.1-5+deb12u3 | - |
| gzip | CVE-2026-41992 | HIGH | fix_deferred | 1.12-1 | - |
| libacl1 | CVE-2026-54369 | HIGH | fix_deferred | 2.3.1-3 | - |
| libblkid1 | CVE-2026-53613 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libblkid1 | CVE-2026-76642 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libblkid1 | CVE-2026-78408 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libblkid1 | CVE-2026-78409 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libblkid1 | CVE-2026-78410 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libmount1 | CVE-2026-53613 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libmount1 | CVE-2026-76642 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libmount1 | CVE-2026-78408 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libmount1 | CVE-2026-78409 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libmount1 | CVE-2026-78410 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libpcre2-8-0 | CVE-2026-86145 | HIGH | **fixed** | 10.42-1 | 10.42-1+deb12u1 |
| libpcre2-8-0 | CVE-2026-89161 | HIGH | **fixed** | 10.42-1 | 10.42-1+deb12u1 |
| libsmartcols1 | CVE-2026-53613 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libsmartcols1 | CVE-2026-76642 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libsmartcols1 | CVE-2026-78408 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libsmartcols1 | CVE-2026-78409 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libsmartcols1 | CVE-2026-78410 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libsystemd0 | CVE-2026-16742 | HIGH | fix_deferred | 252.39-1~deb12u2 | - |
| libtinfo6 | CVE-2025-69720 | HIGH | affected | 6.4-4 | - |
| libudev1 | CVE-2026-16742 | HIGH | fix_deferred | 252.39-1~deb12u2 | - |
| libuuid1 | CVE-2026-53613 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libuuid1 | CVE-2026-76642 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libuuid1 | CVE-2026-78408 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libuuid1 | CVE-2026-78409 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| libuuid1 | CVE-2026-78410 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| mount | CVE-2026-53613 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| mount | CVE-2026-76642 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| mount | CVE-2026-78408 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| mount | CVE-2026-78409 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| mount | CVE-2026-78410 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| ncurses-base | CVE-2025-69720 | HIGH | affected | 6.4-4 | - |
| ncurses-bin | CVE-2025-69720 | HIGH | affected | 6.4-4 | - |
| perl-base | CVE-2026-42497 | HIGH | fix_deferred | 5.36.0-7+deb12u3 | - |
| perl-base | CVE-2026-48962 | HIGH | affected | 5.36.0-7+deb12u3 | - |
| perl-base | CVE-2026-57432 | HIGH | affected | 5.36.0-7+deb12u3 | - |
| perl-base | CVE-2026-57433 | HIGH | affected | 5.36.0-7+deb12u3 | - |
| perl-base | CVE-2026-9538 | HIGH | fix_deferred | 5.36.0-7+deb12u3 | - |
| util-linux | CVE-2026-53613 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux | CVE-2026-76642 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux | CVE-2026-78408 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux | CVE-2026-78409 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux | CVE-2026-78410 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux-extra | CVE-2026-53613 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux-extra | CVE-2026-76642 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux-extra | CVE-2026-78408 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux-extra | CVE-2026-78409 | HIGH | affected | 2.38.1-5+deb12u3 | - |
| util-linux-extra | CVE-2026-78410 | HIGH | affected | 2.38.1-5+deb12u3 | - |

### Bundled npm CLI dependencies — 4 findings (4 HIGH, 0 CRITICAL)

The `node:24-slim` image ships npm's own CLI, which bundles a small dependency tree independent of this app's own `node_modules` (already tracked separately under the checklist's `npm audit` item). All 4 here are `fixed` upstream — same story as `libpcre2-8-0` above, waiting on the base image tag to be rebuilt against them, not this app's `package.json`.

| Package | CVE | Severity | Status | Installed | Fixed |
|---|---|---|---|---|---|
| brace-expansion | CVE-2026-14257 | HIGH | fixed | 5.0.7 | 5.0.8, 3.0.3, 2.1.3, 1.1.17 |
| brace-expansion | CVE-2026-69152 | HIGH | fixed | 5.0.7 | 1.1.18, 2.1.4, 3.0.6, 5.0.9 |
| ip-address | CVE-2026-69192 | HIGH | fixed | 10.2.0 | 10.3.1 |
| tar | CVE-2026-73566 | HIGH | fixed | 7.5.19 | 7.5.21 |

---

## `caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648`

Pinned in `deploy/docker-compose.yml`. Not scanned by any GitHub Actions workflow today — this app's `deploy-*.yml` only Trivy-scans the image it builds (the Next.js app), never Caddy, which is pulled pre-built and never pushed to this repo's own registry.

### Alpine 3.23.5 OS packages — 23 findings (23 HIGH, 0 CRITICAL)

**All 23 are `fixed` upstream** — unlike `node:24-slim`'s mostly-`affected` Debian layer, Alpine has already shipped patches for every one of these; the gap is purely that the pinned digest predates them. A real digest bump (not a code change) would resolve the whole table.

| Package | CVE | Severity | Status | Installed | Fixed |
|---|---|---|---|---|---|
| c-ares | CVE-2026-33630 | HIGH | fixed | 1.34.6-r0 | 1.34.8-r0 |
| curl | CVE-2026-11352 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| curl | CVE-2026-11586 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| curl | CVE-2026-12064 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| curl | CVE-2026-5773 | HIGH | fixed | 8.19.0-r0 | 8.20.0-r0 |
| curl | CVE-2026-6276 | HIGH | fixed | 8.19.0-r0 | 8.20.0-r0 |
| curl | CVE-2026-8286 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| curl | CVE-2026-8458 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| curl | CVE-2026-8925 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| curl | CVE-2026-8927 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| curl | CVE-2026-9547 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcrypto3 | CVE-2026-14456 | HIGH | fixed | 3.5.7-r0 | 3.5.8-r0 |
| libcurl | CVE-2026-11352 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcurl | CVE-2026-11586 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcurl | CVE-2026-12064 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcurl | CVE-2026-5773 | HIGH | fixed | 8.19.0-r0 | 8.20.0-r0 |
| libcurl | CVE-2026-6276 | HIGH | fixed | 8.19.0-r0 | 8.20.0-r0 |
| libcurl | CVE-2026-8286 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcurl | CVE-2026-8458 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcurl | CVE-2026-8925 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcurl | CVE-2026-8927 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libcurl | CVE-2026-9547 | HIGH | fixed | 8.19.0-r0 | 8.22.0-r0 |
| libssl3 | CVE-2026-14456 | HIGH | fixed | 3.5.7-r0 | 3.5.8-r0 |

### `usr/bin/caddy` (compiled Go binary) — 17 findings (17 HIGH, 0 CRITICAL)

Go standard library and module dependencies compiled into the `caddy` binary itself. **All 17 are `fixed` upstream too** — same story as the Alpine layer: newer module versions exist, but only take effect once the Caddy project rebuilds and republishes the `caddy:2-alpine` image against them.

| Package | CVE | Severity | Status | Installed | Fixed |
|---|---|---|---|---|---|
| golang.org/x/crypto | CVE-2026-56854 | HIGH | fixed | v0.52.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-46600 | HIGH | fixed | v0.55.0 | 0.56.0 |
| golang.org/x/text | CVE-2026-56852 | HIGH | fixed | v0.37.0 | 0.39.0 |
| google.golang.org/grpc | CVE-2026-84304 | HIGH | fixed | v1.81.0 | 1.83.1 |
| google.golang.org/grpc | CVE-2026-84445 | HIGH | fixed | v1.81.0 | 1.82.2, 1.83.2, 1.85.0-dev.0.20260825072537-93e31b48545e |
| google.golang.org/grpc | GHSA-hrxh-6v49-42gf | HIGH | fixed | v1.81.0 | 1.82.1 |
| stdlib | CVE-2026-27145 | HIGH | fixed | v1.26.3 | 1.25.11, 1.26.4 |
| stdlib | CVE-2026-33818 | HIGH | fixed | v1.26.3 | 1.25.13, 1.26.6, 1.27.0-rc.3 |
| stdlib | CVE-2026-39821 | HIGH | fixed | v1.26.3 | 1.25.13, 1.26.6, 1.27.0-rc.3 |
| stdlib | CVE-2026-39822 | HIGH | fixed | v1.26.3 | 1.25.12, 1.26.5, 1.27.0-rc.2 |
| stdlib | CVE-2026-42504 | HIGH | fixed | v1.26.3 | 1.25.11, 1.26.4 |
| stdlib | CVE-2026-46600 | HIGH | fixed | v1.26.3 | 1.26.6, 1.27.0-rc.3 |
| stdlib | CVE-2026-56853 | HIGH | fixed | v1.26.3 | 1.25.13, 1.26.6, 1.27.0-rc.3 |
| stdlib | CVE-2026-56858 | HIGH | fixed | v1.26.3 | 1.25.13, 1.26.6, 1.27.0-rc.3 |
| stdlib | CVE-2026-56859 | HIGH | fixed | v1.26.3 | 1.25.13, 1.26.6, 1.27.0-rc.3 |
| stdlib | CVE-2026-56860 | HIGH | fixed | v1.26.3 | 1.25.13, 1.26.6, 1.27.0-rc.3 |
| stdlib | CVE-2026-56862 | HIGH | fixed | v1.26.3 | 1.25.13, 1.26.6, 1.27.0-rc.3 |

---

## Comparison against the API repo's own baseline

The API repo's `docs/security-audit-2026-09-12.md` finding #5 found the same overall shape against its own pins (`node:20-slim` — 84 HIGH/CRITICAL findings; `caddy:2-alpine` — 40 HIGH/CRITICAL findings): mostly Debian OS packages genuinely unpatched/deferred upstream, plus a Caddy binary needing a rebuild to pick up already-fixed Go dependencies. This app's numbers are smaller (`node:24-slim`'s newer Debian 12.15 base vs. the API's `node:20-slim`, and a more recently-pulled `caddy:2-alpine` digest) but the *pattern* is identical: nothing here is something either repo's own code can fix by editing a version pin — it's either waiting on Debian/Alpine/Caddy to publish a rebuilt image, or (Debian's `affected`/`will_not_fix` majority) not fixed by the upstream maintainer at all yet.

## Decision

Matches the API repo's own conclusion: keep both `deploy-staging.yml`/`deploy-production.yml`'s Trivy step **informational** (`exit-code: '0'`) rather than blocking deploys on findings nobody can act on today. Re-run this same scan the next time either `node:24-slim` or `caddy:2-alpine`'s pinned digest is bumped (see `docs/production-readiness-checklist.md`) — if the counts meaningfully drop, that's the point to reconsider flipping `exit-code` to `'1'`, paired with a `.trivyignore` for whatever residual findings are accepted going forward.
