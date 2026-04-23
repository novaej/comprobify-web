'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { sendToSri, checkAuthorization, retrySingleEmail } from '@/lib/api';
import { ApiError } from '@/lib/errors';

export type ActionResult = { error: string } | null;

export async function sendToSriAction(accessKey: string): Promise<ActionResult> {
  try {
    await sendToSri(accessKey);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}

export async function authorizeAction(accessKey: string): Promise<ActionResult> {
  try {
    await checkAuthorization(accessKey);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}

export async function resendEmailAction(accessKey: string): Promise<ActionResult> {
  try {
    await retrySingleEmail(accessKey, true);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
  const locale = await getLocale();
  redirect({ href: `/invoices/${accessKey}`, locale });
  return null;
}
