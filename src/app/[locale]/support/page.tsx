import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoLockupStacked } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChevronLeft, Mail, MessageCircle } from 'lucide-react';

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('support');
  const tAuth = await getTranslations('auth');

  const session = await auth();
  // Mirrors the layout's own condition for wrapping children in the Nav
  // (src/app/[locale]/layout.tsx) — disabled users and tenant-less accounts
  // (e.g. super admins) get bare children there, so this page must render its
  // own chrome for them too instead of assuming the sidebar is present.
  let showsInAppChrome = false;
  if (session && isUuid(session.user.id)) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { active: true, tenantId: true },
    });
    showsInAppChrome = !!user?.active && !!user?.tenantId;
  }

  const email = process.env.SUPPORT_EMAIL;
  const phone = process.env.SUPPORT_PHONE;

  const contactCards = (
    <div className="grid gap-4 sm:grid-cols-2">
      {email && (
        <a
          href={`mailto:${email}`}
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('emailLabel')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('emailDescription')}</p>
            <p className="mt-2 break-all text-sm font-medium text-primary">{email}</p>
          </div>
        </a>
      )}
      {phone && (
        <a
          href={`https://wa.me/${phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('phoneLabel')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('phoneDescription')}</p>
            <p className="mt-2 text-sm font-medium text-primary">{phone}</p>
          </div>
        </a>
      )}
    </div>
  );

  if (showsInAppChrome) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('title')} description={t('description')} />
        {contactCards}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        <a
          href={`/${locale}`}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {tAuth('backToHome')}
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
          <LocaleSwitcher />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="mb-7 text-center">
            <a href={`/${locale}`} className="inline-block">
              <LogoLockupStacked variant="light" className="mx-auto mb-4 w-48 dark:hidden" />
              <LogoLockupStacked variant="dark" className="mx-auto mb-4 hidden w-48 dark:block" />
            </a>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          </div>
          {contactCards}
        </div>
      </div>
    </div>
  );
}
