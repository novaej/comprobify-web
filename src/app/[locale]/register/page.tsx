import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { RegisterForm } from '@/components/register-form';
import { Link, redirect } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoLockupStacked } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChevronLeft } from 'lucide-react';
import { parseIntendedPlan } from '@/lib/subscription-tiers';

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tier?: string; interval?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session) {
    redirect({ href: '/dashboard', locale });
  }

  const { tier, interval } = await searchParams;
  const intendedPlan = parseIntendedPlan(tier, interval);

  const t = await getTranslations('auth');

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        <a
          href={intendedPlan ? `/${locale}/pricing` : `/${locale}`}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {intendedPlan ? t('backToPricing') : t('backToHome')}
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
          <LocaleSwitcher />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <a href={`/${locale}`} className="inline-block">
              <LogoLockupStacked variant="light" className="mx-auto w-48 mb-4 dark:hidden" />
              <LogoLockupStacked variant="dark" className="mx-auto w-48 mb-4 hidden dark:block" />
            </a>
            <p className="mt-1 text-sm text-muted-foreground">{t('register.subtitle')}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <RegisterForm
              intendedTier={intendedPlan?.tier}
              intendedBillingInterval={intendedPlan?.interval}
            />
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {t('register.hasAccount')}{' '}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline underline-offset-4 transition-colors"
            >
              {t('register.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
