import 'server-only';

// Headers forwarded to the Comprobify API on BFF-proxied public calls.
// X-Internal-Service-Secret now serves two independent consumers on the API
// side (comprobify's ADR-035), with opposite fail modes:
//   - src/middleware/trusted-forwarded-ip.js: optional-feeling — only
//     overrides req.ip with X-Forwarded-Visitor-Ip when the secret matches;
//     a missing/wrong secret there just leaves req.ip resolution unchanged.
//   - src/middleware/require-internal-service.js: a hard gate on
//     POST /v1/register, /recover, /resend-verification, and /verify-email,
//     every subscription/payment mutation, and (comprobify 6f6e7df) POST
//     /v1/tenants/promote plus every agreement route (GET /v1/agreements*,
//     GET/POST /v1/tenants/agreements*) — fails CLOSED (403
//     INTERNAL_SERVICE_ONLY) without a valid secret, regardless of whether a
//     visitor IP was ever resolved.
// So the secret must be sent whenever it's configured, independent of
// whether forwardedIp is present — see buildClientForwardingHeaders below.

export interface ClientForwardingInfo {
  forwardedIp?: string;
  userAgent?: string;
}

// Reads the header Caddy actually sets on requests reaching this app
// (deploy/caddy/Caddyfile: `header_up X-Real-Client-IP {client_ip}`, where
// {client_ip} is Caddy's own trusted_proxies/client_ip_headers-resolved
// value — verified against Cloudflare's real edge IP ranges, not the raw
// TCP peer). This function used to read X-Forwarded-For instead, an
// assumption carried over from the old App Platform hosting and never
// empirically confirmed even then — Caddy's reverse_proxy doesn't populate
// X-Forwarded-For with the trusted client IP the way that assumed, so it
// silently never worked once this app moved behind Caddy (NEXT_STEPS.md #1,
// now resolved). A wrong/missing value here only affects the optional
// IP-override feature (see the module comment above) — it doesn't affect
// whether register/recover/resend-verification/verify-email succeed at
// all, since those now depend only on the secret.
export function extractForwardedIp(headers: Headers): string | undefined {
  const value = headers.get('x-real-client-ip');
  return value?.trim() || undefined;
}

// INTERNAL_SERVICE_SECRET must match the Comprobify API's own env var of the
// same name (config.internalServiceSecret). The secret is sent whenever it's
// configured, regardless of whether a forwardedIp was resolved — unlike the
// IP itself, it's now load-bearing for requireInternalService (see module
// comment above), not just an optional IP-forwarding nicety. Left unset,
// account creation/recovery/activation calls to the API fail outright with
// 403 INTERNAL_SERVICE_ONLY once the API side has this gate deployed.
export function buildClientForwardingHeaders(info: ClientForwardingInfo): Record<string, string> {
  const headers: Record<string, string> = {};
  if (info.userAgent) headers['User-Agent'] = info.userAgent;
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (secret) {
    headers['X-Internal-Service-Secret'] = secret;
    if (info.forwardedIp) headers['X-Forwarded-Visitor-Ip'] = info.forwardedIp;
  }
  return headers;
}
