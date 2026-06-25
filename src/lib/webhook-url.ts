/**
 * The fixed in-app notification receive URL, derived from NEXT_PUBLIC_APP_URL.
 * Returns null if the env var isn't configured (e.g. local dev without it set).
 */
export function getCanonicalWebhookUrl(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  return appUrl ? `${appUrl}/api/webhooks/receive` : null;
}

/**
 * Mirrors `comprobify/src/validators/webhook-endpoint.validator.js`'s
 * `isURL({ protocols: ['https'], require_tld: true, require_protocol: true })`
 * check on POST/PATCH /v1/webhooks. NEXT_PUBLIC_APP_URL=http://localhost:3000
 * (the local dev default) fails both the protocol and TLD requirements, so
 * the API rejects registration with VALIDATION_FAILED — this lets the UI
 * detect that case ahead of time instead of surfacing a raw API error.
 */
export function isPubliclyReachableHttpsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false;
  return parsed.hostname.includes('.');
}
