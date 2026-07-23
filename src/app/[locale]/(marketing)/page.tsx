import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, ShieldCheck, Zap, Webhook, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Reveal } from '@/components/reveal';
import { LandingSteps } from '@/components/landing-steps';
import { LandingDocTypes } from '@/components/landing-doc-types';
import { LandingFaq } from '@/components/landing-faq';
import { listTiers } from '@/lib/public-api';
import { localeAlternates } from '@/lib/seo';
import { cn } from '@/lib/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing.seo' });
  const title = t('title');
  const description = t('description');

  return {
    title,
    description,
    alternates: { canonical: `/${locale}`, languages: localeAlternates('') },
    openGraph: { title, description, type: 'website', locale },
  };
}

/**
 * Which comprobante types Comprobify can actually issue today.
 *
 * Derived from the public tier catalog rather than hardcoded: the API's
 * `allowedDocumentTypes` per tier is kept in lockstep with `SUPPORTED_TYPES` in
 * `../comprobify/src/builders/index.js` (see the comment at the top of
 * `src/constants/subscription-tiers.js`), so the union across every tier is the
 * set of types that have a builder. When 05/06/07 ship, this strip updates
 * itself with no frontend change.
 *
 * Failure is non-fatal — the landing page must render even if the API is cold
 * or down, so a failed fetch just hides the section.
 */
async function getSupportedDocumentTypes(): Promise<string[] | null> {
  try {
    const tiers = await listTiers();
    const union = new Set(tiers.flatMap((tier) => tier.allowedDocumentTypes));
    return union.size > 0 ? [...union] : null;
  } catch {
    return null;
  }
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('landing');
  const supportedDocTypes = await getSupportedDocumentTypes();

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden px-4 py-20 text-center md:py-32">
        {/* Decorative layers: a fading grid and a drifting teal glow. Both are
            aria-hidden and the drift is disabled under prefers-reduced-motion. */}
        <div
          aria-hidden
          className="bg-grid mask-radial-fade pointer-events-none absolute inset-0 opacity-40"
        />
        <div
          aria-hidden
          className="animate-glow-drift pointer-events-none absolute -top-40 left-1/2 h-144 w-144 -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
        />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t('hero.badge')}
            </span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl leading-tight font-bold tracking-tight md:text-6xl">
              {t('hero.title')}
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
              {t('hero.subtitle')}
            </p>
          </Reveal>

          <Reveal delay={240} className="mt-8 w-full">
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <a href={`/${locale}/register`} className={buttonVariants({ size: 'lg' })}>
                {t('hero.cta.register')}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </a>
              {/* Same-page anchor — no locale prefix needed, and this way the
                  browser smooth-scrolls instead of reloading the route. */}
              <a
                href="#como-empezar"
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
              >
                {t('hero.cta.howItWorks')}
              </a>
            </div>
          </Reveal>

          <Reveal delay={320} className="mt-12 w-full">
            <ul className="flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground sm:flex-row sm:gap-8">
              <TrustItem icon={ShieldCheck} label={t('hero.trust.sri')} />
              <TrustItem icon={Zap} label={t('hero.trust.signing')} />
              <TrustItem icon={Webhook} label={t('hero.trust.webhooks')} />
            </ul>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------------- Steps */}
      {/* scroll-mt clears the sticky header when the #como-empezar anchor jumps. */}
      <section id="como-empezar" className="scroll-mt-20 border-t border-border px-4 py-16 md:px-8 md:py-24">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{t('steps.title')}</h2>
          <p className="mt-3 text-muted-foreground">{t('steps.subtitle')}</p>
        </Reveal>
        <Reveal delay={100}>
          <LandingSteps />
        </Reveal>
      </section>

      {/* ----------------------------------------------------- Document types */}
      {supportedDocTypes && (
        <section className="border-t border-border px-4 py-16 md:px-8 md:py-24">
          <Reveal>
            <LandingDocTypes supported={supportedDocTypes} />
          </Reveal>
        </section>
      )}

      {/* ------------------------------------------------------ Pricing teaser */}
      <section className="border-t border-border px-4 py-16 md:px-8 md:py-24">
        <Reveal className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-10 text-center md:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[80px]"
            />
            <div className="relative">
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                {t('pricingTeaser.title')}
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
                {t('pricingTeaser.description')}
              </p>
              {/* /pricing lives on this same marketing host, so <Link> is
                  safe here — only app-host links must be plain <a>. */}
              <Link
                href="/pricing"
                locale={locale}
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'mt-7')}
              >
                {t('pricingTeaser.cta')}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section className="border-t border-border px-4 py-16 md:px-8 md:py-24">
        <Reveal>
          <LandingFaq />
        </Reveal>
      </section>

      {/* ----------------------------------------------------------- Final CTA */}
      <section className="relative overflow-hidden border-t border-border px-4 py-20 text-center md:px-8 md:py-28">
        <div
          aria-hidden
          className="animate-glow-drift pointer-events-none absolute -bottom-40 left-1/2 h-120 w-120 -translate-x-1/2 rounded-full bg-primary/15 blur-[110px]"
        />
        <Reveal className="relative mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t('finalCta.title')}</h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">{t('finalCta.subtitle')}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={`/${locale}/register`} className={buttonVariants({ size: 'lg' })}>
              {t('finalCta.register')}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </a>
            <a
              href="https://docs.comprobify.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              {t('finalCta.docs')}
            </a>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function TrustItem({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      {label}
    </li>
  );
}
