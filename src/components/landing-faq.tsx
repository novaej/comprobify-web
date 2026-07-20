import { getTranslations } from 'next-intl/server';
import { ChevronDown } from 'lucide-react';

const QUESTIONS = ['certificate', 'sandbox', 'sequentials', 'both', 'authorization'] as const;

/**
 * Landing page FAQ.
 *
 * Built on native `<details>`/`<summary>` rather than a shadcn accordion: it is
 * keyboard-accessible and expandable with zero JavaScript, which matters on a
 * marketing page that must render fast and stay crawlable. No client component
 * needed — this stays a Server Component.
 */
export async function LandingFaq() {
  const t = await getTranslations('landing.faq');

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-center text-2xl font-bold tracking-tight md:text-3xl">{t('title')}</h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">{t('subtitle')}</p>

      <div className="mt-10 divide-y divide-border rounded-xl border border-border bg-card">
        {QUESTIONS.map((key) => (
          <details key={key} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium [&::-webkit-details-marker]:hidden">
              {t(`${key}.question`)}
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="pb-4 text-sm leading-relaxed text-muted-foreground">
              {t(`${key}.answer`)}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
