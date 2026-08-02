'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tryAuthorizeAction, getDocumentStatusAction, retrySendAction } from '@/app/actions/document';
import { toastApiError } from '@/lib/api-error-toast';
import type { DocumentDispatchStatus } from '@/lib/api';

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 2 * 60 * 1_000;

interface InvoicePollingProps {
  accessKey: string;
}

export function InvoicePolling({ accessKey }: InvoicePollingProps) {
  const t = useTranslations('invoiceDetail');
  const tError = useTranslations('apiError');
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const triggeredRef = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retryPending, startRetryTransition] = useTransition();
  // Bumped to restart the polling effect below from a fresh clock — either
  // after a successful manual retry, or after deciding to just wait longer —
  // (accessKey/router never change on their own) without a full page reload.
  const [resetKey, setResetKey] = useState(0);
  // Latest known dispatch info from the polling loop below, read (not reacted
  // to) by handleRetry to decide what a click should actually do.
  const dispatchRef = useRef<DocumentDispatchStatus | undefined>(undefined);

  useEffect(() => {
    startedAt.current = Date.now();
    setTimedOut(false);

    // Kick the async authorization check once (see ADR-019) — its response
    // status is always RECEIVED unchanged, so it's fire-and-forget here; the
    // interval below polls the document's real status for the outcome.
    // Guarded by a ref (not just relying on this effect running once) because
    // React StrictMode's dev-only double-invoke would otherwise queue it twice
    // per mount — harmless (the worker's assertTransition skips the redelivery
    // as a benign no-op) but noisy in the worker logs. Only fires on the
    // initial mount, not after a manual retry restart (resetKey change) — a
    // successful retrySendAction already re-queued the actual attempt.
    if (!triggeredRef.current) {
      triggeredRef.current = true;
      tryAuthorizeAction(accessKey).catch(() => {});
    }

    const interval = setInterval(async () => {
      if (Date.now() - startedAt.current >= TIMEOUT_MS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      try {
        const result = await getDocumentStatusAction(accessKey);
        if ('status' in result) {
          dispatchRef.current = result.dispatch;
          if (result.status !== 'RECEIVED') {
            clearInterval(interval);
            router.refresh();
          }
        }
      } catch {
        // transient network blip; next tick retries until TIMEOUT_MS
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [accessKey, router, resetKey]);

  // A single "Reintentar" click means two different things depending on what
  // the last poll saw: if the automatic authorize attempt is still PENDING/
  // DISPATCHED (most likely — reconciliation spaces attempts 5 min apart, far
  // longer than this 2-minute frontend timeout), calling the retry endpoint
  // would just 409 NOTHING_TO_RETRY, so instead this purely restarts the local
  // poll for another 2 minutes, giving the backend more time — no server call
  // beyond the same GET it already does every 5s. Only once dispatch.status is
  // actually FAILED does this call retrySendAction (POST .../send/retry).
  function handleRetry() {
    startRetryTransition(async () => {
      if (dispatchRef.current?.status === 'FAILED') {
        const result = await retrySendAction(accessKey);
        if ('error' in result) {
          toastApiError(result.error, tError);
          return;
        }
      }
      setResetKey((k) => k + 1);
    });
  }

  if (timedOut) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
        <p className="flex-1">{t('polling.timeout')}</p>
        <Button
          size="sm"
          variant="outline"
          disabled={retryPending}
          onClick={handleRetry}
        >
          {retryPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {t('actions.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {t('polling.waiting')}
    </div>
  );
}
