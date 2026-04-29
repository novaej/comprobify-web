import { setRequestLocale, getTranslations } from 'next-intl/server';
import { RegisterForm } from '@/components/register-form';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">Comprobify</h1>
          <p className="text-sm text-muted-foreground">{t('register.subtitle')}</p>
        </div>

        <RegisterForm />

        <p className="text-center text-sm text-muted-foreground">
          {t('register.hasAccount')}{' '}
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            {t('register.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
