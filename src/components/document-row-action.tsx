'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authorizeAction } from '@/app/actions/document';
import { toastApiError } from '@/lib/api-error-toast';
import type { DocumentStatus } from '@/lib/api';

interface DocumentRowActionProps {
  accessKey: string;
  status: DocumentStatus;
}

export function DocumentRowAction({ accessKey, status }: DocumentRowActionProps) {
  const t = useTranslations('invoiceDetail');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();

  if (status !== 'RECEIVED') return null;

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await authorizeAction(accessKey);
          if (result?.error) toastApiError(result.error, tError);
        })
      }
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <CheckCircle className="h-3 w-3" />
      )}
      <span className="ml-1.5">
        {isPending ? t('actions.authorizing') : t('actions.authorize')}
      </span>
    </Button>
  );
}
