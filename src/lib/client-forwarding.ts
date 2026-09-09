import 'server-only';

// Headers forwarded to the Comprobify API on BFF-proxied public calls.
// X-Internal-Service-Secret now serves two independent consumers on the API
// side (comprobify's ADR-035), with opposite fail modes:
//   - src/middleware/trusted-forwarded-ip.js: optional-feeling — only
//     overrides req.ip with X-Forwarded-Visitor-Ip when the secret matches;
//     a missing/wrong secret there just leaves req.ip resolution unchanged.
//   - src/middleware/require-internal-service.js: a hard gate on
//     POST /v1/register, /recover, /resend-verification, and /verify-email —
//     fails CLOSED (403 INTERNAL_SERVICE_ONLY) without a valid secret,
//     regardless of whether a visitor IP was ever resolved.
// So the secret must be sent whenever it's configured, independent of
// whether forwardedIp is present — see buildClientForwardingHeaders below.

export interface ClientForwardingInfo {
  forwardedIp?: string;
  userAgent?: string;
}

// Written under the old App Platform hosting, assuming its ingress set
// X-Forwarded-For with the real client IP as the first (leftmost) entry —
// never empirically confirmed even then. Now Caddy sits in front instead
// (deploy/caddy/Caddyfile) and forwards the resolved client IP as its own
// X-Real-Client-IP header (same convention the Comprobify API's own
// Caddy-fronted droplet uses) — X-Forwarded-For behind Caddy may not carry
// what this function expects at all. Re-verify against Caddy's actual
// forwarded headers (NEXT_STEPS.md #1). A wrong/missing value here only
// affects the optional IP-override feature (see the module comment above) —
// it no longer affects whether register/recover/resend-verification/
// verify-email succeed at all, since those now depend only on the secret.
export function extractForwardedIp(headers: Headers): string | undefined {
  const raw = headers.get('x-forwarded-for');
  if (!raw) return undefined;
  const first = raw.split(',')[0]?.trim();
  return first || undefined;
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
