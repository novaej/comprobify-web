import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { CompleteRegistrationForm } from '@/components/complete-registration-form';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoLockupStacked } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function CompleteRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('completeRegistration');

  // Already authenticated and active — send to dashboard.
  const session = await auth();
  if (session?.user?.id) {
    redirect({ href: '/dashboard', locale });
  }

  const { email } = await searchParams;

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
            <CompleteRegistrationForm prefillEmail={email} />
          </div>
        </div>
      </div>
    </div>
  );
}
