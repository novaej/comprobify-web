import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Plan = {
  key: 'sandbox' | 'starter' | 'pro';
  highlighted: boolean;
};

const PLANS: Plan[] = [
  { key: 'sandbox', highlighted: false },
  { key: 'starter', highlighted: true },
  { key: 'pro', highlighted: false },
];

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pricing');

  return (
    <div className="px-4 md:px-8 py-12 md:py-20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-4 text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
            {t('subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(({ key, highlighted }) => {
            const features = t.raw(`plans.${key}.features`) as string[];
            return (
              <div
                key={key}
                className={cn(
                  'border rounded-lg p-6 flex flex-col gap-5',
                  highlighted && 'border-primary ring-1 ring-primary',
                )}
              >
                {highlighted && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {t('badge.popular')}
                  </span>
                )}
                <div>
                  <h2 className="text-lg font-semibold">{t(`plans.${key}.name`)}</h2>
                  <p className="text-3xl font-bold mt-1">{t(`plans.${key}.price`)}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t(`plans.${key}.description`)}
                  </p>
                </div>

                <ul className="flex flex-col gap-2 flex-1">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  locale={locale}
                  className={cn(
                    buttonVariants({
                      variant: highlighted ? 'default' : 'outline',
                      size: 'sm',
                    }),
                    'w-full justify-center',
                  )}
                >
                  {t(`plans.${key}.cta`)}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
