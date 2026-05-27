'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Send, CheckCircle, Download, Mail } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { sendToSriAction, authorizeAction, resendEmailAction } from '@/app/actions/document';
import type { DocumentStatus } from '@/lib/api';
import { toastApiError } from '@/lib/api-error-toast';

interface InvoiceActionsProps {
  accessKey: string;
  status: DocumentStatus;
}

export function InvoiceActions({ accessKey, status }: InvoiceActionsProps) {
  const t = useTranslations('invoiceDetail');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ error: string } | null>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        onSuccess?.();
      }
    });
  }

  return (
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
            onClick={() => run(
              () => resendEmailAction(accessKey),
              () => toast.success(t('actions.resendEmailSuccess')),
            )}
          >
            <Mail className="mr-2 h-4 w-4" />
            {t('actions.resendEmail')}
          </Button>
        </>
      )}
    </div>
  );
}
