import { setRequestLocale, getTranslations } from 'next-intl/server';
import { checkEmailVerificationToken } from '@/lib/public-api';
import { Link } from '@/i18n/navigation';
import { XCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { VerifyEmailConfirm } from '@/components/verify-email-confirm';

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

  // Read-only — safe for an email link-scanner's automated prefetch, since it
  // never consumes the token. The actual consuming action only happens when
  // the user explicitly clicks "Confirmar mi correo" in <VerifyEmailConfirm>.
  const check = token ? await checkEmailVerificationToken(token) : { valid: false };

  return (
    <div className="min-h-screen bg-muted/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center">
          {token ? (
            // Always the same component instance once a token is present —
            // confirmEmailVerificationAction's revalidatePath('/', 'layout')
            // (needed so /settings picks up the fresh tenant status) makes
            // Next.js auto-refresh this very page after a successful confirm,
            // which re-runs checkEmailVerificationToken() with the
            // now-consumed token and would report it invalid. Switching which
            // component renders based on that re-check would unmount
            // VerifyEmailConfirm and discard its own already-'success' state.
            // initiallyValid is only consulted on first mount, so that later,
            // now-stale re-check can't retroactively invalidate a confirm
            // that already succeeded.
            <VerifyEmailConfirm token={token} initiallyValid={check.valid} />
          ) : (
            <>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-destructive mb-4">
                <XCircle className="h-6 w-6" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight">{t('errorTitle')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('errorDescription')}</p>
              <div className="mt-6">
                <Link href="/settings" className={buttonVariants() + ' cursor-pointer'}>
                  {t('goToSettings')}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
