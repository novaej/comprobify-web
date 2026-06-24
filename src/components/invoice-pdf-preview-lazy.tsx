'use client';

import dynamic from 'next/dynamic';

// next/dynamic's `ssr: false` is only allowed from within a Client Component —
// pdf.js relies on browser-only APIs (DOMMatrix, etc.) and must never render during SSR.
export const InvoicePdfPreview = dynamic(
  () => import('@/components/invoice-pdf-preview').then((m) => m.InvoicePdfPreview),
  { ssr: false }
);
