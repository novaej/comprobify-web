'use server';

import { requirePermission } from '@/lib/context';
import {
  registerWebhookEndpoint,
  deleteWebhookEndpoint,
} from '@/lib/api';
import { createReservedWebhookEndpoint } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { ApiError } from '@/lib/errors';
import { getCanonicalWebhookUrl } from '@/lib/webhook-url';
import { revalidatePath } from 'next/cache';

export type WebhookActionResult = { error: string } | null;

/**
 * Register a webhook endpoint with the Comprobify API and store the encrypted
 * secret in the WebhookEndpoint table.
 *
 * Called during onboarding (auto, with NEXT_PUBLIC_APP_URL) or from the
 * webhook management screen (manual, with a custom URL).
 */
export async function registerWebhookAction(
  url: string,
  eventTypes?: string[],
): Promise<WebhookActionResult> {
  const ctx = await requirePermission('webhooks.manage', { skipIssuer: true });

  try {
    const { endpoint, secret } = await registerWebhookEndpoint(
      { apiKey: ctx.apiKey },
      url,
      eventTypes,
    );

    await db.webhookEndpoint.create({
      data: {
        tenantId: ctx.tenant.id,
        apiEndpointId: endpoint.id,
        url: endpoint.url,
        encryptedSecret: encrypt(secret),
        eventTypes: endpoint.eventTypes,
        active: endpoint.active,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath('/settings/webhooks');
  return null;
}

/**
 * Soft-delete a webhook endpoint (active = false in both API and local DB).
 */
export async function deleteWebhookAction(localId: string): Promise<WebhookActionResult> {
  const ctx = await requirePermission('webhooks.manage', { skipIssuer: true });

  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: localId } });
  if (!endpoint || endpoint.tenantId !== ctx.tenant.id) {
    return { error: 'WEBHOOK_ENDPOINT_NOT_FOUND' };
  }

  // The canonical in-app webhook is now `is_reserved` at the API (comprobify
  // migration 102) — the tenant-facing DELETE /v1/webhooks/:id 404s any
  // reserved row on purpose (same as the API-key equivalent), and there is
  // currently no admin-gated endpoint to deactivate one either (only mint a
  // replacement). Fail with a clear code here rather than a confusing
  // WEBHOOK_ENDPOINT_NOT_FOUND from the API.
  if (endpoint.url === getCanonicalWebhookUrl()) {
    return { error: 'CANONICAL_WEBHOOK_CANNOT_BE_DEACTIVATED' };
  }

  try {
    await deleteWebhookEndpoint({ apiKey: ctx.apiKey }, endpoint.apiEndpointId);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  await db.webhookEndpoint.update({
    where: { id: localId },
    data: { active: false },
  });

  revalidatePath('/settings/webhooks');
  return null;
}

/**
 * List the local WebhookEndpoint rows for the current tenant (active only).
 */
export async function listWebhooksAction(): Promise<{
  endpoints: Array<{
    id: string;
    url: string;
    eventTypes: string[];
    active: boolean;
    createdAt: Date;
  }>;
}> {
  const ctx = await requirePermission('webhooks.manage', { skipIssuer: true });

  const endpoints = await db.webhookEndpoint.findMany({
    where: { tenantId: ctx.tenant.id, active: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, url: true, eventTypes: true, active: true, createdAt: true },
  });

  return { endpoints };
}

/**
 * Register the canonical in-app webhook endpoint for the current tenant, so
 * notifications (document authorized, cert expiry, etc.) arrive in near-real
 * time instead of relying solely on the catch-up poll.
 *
 * Idempotent — a no-op if an active local row for this URL already exists.
 * Minted `is_reserved` through the admin-gated path (comprobify migration
 * 102) — excluded from the tenant's own self-service GET /v1/webhooks
 * listing/budget, same as comprobify-web's own API keys. Reserved endpoints
 * can only be minted, never PATCHed back to active (no admin-gated endpoint
 * for that exists), so re-activating after a prior deactivation mints a
 * fresh reserved row and reuses the same local record rather than accumulating
 * a duplicate — there's no `replaceEndpointId` involved, since that path
 * requires the row being replaced to still be active at the API, which an
 * already-deactivated one by definition isn't.
 */
export async function activateCanonicalWebhookAction(): Promise<WebhookActionResult> {
  const receiveUrl = getCanonicalWebhookUrl();
  if (!receiveUrl) return { error: 'APP_URL_NOT_CONFIGURED' };

  const ctx = await requirePermission('webhooks.manage', { skipIssuer: true });

  const existing = await db.webhookEndpoint.findFirst({
    where: { tenantId: ctx.tenant.id, url: receiveUrl },
  });
  if (existing?.active) return null;

  try {
    const { endpoint, secret } = await createReservedWebhookEndpoint(ctx.tenant.apiTenantId, {
      url: receiveUrl,
      eventTypes: [], // subscribe to all event types
    });

    if (existing) {
      await db.webhookEndpoint.update({
        where: { id: existing.id },
        data: {
          apiEndpointId: endpoint.id,
          encryptedSecret: encrypt(secret),
          eventTypes: endpoint.eventTypes,
          active: endpoint.active,
        },
      });
    } else {
      await db.webhookEndpoint.create({
        data: {
          tenantId: ctx.tenant.id,
          apiEndpointId: endpoint.id,
          url: endpoint.url,
          encryptedSecret: encrypt(secret),
          eventTypes: endpoint.eventTypes,
          active: endpoint.active,
        },
      });
    }
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath('/settings/webhooks');
  return null;
}

