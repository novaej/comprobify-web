import { setRequestLocale, getTranslations } from 'next-intl/server';
import { RegisterForm } from '@/components/register-form';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Logomark } from '@/components/logo';

export default async function RegisterPage({
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
            <Logomark variant="light" className="mx-auto h-10 w-10 mb-4" />
            <h1 className="text-xl font-semibold tracking-tight">Comprobify</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('register.subtitle')}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <RegisterForm />
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
