'use server';

import { Prisma } from '@prisma/client';
import { requireContext, requirePermission } from '@/lib/context';
import {
  listNotifications,
  markNotificationRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreference,
} from '@/lib/api';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/errors';

/** Cast API metadata (unknown JSON object) to Prisma's InputJsonValue. */
function toJson(v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (v == null) return undefined;
  return v as Prisma.InputJsonValue;
}

/**
 * Mark a notification as read for the current user.
 *
 * - Creates a NotificationRead row for this user.
 * - When ALL eligible users have read it, calls POST /api/notifications/:id/read
 *   so the API marks it globally read and stops returning it in future responses.
 */
export async function markNotificationReadAction(notificationId: number): Promise<void> {
  const ctx = await requireContext({ skipIssuer: true });
  const userId = ctx.user.id;
  const tenantId = ctx.tenant.id;

  // 1. Upsert per-user read row.
  await db.notificationRead.upsert({
    where: { notificationId_userId: { notificationId, userId } },
    create: { notificationId, userId },
    update: {},
  });

  // 2. Check if this notification is already marked read at API level.
  const notification = await db.notification.findUnique({
    where: { id: notificationId },
    include: { reads: { select: { userId: true } } },
  });

  if (!notification || notification.tenantId !== tenantId || notification.apiReadAt) {
    return; // Not our notification or already marked read at API level.
  }

  // 3. Count eligible users for this notification.
  let eligibleCount: number;
  if (notification.issuerId === null) {
    eligibleCount = await db.user.count({ where: { tenantId, inviteStatus: 'ACTIVE' } });
  } else {
    const adminCount = await db.user.count({
      where: { tenantId, role: { in: ['Owner', 'Admin'] }, inviteStatus: 'ACTIVE' },
    });
    const accessCount = await db.userIssuerAccess.count({
      where: { tenantId, issuerId: notification.issuerId },
    });
    // Owners/admins + access users may overlap — use a set via raw query is ideal,
    // but for safety we take the max of the two, knowing createMany skipDuplicates
    // ensures the reads count is the true unique set.
    eligibleCount = Math.max(adminCount, accessCount > 0 ? adminCount + accessCount : adminCount);
    // Simpler: just check if all reads entries match eligible users.
    // We compare reads.length against eligibleCount below.
  }

  // 4. If all eligible users have read it, mark at API level.
  if (notification.reads.length >= eligibleCount) {
    try {
      await markNotificationRead({ apiKey: ctx.apiKey }, notification.apiNotificationId);
      await db.notification.update({
        where: { id: notificationId },
        data: { apiReadAt: new Date() },
      });
    } catch {
      // Non-fatal: the notification stays locally read; will sync on next poll.
    }
  }

  revalidatePath('/', 'layout');
}

/**
 * Catch-up poll: fetch all notifications newer than the most recent one we have.
 * Called on login and periodically as a fallback when webhooks may have been missed.
 *
 * Returns the number of new/updated notifications upserted.
 */
export async function catchUpNotificationsAction(): Promise<{ upserted: number }> {
  const ctx = await requireContext({ skipIssuer: true });
  const tenantId = ctx.tenant.id;

  // Find the highest API notification id we already have.
  const latest = await db.notification.findFirst({
    where: { tenantId },
    orderBy: { apiCreatedAt: 'desc' },
    select: { apiNotificationId: true },
  });

  const sinceId = latest?.apiNotificationId;

  let notifications: Awaited<ReturnType<typeof listNotifications>>['notifications'];
  try {
    const result = await listNotifications({ apiKey: ctx.apiKey }, sinceId);
    notifications = result.notifications;
  } catch {
    return { upserted: 0 };
  }

  if (notifications.length === 0) return { upserted: 0 };

  // Upsert each notification.
  let upserted = 0;
  for (const n of notifications) {
    const existing = await db.notification.upsert({
      where: {
        tenantId_apiNotificationId: { tenantId, apiNotificationId: n.id },
      },
      create: {
        tenantId,
        apiNotificationId: n.id,
        type: n.type,
        severity: n.severity,
        title: n.title,
        message: n.message,
        metadata: toJson(n.metadata),
        issuerId: n.issuerId ? Number(n.issuerId) : null,
        apiReadAt: n.readAt ? new Date(n.readAt) : null,
        expiresAt: n.expiresAt ? new Date(n.expiresAt) : null,
        apiCreatedAt: new Date(n.createdAt),
      },
      update: {
        type: n.type,
        severity: n.severity,
        title: n.title,
        message: n.message,
        metadata: toJson(n.metadata),
        apiReadAt: n.readAt ? new Date(n.readAt) : null,
        expiresAt: n.expiresAt ? new Date(n.expiresAt) : null,
      },
      include: { reads: { select: { userId: true } } },
    });
    // Fan out reads for newly created notifications.
    if (existing) {
      await fanOutReads(tenantId, existing.id, existing.issuerId, existing.reads.map((r: { userId: number }) => r.userId));
    }
    upserted++;
  }

  revalidatePath('/', 'layout');
  return { upserted };
}

/**
 * Get unread notification count for the current user.
 * Used by the notification bell in the nav.
 */
export async function getUnreadCountAction(): Promise<number> {
  const ctx = await requireContext({ skipIssuer: true });
  const userId = ctx.user.id;
  const tenantId = ctx.tenant.id;

  // Count notifications where:
  //   - belongs to this tenant
  //   - not expired
  //   - not marked read at API level
  //   - this user has NOT read it (no NotificationRead row)
  const count = await db.notification.count({
    where: {
      tenantId,
      apiReadAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
      reads: {
        none: { userId },
      },
    },
  });

  return count;
}

/**
 * List notifications for the current user's nav panel.
 * Returns the 20 most recent active notifications with per-user read state.
 */
export async function listNotificationsAction(): Promise<{
  notifications: Array<{
    id: number;
    apiNotificationId: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    metadata: unknown;
    issuerId: number | null;
    readByMe: boolean;
    apiReadAt: Date | null;
    expiresAt: Date | null;
    apiCreatedAt: Date;
  }>;
}> {
  const ctx = await requireContext({ skipIssuer: true });
  const userId = ctx.user.id;
  const tenantId = ctx.tenant.id;

  const notifications = await db.notification.findMany({
    where: {
      tenantId,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { apiCreatedAt: 'desc' },
    take: 20,
    include: {
      reads: {
        where: { userId },
        select: { userId: true },
      },
    },
  });

  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      apiNotificationId: n.apiNotificationId,
      type: n.type,
      severity: n.severity,
      title: n.title,
      message: n.message,
      metadata: n.metadata,
      issuerId: n.issuerId,
      readByMe: n.reads.length > 0 || n.apiReadAt !== null,
      apiReadAt: n.apiReadAt,
      expiresAt: n.expiresAt,
      apiCreatedAt: n.apiCreatedAt,
    })),
  };
}

// ── Preferences ──────────────────────────────────────────────────────────────

/**
 * Fetch the current notification preferences for the tenant.
 * Returns all 6 types; types never explicitly configured default to enabled.
 */
export async function getPreferencesAction(): Promise<{
  preferences: NotificationPreference[];
} | { error: string }> {
  const ctx = await requirePermission('notifications.manage', { skipIssuer: true });
  try {
    const preferences = await getNotificationPreferences({ apiKey: ctx.apiKey });
    return { preferences };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

/**
 * Bulk-upsert one or more notification preferences for the tenant.
 * Send only the types that changed; unmentioned types are left as-is.
 */
export async function updatePreferencesAction(
  prefs: NotificationPreference[],
): Promise<{ preferences: NotificationPreference[] } | { error: string }> {
  const ctx = await requirePermission('notifications.manage', { skipIssuer: true });
  try {
    const preferences = await updateNotificationPreferences({ apiKey: ctx.apiKey }, prefs);
    return { preferences };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function fanOutReads(
  tenantId: number,
  notificationId: number,
  issuerId: number | null,
  alreadyReadUserIds: number[],
): Promise<void> {
  let eligibleUserIds: number[];

  if (issuerId === null) {
    const users = await db.user.findMany({
      where: { tenantId, inviteStatus: 'ACTIVE' },
      select: { id: true },
    });
    eligibleUserIds = users.map((u) => u.id);
  } else {
    const adminUsers = await db.user.findMany({
      where: { tenantId, role: { in: ['Owner', 'Admin'] }, inviteStatus: 'ACTIVE' },
      select: { id: true },
    });
    const accessUsers = await db.userIssuerAccess.findMany({
      where: { tenantId, issuerId },
      select: { userId: true },
    });
    const adminIds = adminUsers.map((u) => u.id);
    const accessIds = accessUsers.map((a) => a.userId);
    eligibleUserIds = [...new Set([...adminIds, ...accessIds])];
  }

  const newUserIds = eligibleUserIds.filter((id) => !alreadyReadUserIds.includes(id));
  if (newUserIds.length === 0) return;

  await db.notificationRead.createMany({
    data: newUserIds.map((userId) => ({ notificationId, userId })),
    skipDuplicates: true,
  });
}
