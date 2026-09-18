import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Info, LogOut } from 'lucide-react';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/utils';
import { IssuerSetupForm } from '@/components/issuer-setup-form';
import { LogoLockupStacked } from '@/components/logo';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { logoutAction } from '@/app/actions/auth';
import { parseIntendedPlan } from '@/lib/subscription-tiers';
import { listAgreements } from '@/lib/public-api';

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
  const tNav = await getTranslations('nav');

  // listAgreements() is public and returns [] both when nothing is published
  // yet and when AGREEMENTS_ENABLED=false on the API — either way there's
  // genuinely nothing to accept, so an empty list is the right signal to hide
  // the "we'll ask you to accept X" notice regardless of which case it is.
  const publishedAgreements = await listAgreements();
  const showAgreementNotice = publishedAgreements.length > 0;

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        {/* This page is only ever reached authenticated (redirects to /login
            otherwise), and stays reachable for as long as the user has no
            tenant — with no other exit route on the page itself, testing a
            different account (or a stuck registration attempt) previously
            meant no way back to a clean /login without leaving the flow via
            the browser. */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {tNav('signOut')}
          </button>
        </form>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
          <LocaleSwitcher />
        </div>
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

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <IssuerSetupForm
            intendedTier={intendedPlan?.tier}
            intendedBillingInterval={intendedPlan?.interval}
            showAgreementNotice={showAgreementNotice}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
