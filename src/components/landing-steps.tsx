'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ArrowRight, Check, FileText, Building2, UserPlus, Terminal } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PathKey = 'web' | 'api';

const STEP_ICONS = [UserPlus, Building2, FileText] as const;
const API_STEP_ICONS = [UserPlus, Building2, Terminal] as const;

/**
 * The landing page's "how to start" section.
 *
 * One three-step timeline with a tab switcher over it. Steps 1–2 are the same
 * for both audiences (create an account, configure your company); only step 3
 * and the closing CTA differ — issue from the browser, or POST to the API and
 * head to the docs. Tabbing rather than showing two parallel columns keeps the
 * shared steps from being read twice.
 */
export function LandingSteps() {
  const t = useTranslations('landing.steps');
  const locale = useLocale();
  const [path, setPath] = useState<PathKey>('web');

  const icons = path === 'web' ? STEP_ICONS : API_STEP_ICONS;
  const steps = [1, 2, 3] as const;

  // Which steps have scrolled into view — drives the node highlight and how far
  // the connecting rail has filled. Monotonic (never un-highlights) so scrolling
  // back up doesn't make the timeline flicker backwards.
  const [reached, setReached] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setReached(steps.length);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          setReached((prev) => Math.max(prev, index + 1));
        }
      },
      { threshold: 0.5 },
    );

    for (const node of itemRefs.current) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
    // Re-observed when the tab changes, since the list is re-rendered.
  }, [path, steps.length]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Tab switcher — mirrors the pricing page's interval toggle so the two
          marketing screens share one control vocabulary. */}
      <div className="mb-10 flex justify-center">
        <div
          role="tablist"
          aria-label={t('title')}
          className="inline-flex w-full max-w-md items-center gap-1 rounded-lg border border-border bg-muted p-1 sm:w-auto"
        >
          {(['web', 'api'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={path === key}
              aria-controls={`path-panel-${key}`}
              onClick={() => setPath(key)}
              className={cn(
                'flex-1 rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none',
                path === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`tabs.${key}`)}
            </button>
          ))}
        </div>
      </div>

      <div
        id={`path-panel-${path}`}
        role="tabpanel"
        className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-14"
      >
        {/* Timeline */}
        <ol className="relative space-y-8">
          {/* Connecting rail: a muted track with a primary fill that grows as
              each step scrolls into view. Step text never depends on this —
              only the colour does — so the section still reads fine if the
              observer never runs. */}
          <span aria-hidden className="absolute top-5 bottom-5 left-5 w-px bg-border">
            {/* Nested so the fill percentage resolves against the track's own
                height, not the whole list — otherwise a full rail overshoots
                past the last node. */}
            <span
              style={{ height: `${(reached / steps.length) * 100}%` }}
              className="block w-px bg-primary transition-[height] duration-700 ease-out motion-reduce:transition-none"
            />
          </span>

          {steps.map((n, index) => {
            const Icon = icons[index];
            const isReached = index < reached;
            return (
              <li
                key={n}
                data-index={index}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className="relative flex gap-4 pl-0"
              >
                <span
                  className={cn(
                    'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-500 motion-reduce:transition-none',
                    isReached
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
                <div className="pt-0.5">
                  <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                    {t('stepLabel', { number: n })}
                  </span>
                  <h3 className="mt-1 font-semibold">{t(`${path}.step${n}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`${path}.step${n}.description`)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Path-specific visual + closing CTA */}
        <div className="flex flex-col gap-5">
          {path === 'web' ? <WebMock /> : <ApiMock />}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {path === 'web' ? (
              // Plain <a>: crosses the marketing → app domain boundary.
              <a href={`/${locale}/register`} className={buttonVariants({ size: 'lg' })}>
                {t('web.cta')}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </a>
            ) : (
              <a
                href="https://docs.comprobify.com/"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ size: 'lg' })}
              >
                {t('api.cta')}
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
              </a>
            )}
            <p className="text-xs text-muted-foreground">{t(`${path}.ctaNote`)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stylised invoice-form preview for the "from the web" path. */
function WebMock() {
  const t = useTranslations('landing.steps.web.mock');

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
        <span className="ml-2 text-xs text-muted-foreground">{t('title')}</span>
      </div>
      <div className="space-y-3 p-4">
        <MockField label={t('buyer')} value={t('buyerValue')} />
        <MockField label={t('item')} value={t('itemValue')} />
        <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
          <span className="text-xs text-muted-foreground">{t('total')}</span>
          <span className="font-mono text-sm font-semibold">$112.00</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {t('authorized')}
        </div>
      </div>
    </div>
  );
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="mt-1 rounded-md border border-border px-3 py-2 text-sm">{value}</div>
    </div>
  );
}

/** Request/response snippet for the "integrate with my system" path. */
function ApiMock() {
  const t = useTranslations('landing.steps.api.mock');

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5">
        <span className="font-mono text-xs text-muted-foreground">POST /v1/documents</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
          201
        </span>
      </div>
      {/* rule 11: a code block must scroll inside itself, never the page. */}
      <div className="overflow-x-auto p-4">
        <pre className="font-mono text-xs leading-relaxed">
          <code>
            <span className="text-muted-foreground">{'{'}</span>
            {'\n  '}
            <span className="text-primary">&quot;documentType&quot;</span>
            <span className="text-muted-foreground">: </span>
            <span>&quot;01&quot;</span>
            <span className="text-muted-foreground">,</span>
            {'\n  '}
            <span className="text-primary">&quot;buyer&quot;</span>
            <span className="text-muted-foreground">: {'{ '}</span>
            <span className="text-primary">&quot;id&quot;</span>
            <span className="text-muted-foreground">: </span>
            <span>&quot;1790012345001&quot;</span>
            <span className="text-muted-foreground">{' }'},</span>
            {'\n  '}
            <span className="text-primary">&quot;items&quot;</span>
            <span className="text-muted-foreground">: [{'{ '}</span>
            <span className="text-primary">&quot;description&quot;</span>
            <span className="text-muted-foreground">: </span>
            <span>&quot;{t('item')}&quot;</span>
            <span className="text-muted-foreground">{' }'}]</span>
            {'\n'}
            <span className="text-muted-foreground">{'}'}</span>
          </code>
        </pre>
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-primary/5 px-4 py-2.5 text-sm text-primary">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        <span className="font-mono text-xs">{t('response')}</span>
      </div>
    </div>
  );
}
