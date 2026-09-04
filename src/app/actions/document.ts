'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { sendToSri, checkAuthorization, getDocument, retrySingleEmail, retrySend, retryAllFailedDocuments, voidDocument } from '@/lib/api';
import type { DocumentDispatchStatus } from '@/lib/api';
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
// this never queues anything, it just reads the current row. `dispatch` (present
// only while status is PENDING_SEND/RECEIVED) lets the caller decide, once its
// own polling times out, whether a manual retry click should actually call
// retrySendAction (dispatch.status === 'FAILED') or just keep waiting on the
// automatic retries (PENDING/DISPATCHED) — see InvoiceActions/InvoicePolling.
export async function getDocumentStatusAction(
  accessKey: string,
): Promise<{ status: string; dispatch?: DocumentDispatchStatus } | { error: string }> {
  const ctx = await requirePermission('documents.read');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    const doc = await getDocument(apiCtx, accessKey);
    return { status: doc.status, dispatch: doc.dispatch };
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

// Recovers a document stuck in PENDING_SEND or RECEIVED after its automatic
// send/authorize retries were exhausted — see retrySend()'s doc comment.
// Non-redirecting like sendToSriAction: the caller (InvoiceActions/InvoicePolling)
// already handles refresh/polling for the resulting status transition.
export async function retrySendAction(
  accessKey: string,
): Promise<{ status: string } | { error: string }> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    const doc = await retrySend(apiCtx, accessKey);
    return { status: doc.status };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

// Bulk variant of retrySendAction — recovers every stuck document across all of
// the tenant's issuers/branches in one call. skipIssuer: true because the
// underlying endpoint is tenant-wide (no X-Issuer-Id), unlike every other action
// in this file — a multi-branch outage shouldn't require switching issuers to
// recover each one individually.
export async function retryFailedDocumentsAction(): Promise<{ retried: number } | { error: string }> {
  const ctx = await requirePermission('documents.manage', { skipIssuer: true });
  try {
    const retried = await retryAllFailedDocuments({ apiKey: ctx.apiKey });
    return { retried };
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

// Manual void — only valid on an AUTHORIZED document; the caller (InvoiceActions)
// gates the button/dialog to that status, but the API itself is the real boundary
// (400 DOCUMENT_NOT_AUTHORIZED otherwise). confirmedSriVoid is always true here —
// the dialog's checkbox is what actually gates whether this gets called at all.
export async function voidDocumentAction(
  accessKey: string,
  reason: string,
): Promise<ActionResult> {
  const ctx = await requirePermission('documents.manage');
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    await voidDocument(apiCtx, accessKey, reason, true);
    return null;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}
