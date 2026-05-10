import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/login-form';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { FileText } from 'lucide-react';

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex justify-end px-6 py-5">
        <LocaleSwitcher />
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-4">
              <FileText className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Comprobify</h1>
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
