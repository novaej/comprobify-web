'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { sendToSri, checkAuthorization, getDocument, retrySingleEmail } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { requirePermission } from '@/lib/context';

export type ActionResult = { error: string } | null;

// Async since ADR-019 — sendToSri() only queues the SRI submission and always
// comes back PENDING_SEND, never the eventual RECEIVED/RETURNED. The caller
// (InvoiceActions) polls getDocumentStatusAction() to observe that transition.
export async function sendToSriAction(
  accessKey: string,
): Promise<{ status: string } | { error: string }> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    const doc = await sendToSri(apiCtx, accessKey);
    return { status: doc.status };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

// Lightweight status read used while polling for a PENDING_SEND → RECEIVED/RETURNED
// or RECEIVED → AUTHORIZED/NOT_AUTHORIZED transition — unlike checkAuthorization(),
// this never queues anything, it just reads the current row.
export async function getDocumentStatusAction(
  accessKey: string,
): Promise<{ status: string } | { error: string }> {
  const ctx = await requirePermission('documents.read');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    const doc = await getDocument(apiCtx, accessKey);
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

// Non-redirecting authorize used by the polling component to kick off the async
// authorization check (see ADR-019). The returned status is always RECEIVED
// unchanged — it never reflects the outcome — so callers should not use it to
// detect completion; poll getDocumentStatusAction() for that instead.
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
