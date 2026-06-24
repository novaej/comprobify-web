'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useTranslations } from 'next-intl';
import { Button, buttonVariants } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';

// Let the bundler resolve + serve the worker (with correct headers/hashing) instead of
// a manually-copied public/ file — Next.js's static file server doesn't reliably send a
// module-compatible Content-Type for .mjs, which breaks pdf.js's dynamic import of it.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface InvoicePdfPreviewProps {
  accessKey: string;
}

export function InvoicePdfPreview({ accessKey }: InvoicePdfPreviewProps) {
  const t = useTranslations('invoiceDetail.pdfPreview');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>();
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex justify-end">
        <a
          href={`/api/documents/${accessKey}/ride`}
          download
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <Download className="h-3.5 w-3.5" />
          {t('download')}
        </a>
      </div>
      <div ref={containerRef} className="overflow-auto rounded-lg bg-muted/40">
        {loadError ? (
          <p className="p-8 text-center text-sm text-destructive">{t('error')}</p>
        ) : (
          <Document
            file={`/api/documents/${accessKey}/ride`}
            onLoadSuccess={({ numPages: loaded }) => setNumPages(loaded)}
            onLoadError={() => setLoadError(true)}
            loading={
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('loading')}
              </div>
            }
          >
            <Page pageNumber={pageNumber} width={containerWidth} />
          </Document>
        )}
      </div>

      {numPages && numPages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('previous')}</span>
          </Button>
          <p className="text-sm text-muted-foreground">
            {t('pageInfo', { page: pageNumber, numPages })}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            <span className="hidden sm:inline">{t('next')}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
