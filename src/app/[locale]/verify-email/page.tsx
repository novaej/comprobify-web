import { setRequestLocale, getTranslations } from 'next-intl/server';
import { verifyEmailToken } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { db } from '@/lib/db';
import { Link } from '@/i18n/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('verifyEmail');

  let success = false;

  if (token) {
    try {
      const { email } = await verifyEmailToken(token);
      await db.user.updateMany({
        where: { email },
        data: { emailVerified: true },
      });
      success = true;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center">
          {success ? (
            <>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500 mb-4">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight">{t('successTitle')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('successDescription')}</p>
            </>
          ) : (
            <>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-destructive mb-4">
                <XCircle className="h-6 w-6" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight">{t('errorTitle')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('errorDescription')}</p>
            </>
          )}
          <div className="mt-6">
            <Link href="/settings" className={buttonVariants() + ' cursor-pointer'}>
              {t('goToSettings')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
