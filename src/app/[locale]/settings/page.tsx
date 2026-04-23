import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('settings');
  const tSandbox = await getTranslations('sandbox');

  const isSandbox = process.env.COMPROBIFY_SANDBOX === 'true';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
        <span className={`h-2 w-2 rounded-full ${isSandbox ? 'bg-yellow-400' : 'bg-green-500'}`} />
        {isSandbox ? tSandbox('badge') : tSandbox('productionBadge')}
      </div>

      {/* TODO: Issuer info card — requires GET /api/issuer/me (not yet in API) */}
      {/* TODO: API key reveal — Server Action + masked input */}
    </div>
  );
}
