'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { sendToSri, checkAuthorization, retrySingleEmail } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { requirePermission } from '@/lib/context';

export type ActionResult = { error: string } | null;

export async function sendToSriAction(
  accessKey: string,
): Promise<{ status: string } | { error: string }> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    const doc = await sendToSri(apiCtx, accessKey);
    if (doc.status === 'RECEIVED') {
      try {
        const authorized = await checkAuthorization(apiCtx, accessKey);
        return { status: authorized.status };
      } catch {
        return { status: doc.status };
      }
    }
    return { status: doc.status };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function authorizeAction(accessKey: string): Promise<ActionResult> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    await checkAuthorization(apiCtx, accessKey);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}

// Non-redirecting authorize used by the polling component.
// Returns the new document status, or an error code if the call fails.
export async function tryAuthorizeAction(
  accessKey: string,
): Promise<{ status: string } | { error: string }> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    const doc = await checkAuthorization(apiCtx, accessKey);
    return { status: doc.status };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

export async function resendEmailAction(accessKey: string): Promise<ActionResult> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    await retrySingleEmail(apiCtx, accessKey, true);
    return null;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}
