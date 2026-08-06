# Next Steps

Ordered backlog for `comprobify-web`. Items are numbered — complete the highest-priority items first. Remove an item when it ships; renumber the rest.

---

## Feature gaps

### 1. Set `INTERNAL_SERVICE_SECRET` to actually activate visitor-IP forwarding

**Priority: Low — code is done on both sides; this is a one-time deploy-config step, not a coding task.**

Both halves have shipped: the API's `src/middleware/trusted-forwarded-ip.js` (see its CHANGELOG) and this app's `src/lib/client-forwarding.ts`, wired into `acceptAgreementsAction`, `bootstrapTenantAction`, `recoverAccountAction`, `resendVerificationForLinkingAction`/`resendVerificationAction` — see CLAUDE.md's "Forwarding the real visitor IP on BFF-proxied public calls". Until `INTERNAL_SERVICE_SECRET` is actually set to a real, matching value on both sides, the feature stays inactive by design (headers are sent as an omitted/ignored no-op) — no code changes needed to turn it on.

**What's left:**
1. Generate one secret value (same conventions as `ADMIN_SECRET`/`COMPROBIFY_ADMIN_SECRET`).
2. Set `INTERNAL_SERVICE_SECRET` in the Comprobify API's own deploy env, to that value.
3. ✅ Done — `INTERNAL_SERVICE_SECRET` is set as a GitHub Environment secret on this repo's `staging` Environment. Still needs an actual `terraform apply` to take effect: the `terraform/**` wiring for this (module + staging env + `terraform.yml`'s `TF_VAR_internal_service_secret`) only exists on a feature branch so far, not yet merged/tagged/pushed to `staging` — `terraform.yml` only runs on a `staging` push that touches `terraform/**`, or a manual `workflow_dispatch`.
4. Confirm `extractForwardedIp()`'s assumption about App Platform's ingress header (`X-Forwarded-For`, first entry) actually holds — e.g. by temporarily logging the resolved value from a live request and checking it's a real visitor IP, not App Platform's own internal address.
