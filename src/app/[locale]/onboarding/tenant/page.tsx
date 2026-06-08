import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Info } from 'lucide-react';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { IssuerSetupForm } from '@/components/issuer-setup-form';
import { LogoLockup } from '@/components/logo';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';

export default async function OnboardingTenantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user?.id) {
    redirect({ href: '/login', locale });
    return null;
  }

  // If user already has a tenant, send them to dashboard
  const user = await db.user.findUnique({
    where: { id: Number(session.user.id) },
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
          <LogoLockup className="h-8 w-auto" />
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
          <IssuerSetupForm />
        </div>
      </div>
      </div>
    </div>
  );
}
