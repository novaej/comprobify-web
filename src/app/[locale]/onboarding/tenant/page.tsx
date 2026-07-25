import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Info } from 'lucide-react';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/utils';
import { OnboardingTabs } from '@/components/onboarding-tabs';
import { LogoLockupStacked } from '@/components/logo';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { parseIntendedPlan } from '@/lib/subscription-tiers';

export default async function OnboardingTenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tier?: string; interval?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { tier, interval } = await searchParams;
  const intendedPlan = parseIntendedPlan(tier, interval);

  const session = await auth();
  if (!session?.user?.id || !isUuid(session.user.id)) {
    redirect({ href: '/login', locale });
    return null;
  }

  // If user already has a tenant, send them to dashboard
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { tenantId: true },
  });
  if (user?.tenantId) {
    redirect({ href: '/dashboard', locale });
    return null;
  }

  const t = await getTranslations('onboarding');

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex items-center justify-end gap-2 px-6 py-5">
        <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 items-start justify-center p-4 pt-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoLockupStacked variant="light" className="h-16 w-auto dark:hidden" />
          <LogoLockupStacked variant="dark" className="hidden h-16 w-auto dark:block" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          </div>
        </div>

        <div
          role="note"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t('sriNotice')}</p>
        </div>

        <OnboardingTabs
          intendedTier={intendedPlan?.tier}
          intendedBillingInterval={intendedPlan?.interval}
        />
      </div>
      </div>
    </div>
  );
}
