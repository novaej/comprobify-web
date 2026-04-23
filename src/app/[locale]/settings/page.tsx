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

  const isSandbox = process.env.COMPROBIFY_SANDBOX === 'true';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      {/* Environment badge */}
      <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${isSandbox ? 'bg-yellow-400' : 'bg-green-500'}`}
        />
        {isSandbox ? 'Sandbox (SRI pruebas)' : 'Producción (SRI real)'}
      </div>

      {/* TODO Phase 3: Issuer info card (name, RUC, cert expiry, fingerprint) */}
      {/* TODO Phase 3: API key reveal (Server Action + dialog) */}
      <p className="text-sm text-muted-foreground">
        Configuración en construcción — agrega info del emisor y opción de mostrar API key.
      </p>
    </div>
  );
}
