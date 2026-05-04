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
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {success ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">{t('successTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('successDescription')}</p>
            </div>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">{t('errorTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('errorDescription')}</p>
            </div>
          </>
        )}
        <Link href="/settings" className={buttonVariants({ variant: 'default' })}>
          {t('goToSettings')}
        </Link>
      </div>
    </div>
  );
}
