'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Send, CheckCircle, Download, Mail } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { sendToSriAction, authorizeAction, resendEmailAction } from '@/app/actions/document';
import type { DocumentStatus } from '@/lib/api';

interface InvoiceActionsProps {
  accessKey: string;
  status: DocumentStatus;
}

export function InvoiceActions({ accessKey, status }: InvoiceActionsProps) {
  const t = useTranslations('invoiceDetail');
  const tError = useTranslations('apiError');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error: string } | null>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setError(
          tError.has(result.error as Parameters<typeof tError>[0])
            ? tError(result.error as Parameters<typeof tError>[0])
            : result.error
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === 'SIGNED' && (
          <Button
            disabled={isPending}
            onClick={() => run(() => sendToSriAction(accessKey))}
          >
            <Send className="mr-2 h-4 w-4" />
            {isPending ? t('actions.sending') : t('actions.send')}
          </Button>
        )}

        {status === 'RECEIVED' && (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => authorizeAction(accessKey))}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {isPending ? t('actions.authorizing') : t('actions.authorize')}
          </Button>
        )}

        {status === 'AUTHORIZED' && (
          <>
            <a
              href={`/api/documents/${accessKey}/ride`}
              className={buttonVariants({ variant: 'outline' })}
              download
            >
              <Download className="mr-2 h-4 w-4" />
              {t('actions.downloadPdf')}
            </a>
            <a
              href={`/api/documents/${accessKey}/xml`}
              className={buttonVariants({ variant: 'outline' })}
              download
            >
              <Download className="mr-2 h-4 w-4" />
              {t('actions.downloadXml')}
            </a>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => resendEmailAction(accessKey))}
            >
              <Mail className="mr-2 h-4 w-4" />
              {t('actions.resendEmail')}
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
