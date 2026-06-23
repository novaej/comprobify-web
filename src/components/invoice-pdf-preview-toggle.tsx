'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoicePdfPreview } from '@/components/invoice-pdf-preview-lazy';

interface InvoicePdfPreviewToggleProps {
  accessKey: string;
}

export function InvoicePdfPreviewToggle({ accessKey }: InvoicePdfPreviewToggleProps) {
  const t = useTranslations('invoiceDetail.pdfPreview');
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button variant="outline" onClick={() => setOpen((v) => !v)}>
        {open ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
        {t('toggleLabel')}
      </Button>

      {open && (
        <div className="mt-3">
          <InvoicePdfPreview accessKey={accessKey} />
        </div>
      )}
    </div>
  );
}
