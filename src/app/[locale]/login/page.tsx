import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { LoginForm } from '@/components/login-form';
import { Link, redirect } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoLockupStacked } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { ChevronLeft } from 'lucide-react';

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (session) {
    redirect({ href: '/dashboard', locale });
  }

  const t = await getTranslations('auth');

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('backToHome')}
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
          <LocaleSwitcher />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <Link href="/" className="inline-block">
              <LogoLockupStacked variant="light" className="mx-auto w-48 mb-4 dark:hidden" />
              <LogoLockupStacked variant="dark" className="mx-auto w-48 mb-4 hidden dark:block" />
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">{t('login.subtitle')}</p>
          </div>

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
        </div>
      </div>
    </div>
  );
}
