import { setRequestLocale, getTranslations } from 'next-intl/server';
import { checkResetTokenValid } from '@/app/actions/auth';
import { ResetPasswordForm } from '@/components/reset-password-form';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoLockupStacked } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations('resetPassword');

  // Checked here (not just deferred to submit) so a missing, already-used, or
  // expired token shows the accurate "invalid link" state immediately on
  // page load, rather than only after the user fills in the form and submits.
  const tokenValid = token ? await checkResetTokenValid(token) : false;

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex items-center justify-end gap-2 px-6 py-5">
        <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
        <LocaleSwitcher />
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <LogoLockupStacked variant="light" className="mx-auto w-48 mb-4 dark:hidden" />
            <LogoLockupStacked variant="dark" className="mx-auto w-48 mb-4 hidden dark:block" />
            <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            {tokenValid && token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <div className="space-y-4">
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {t('invalidLinkMessage')}
                </p>
                <Link
                  href="/forgot-password"
                  className="block text-center text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  {t('requestNewLink')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
