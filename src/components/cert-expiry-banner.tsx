'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { markNotificationReadAction } from '@/app/actions/notifications';

interface CertAlertProps {
  id: number;
  type: 'CERT_EXPIRING' | 'CERT_EXPIRED';
  title: string;
  message: string;
}

export function CertExpiryBanner({ id, type, title, message }: CertAlertProps) {
  const t = useTranslations('certBanner');
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (dismissed) return null;

  const isExpired = type === 'CERT_EXPIRED';

  function handleDismiss() {
    startTransition(async () => {
      await markNotificationReadAction(id);
      setDismissed(true);
    });
  }

  return (
    <div
      className={cn(
        'mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm',
        isExpired
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : 'border-amber-400/40 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
      )}
      role="alert"
    >
      <span className="mt-0.5 shrink-0">
        {isExpired
          ? <AlertCircle className="h-4 w-4" aria-hidden />
          : <AlertTriangle className="h-4 w-4" aria-hidden />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{title}</p>
        <p className="mt-0.5 text-xs opacity-80">{message}</p>
      </div>

      <button
        onClick={handleDismiss}
        disabled={isPending}
        aria-label={t('dismiss')}
        className={cn(
          'mt-0.5 shrink-0 rounded p-0.5 transition-colors disabled:opacity-50',
          isExpired
            ? 'hover:bg-destructive/10'
            : 'hover:bg-amber-200/60 dark:hover:bg-amber-500/20',
        )}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
