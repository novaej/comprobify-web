'use client';

import { useEffect, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getTenantApiKeyUsageAction } from '@/app/actions/apiKeys';
import type { ApiKeyDailyUsage } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toastApiError } from '@/lib/api-error-toast';

const RANGE_OPTIONS = [7, 14, 30] as const;

// "YYYY-MM-DD" parsed as local calendar date — `new Date(str)` would parse it as
// UTC midnight and can shift a day off in negative-UTC timezones (e.g. Ecuador).
function parseUsageDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Recharts' automatic tick generator can collapse to duplicate rounded values
// (e.g. every label reading "0") when `allowDecimals={false}` meets a small
// data range — it doesn't dedupe fractional ticks before rounding. Generating
// explicit integer ticks sidesteps that entirely.
function integerTicks(maxValue: number): number[] {
  const max = Math.max(1, maxValue);
  const targetCount = 4;
  if (max <= targetCount) {
    return Array.from({ length: max + 1 }, (_, i) => i);
  }
  const step = Math.ceil(max / targetCount);
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

export function ApiKeyUsageChart({ keyId }: { keyId: string }) {
  const t = useTranslations('apiKeys.usageChart');
  const tError = useTranslations('apiError');
  const locale = useLocale();
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(14);
  const [usage, setUsage] = useState<ApiKeyDailyUsage[] | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await getTenantApiKeyUsageAction(keyId, days);
      if (cancelled) return;
      if ('error' in result) {
        toastApiError(result.error, tError);
        setUsage([]);
      } else {
        setUsage(result.usage);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId, days]);

  const dateFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' });
  const totalRequests = usage?.reduce((sum, d) => sum + d.requestCount, 0) ?? 0;
  const maxRequestCount = usage ? Math.max(0, ...usage.map((d) => d.requestCount)) : 0;
  const yAxisTicks = integerTicks(maxRequestCount);
  // Widen the axis to fit the longest tick label (e.g. 4-digit counts need more
  // room than the single-digit case this was originally sized for).
  const yAxisWidth = Math.max(24, String(yAxisTicks[yAxisTicks.length - 1]).length * 8 + 12);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">{t('title')}</h3>
        <div className="flex items-center gap-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                days === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t('rangeDays', { days: option })}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 h-40">
        {isPending || usage === null ? (
          <Skeleton className="h-full w-full" />
        ) : totalRequests === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={usage} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={(date: string) => dateFormatter.format(parseUsageDate(date))}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                domain={[0, yAxisTicks[yAxisTicks.length - 1]]}
                ticks={yAxisTicks}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={yAxisWidth}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as ApiKeyDailyUsage;
                  return (
                    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                      <p className="font-medium text-popover-foreground">
                        {dateFormatter.format(parseUsageDate(point.date))}
                      </p>
                      <p className="text-muted-foreground">
                        {t('requestsLabel', { count: point.requestCount })}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="requestCount" radius={[2, 2, 0, 0]} className="fill-primary" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
