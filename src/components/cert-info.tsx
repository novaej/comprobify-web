'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mirrors the thresholds in comprobify/src/services/notification.service.js
const CERT_WARN_DAYS = 30;
const CERT_ERROR_DAYS = 7;

export function CertInfo({ certFingerprint, certExpiry }: { certFingerprint: string | null; certExpiry: string | null }) {
  const t = useTranslations('issuers');
  const format = useFormatter();

  if (!certFingerprint || !certExpiry) {
    return <p className="text-xs text-muted-foreground">{t('cert.unavailable')}</p>;
  }

  const daysRemaining = Math.floor((new Date(certExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const status =
    daysRemaining <= 0 ? 'expired' : daysRemaining <= CERT_ERROR_DAYS ? 'critical' : daysRemaining <= CERT_WARN_DAYS ? 'warning' : 'ok';

  const Icon = status === 'ok' ? ShieldCheck : status === 'warning' ? AlertTriangle : AlertCircle;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs',
        status === 'ok' && 'border-border bg-muted/40 text-muted-foreground',
        status === 'warning' && 'border-amber-400/40 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
        (status === 'critical' || status === 'expired') && 'border-destructive/40 bg-destructive/5 text-destructive',
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {status === 'expired'
          ? t('cert.expired')
          : t('cert.expiresOn', { date: format.dateTime(new Date(certExpiry), { dateStyle: 'medium' }) })}
      </span>
      <span className="font-mono opacity-80 break-all">{t('cert.fingerprint')}: {certFingerprint}</span>
    </div>
  );
}
