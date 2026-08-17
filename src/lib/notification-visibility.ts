import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { readCtxCookie } from '@/lib/context-cookie';

/**
 * Query-time visibility filter for Notification.findMany/count, scoped to the
 * currently active issuer (the comprobify_ctx cookie), not just role-based
 * eligibility: Owner/Admin see tenant-level notifications plus the active
 * issuer's; other roles are further restricted to issuers they hold
 * UserIssuerAccess to. Returns a Prisma `OR` array to embed in the caller's
 * `where`, or `undefined` when unrestricted (no active issuer selected yet —
 * e.g. mid-onboarding, before the cookie is set).
 *
 * This does not touch NotificationRead — see CLAUDE.md Common Mistake #51.
 */
export async function visibleNotificationOr(
  tenantId: string,
  userId: string,
  role: string,
  activeApiIssuerId: string | null,
): Promise<Prisma.NotificationWhereInput[] | undefined> {
  if (role === 'Owner' || role === 'Admin') {
    if (!activeApiIssuerId) return undefined;
    return [{ issuerId: null }, { issuerId: activeApiIssuerId }];
  }

  const access = await db.userIssuerAccess.findMany({
    where: { tenantId, userId },
    select: { issuer: { select: { apiIssuerId: true } } },
  });
  const apiIssuerIds = access.map((a) => a.issuer.apiIssuerId);

  const or: Prisma.NotificationWhereInput[] = [{ issuerId: null }];
  if (activeApiIssuerId) {
    if (apiIssuerIds.includes(activeApiIssuerId)) or.push({ issuerId: activeApiIssuerId });
  } else if (apiIssuerIds.length > 0) {
    or.push({ issuerId: { in: apiIssuerIds } });
  }
  return or;
}

/**
 * Resolves the currently active issuer's API-side id (Notification.issuerId
 * is API-side, see CLAUDE.md Common Mistake #20) from the comprobify_ctx
 * cookie. Returns null if no cookie is set or it points at an issuer outside
 * this tenant.
 */
export async function getActiveApiIssuerId(tenantId: string): Promise<string | null> {
  const ctxCookie = await readCtxCookie();
  if (!ctxCookie) return null;
  const issuer = await db.issuer.findFirst({
    where: { id: ctxCookie.issuerId, tenantId },
    select: { apiIssuerId: true },
  });
  return issuer?.apiIssuerId ?? null;
}
