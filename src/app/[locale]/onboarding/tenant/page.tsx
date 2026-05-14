import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { db } from '@/lib/db';
import { IssuerSetupForm } from '@/components/issuer-setup-form';
import { LogoLockup } from '@/components/logo';

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
    <div className="min-h-screen bg-muted/40 flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoLockup className="h-8 w-auto" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <IssuerSetupForm />
        </div>
      </div>
    </div>
  );
}
