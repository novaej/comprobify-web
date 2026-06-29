import { setRequestLocale, getTranslations } from 'next-intl/server';
import { listTiers } from '@/lib/public-api';
import { PricingPlans } from '@/components/pricing-plans';

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pricing');
  const tiers = await listTiers();

  return (
    <div className="px-4 md:px-8 py-12 md:py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-4 text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <PricingPlans tiers={tiers} />
      </div>
    </div>
  );
}
