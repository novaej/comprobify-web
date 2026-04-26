'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { sendToSri, checkAuthorization, retrySingleEmail } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { requireApiKey } from '@/lib/auth-token';

export type ActionResult = { error: string } | null;

export async function sendToSriAction(accessKey: string): Promise<ActionResult> {
  const apiKey = await requireApiKey();
  try {
    await sendToSri(apiKey, accessKey);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}

export async function authorizeAction(accessKey: string): Promise<ActionResult> {
  const apiKey = await requireApiKey();
  try {
    await checkAuthorization(apiKey, accessKey);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}

export async function resendEmailAction(accessKey: string): Promise<ActionResult> {
  const apiKey = await requireApiKey();
  try {
    await retrySingleEmail(apiKey, accessKey, true);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}
