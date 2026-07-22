import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/utils';
import { LoginForm } from '@/components/login-form';
import { Link, redirect } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoLockupStacked } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChevronLeft, ShieldOff } from 'lucide-react';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const [{ locale }, { reason }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const session = await auth();
  if (session && isUuid(session.user.id)) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, active: true },
    });
    // Only redirect active users to dashboard. Disabled users arrive here from the
    // /api/auth/signout-disabled route which already cleared their session cookie,
    // so on this render session will be null and we fall through to the form.
    if (user?.active) redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('auth');

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        <a
          href={`/${locale}`}
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('backToHome')}
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
            <p className="mt-1 text-sm text-muted-foreground">{t('login.subtitle')}</p>
          </div>

          {reason === 'disabled' && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{t('login.accountDisabled')}</p>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <LoginForm />
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {t('login.noAccount')}{' '}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline underline-offset-4 transition-colors"
            >
              {t('login.register')}
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            <Link
              href="/recover-account"
              className="hover:text-foreground hover:underline underline-offset-4 transition-colors"
            >
              {t('login.lostApiKey')}
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            <Link
              href="/support"
              className="hover:text-foreground hover:underline underline-offset-4 transition-colors"
            >
              {t('needHelp')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
