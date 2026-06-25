'use server';

import { requirePermission } from '@/lib/context';
import {
  registerWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
} from '@/lib/api';
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
export async function deleteWebhookAction(localId: number): Promise<WebhookActionResult> {
  const ctx = await requirePermission('webhooks.manage', { skipIssuer: true });

  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: localId } });
  if (!endpoint || endpoint.tenantId !== ctx.tenant.id) {
    return { error: 'WEBHOOK_ENDPOINT_NOT_FOUND' };
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
    id: number;
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
 * Idempotent — a no-op if an active endpoint for this URL already exists. If
 * one exists but was previously deactivated, PATCHes it back to active rather
 * than registering a new API-side record, so a tenant never accumulates more
 * than one endpoint row for this same consumer (the API's `active` column is
 * a toggle, not a soft-delete marker — deregistering doesn't free the record
 * for reuse on its own).
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
    if (existing) {
      await updateWebhookEndpoint({ apiKey: ctx.apiKey }, existing.apiEndpointId, { active: true });
      await db.webhookEndpoint.update({
        where: { id: existing.id },
        data: { active: true },
      });
    } else {
      const { endpoint, secret } = await registerWebhookEndpoint(
        { apiKey: ctx.apiKey },
        receiveUrl,
        [], // subscribe to all event types
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
    }
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }

  revalidatePath('/settings/webhooks');
  return null;
}

