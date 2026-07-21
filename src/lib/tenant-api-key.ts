import 'server-only';
import { db } from '@/lib/db';

/**
 * Resolves the TenantApiKey row the web app itself authenticates with.
 *
 * Two things matter here and both used to be wrong:
 *
 * 1. **Environment must match the tenant's.** The API's
 *    `require-matching-environment.js` middleware rejects a key whose
 *    `environment` differs from `tenant.sandbox` with a 401
 *    `API_KEY_ENV_MISMATCH` (it guards `GET /v1/tenants/me` and every
 *    issuer-resolving route via `resolve-issuer.js`). A sandbox key on a
 *    promoted tenant authenticates for nothing useful.
 *
 * 2. **Selection must be deterministic.** A bare `findFirst({ isActive: true })`
 *    has no ordering, so once a user mints a second key for Postman the app
 *    could silently start signing its own requests with it. Pinning to the
 *    oldest matching key keeps self-service key creation from ever hijacking
 *    the app's own authentication — and lets `/api-keys` mark exactly which
 *    row the app is using (the API refuses to revoke the key that authenticates
 *    the revoke request itself: `SELF_REVOCATION_FORBIDDEN`).
 */
export function findAppApiKeyRow(tenantId: string, environment: string) {
  return db.tenantApiKey.findFirst({
    where: { tenantId, isActive: true, environment },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}
