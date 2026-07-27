import 'server-only';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';

const STATUS_BY_ERROR_CODE: Record<string, string> = {
  ACCOUNT_SUSPENDED: 'SUSPENDED',
  ACCOUNT_PAST_DUE: 'PAST_DUE',
};

// When the API rejects a write with ACCOUNT_SUSPENDED or ACCOUNT_PAST_DUE,
// update our local Tenant.status so the matching banner (SuspendedBanner /
// PastDueBanner) appears on subsequent page loads without an extra API call.
export async function syncTenantStatusFromError(tenantId: string, err: ApiError): Promise<void> {
  const status = STATUS_BY_ERROR_CODE[err.code];
  if (!status) return;
  await db.tenant.update({ where: { id: tenantId }, data: { status } }).catch(() => {});
}

// The above sync is one-directional (it only ever writes SUSPENDED/PAST_DUE) —
// nothing clears it back once the underlying condition resolves. That's an
// accepted gap for SUSPENDED (admin-lifted, rare), but PAST_DUE is designed to
// be self-resolving (ADR-025): a tenant pays and activateIfLinked flips them
// back to ACTIVE on the API side with no admin step. Call this wherever a
// Server Component already fetches a fresh ApiTenantInfo.status (e.g.
// getCurrentTenant()) to reconcile the local mirror for free — no extra API call.
export async function reconcileTenantStatus(
  tenantId: string,
  localStatus: string,
  apiStatus: string,
): Promise<void> {
  if (localStatus === apiStatus) return;
  await db.tenant.update({ where: { id: tenantId }, data: { status: apiStatus } }).catch(() => {});
}
