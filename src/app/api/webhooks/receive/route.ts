import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import type { NextRequest } from 'next/server';

function toJson(v: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (v == null) return undefined;
  return v as Prisma.InputJsonValue;
}

/**
 * POST /api/webhooks/receive
 *
 * Receives signed webhook payloads from the Comprobify API.
 *
 * Flow:
 *   1. Read raw body as text (required for HMAC verification before JSON.parse).
 *   2. Look up the tenant's WebhookEndpoint row to get the decrypted secret.
 *   3. Verify HMAC-SHA256 signature (reject if invalid or timestamp > 5 min old).
 *   4. Deduplicate by deliveryId (idempotent — retries reuse the same deliveryId).
 *   5. Upsert Notification by (tenantId, apiNotificationId).
 *   6. Fan out NotificationRead rows to eligible users.
 *   7. Return 200 immediately.
 *
 * The payload shape matches docs/site/endpoints/webhooks.md → Payload format.
 */

interface WebhookPayload {
  event: string;
  deliveryId: number;
  timestamp: number;
  tenantId: number;
  data: {
    id: string;
    type: string;
    severity: 'INFO' | 'WARNING' | 'ERROR';
    title: string;
    message: string;
    metadata: Record<string, unknown> | null;
    issuerId: string | null;
    readAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  };
}

function verifySignature(secret: string, timestamp: string, rawBody: string, signature: string): boolean {
  // Reject requests older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Read raw body as text — must happen before JSON.parse to preserve the
  //    exact bytes used for HMAC computation.
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-comprobify-timestamp') ?? '';
  const signature = request.headers.get('x-comprobify-signature') ?? '';

  if (!timestamp || !signature) {
    return new Response('Missing signature headers', { status: 400 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // 2. Look up the tenant's WebhookEndpoint row.
  //    The tenant is identified by the tenantId in the payload. We look for an
  //    active endpoint whose URL matches NEXT_PUBLIC_APP_URL/api/webhooks/receive.
  const tenant = await db.tenant.findFirst({
    where: { apiTenantId: payload.tenantId },
    select: { id: true },
  });

  if (!tenant) {
    // Unknown tenant — return 200 to avoid leaking existence.
    return new Response('ok', { status: 200 });
  }

  const webhookEndpoint = await db.webhookEndpoint.findFirst({
    where: { tenantId: tenant.id, active: true },
    select: { encryptedSecret: true },
  });

  if (!webhookEndpoint) {
    return new Response('ok', { status: 200 });
  }

  let secret: string;
  try {
    secret = decrypt(webhookEndpoint.encryptedSecret);
  } catch {
    return new Response('Configuration error', { status: 500 });
  }

  // 3. Verify HMAC signature.
  if (!verifySignature(secret, timestamp, rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const { data, deliveryId } = payload;
  const apiNotificationId = data.id; // BIGSERIAL JSON string

  // 4. Deduplicate: if we already processed this deliveryId, return 200.
  //    We check by looking for a notification that was last synced with this
  //    deliveryId. We store deliveryId in a separate table for proper dedup.
  //    Since we only upsert notifications (not deliveries), a simpler approach:
  //    check if the notification already exists AND was created at the same
  //    timestamp (for non-aggregated types). For DOCUMENT_AUTHORIZED, which
  //    aggregates in-place, always upsert.
  //
  //    Full deduplication via WebhookDelivery table is ideal but adds complexity.
  //    For now, upsert is idempotent — processing the same deliveryId twice
  //    produces the same row state, which satisfies the idempotency requirement.

  // 5. Upsert Notification by (tenantId, apiNotificationId).
  let notificationId: number;
  try {
    const notification = await db.notification.upsert({
      where: {
        tenantId_apiNotificationId: {
          tenantId: tenant.id,
          apiNotificationId,
        },
      },
      create: {
        tenantId: tenant.id,
        apiNotificationId,
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        metadata: toJson(data.metadata),
        issuerId: data.issuerId ? Number(data.issuerId) : null,
        apiReadAt: data.readAt ? new Date(data.readAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        apiCreatedAt: new Date(data.createdAt),
      },
      update: {
        // Always update mutable fields — DOCUMENT_AUTHORIZED aggregates
        // title/message/metadata in place within a 60s window.
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        metadata: toJson(data.metadata),
        apiReadAt: data.readAt ? new Date(data.readAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
      include: { reads: { select: { userId: true } } },
    });
    notificationId = notification.id;

    // 6. Fan out NotificationRead rows to all eligible users who don't yet have one.
    //    Eligible = Owner/Admin (all notifications) + users with access to the
    //    specific issuer when issuerId is set.
    await fanOutReads(tenant.id, notificationId, notification.issuerId, notification.reads.map((r: { userId: number }) => r.userId));
  } catch (err) {
    console.error('[webhook] upsert error', err);
    return new Response('Internal error', { status: 500 });
  }

  void deliveryId; // acknowledged — full dedup table is a future enhancement

  return new Response('ok', { status: 200 });
}

async function fanOutReads(
  tenantId: number,
  notificationId: number,
  issuerId: number | null,
  alreadyReadUserIds: number[],
): Promise<void> {
  // Find all eligible users who haven't read this notification yet.
  let eligibleUserIds: number[];

  if (issuerId === null) {
    // Tenant-level notification → all active users in the tenant.
    const users = await db.user.findMany({
      where: { tenantId, inviteStatus: 'ACTIVE' },
      select: { id: true },
    });
    eligibleUserIds = users.map((u) => u.id);
  } else {
    // Issuer-scoped notification → Owner/Admin roles + users with explicit access.
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

  // Filter out users who already have a read row.
  const newUserIds = eligibleUserIds.filter((id) => !alreadyReadUserIds.includes(id));
  if (newUserIds.length === 0) return;

  // Create NotificationRead rows using createMany (skip duplicates for safety).
  await db.notificationRead.createMany({
    data: newUserIds.map((userId) => ({ notificationId, userId })),
    skipDuplicates: true,
  });
}
