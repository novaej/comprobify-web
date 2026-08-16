import 'server-only';

// Headers forwarded to the Comprobify API on BFF-proxied calls, so the API can
// see the real visitor's IP/UA instead of this app's own droplet-to-server
// request. Verified against ../comprobify/src/middleware/trusted-forwarded-ip.js:
// it overrides req.ip with X-Forwarded-Visitor-Ip only when X-Internal-Service-Secret
// matches config.internalServiceSecret (process.env.INTERNAL_SERVICE_SECRET) —
// without a matching secret, both headers are ignored and req.ip resolution is
// unchanged, so this stays safe to send even before INTERNAL_SERVICE_SECRET is
// actually set in this app's own deploy env. See NEXT_STEPS.md #1.

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
// forwarded headers before INTERNAL_SERVICE_SECRET is ever set for real
// (NEXT_STEPS.md #1). Nothing depends on this being exactly right yet: a
// wrong/missing value here just means the API keeps resolving req.ip the way
// it does today (see the secret check above), never a behavior regression.
export function extractForwardedIp(headers: Headers): string | undefined {
  const raw = headers.get('x-forwarded-for');
  if (!raw) return undefined;
  const first = raw.split(',')[0]?.trim();
  return first || undefined;
}

// INTERNAL_SERVICE_SECRET must match the Comprobify API's own env var of the
// same name (config.internalServiceSecret) — unset locally/on any deploy that
// hasn't been given the value yet, in which case both headers are simply
// omitted and nothing changes API-side.
export function buildClientForwardingHeaders(info: ClientForwardingInfo): Record<string, string> {
  const headers: Record<string, string> = {};
  if (info.userAgent) headers['User-Agent'] = info.userAgent;
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (info.forwardedIp && secret) {
    headers['X-Forwarded-Visitor-Ip'] = info.forwardedIp;
    headers['X-Internal-Service-Secret'] = secret;
  }
  return headers;
}
