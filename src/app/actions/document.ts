'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { sendToSri, checkAuthorization, retrySingleEmail } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { requireContext } from '@/lib/context';

export type ActionResult = { error: string } | null;

export async function sendToSriAction(accessKey: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    await sendToSri(apiCtx, accessKey);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}

export async function authorizeAction(accessKey: string): Promise<ActionResult> {
  const ctx = await requireContext();
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

export async function resendEmailAction(accessKey: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const apiCtx = { apiKey: ctx.apiKey, issuerId: ctx.issuer.apiIssuerId };
  try {
    await retrySingleEmail(apiCtx, accessKey, true);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}
