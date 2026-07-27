import 'server-only';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';

// Tenant.status is a display-only cache of the API's real tenant status —
// it exists purely so [locale]/layout.tsx can render SuspendedBanner/
// PastDueBanner without an extra API call on every page load. It is NEVER a
// security boundary: requireContext() never gates anything on it, and every
// write the API actually blocks (SUSPENDED/PAST_DUE) is enforced API-side by
// require-not-suspended.js/require-past-due.js, not by anything read here.
//
// writeTenantStatus() is the only place that writes this column — both
// public functions below go through it, so there is exactly one write path
// to reason about, not two independently-evolving ones.
async function writeTenantStatus(tenantId: string, status: string): Promise<void> {
  await db.tenant.update({ where: { id: tenantId }, data: { status } }).catch(() => {});
}

const STATUS_BY_ERROR_CODE: Record<string, string> = {
  ACCOUNT_SUSPENDED: 'SUSPENDED',
  ACCOUNT_PAST_DUE: 'PAST_DUE',
};

// When the API rejects a write with ACCOUNT_SUSPENDED or ACCOUNT_PAST_DUE,
// update the local mirror so the matching banner appears on the tenant's next
// page load — call this from a Server Action's catch block, where only the
// error code (not a fresh ApiTenantInfo.status) is available.
export async function syncTenantStatusFromError(tenantId: string, err: ApiError): Promise<void> {
  const status = STATUS_BY_ERROR_CODE[err.code];
  if (!status) return;
  await writeTenantStatus(tenantId, status);
}

// Corrects the mirror using a status the caller already has fresh in hand
// (e.g. from getCurrentTenant()) — this is what actually clears SUSPENDED/
// PAST_DUE back out once the underlying condition resolves, since
// syncTenantStatusFromError only ever writes toward those two values and
// nothing else would otherwise unwind it (see CLAUDE.md Common Mistake #45).
// Call this wherever a Server Component already fetches a fresh
// ApiTenantInfo.status for its own reason — no extra API call needed.
export async function reconcileTenantStatus(
  tenantId: string,
  localStatus: string,
  apiStatus: string,
): Promise<void> {
  if (localStatus === apiStatus) return;
  await writeTenantStatus(tenantId, apiStatus);
}
