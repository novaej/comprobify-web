import 'server-only';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';

// When the API returns ACCOUNT_SUSPENDED, update our local Tenant.status so
// the SuspendedBanner appears on subsequent page loads without an extra API call.
export async function syncSuspensionStatus(tenantId: string, err: ApiError): Promise<void> {
  if (err.code !== 'ACCOUNT_SUSPENDED') return;
  await db.tenant.update({ where: { id: tenantId }, data: { status: 'SUSPENDED' } }).catch(() => {});
}
