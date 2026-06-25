/**
 * Maps a notification to where clicking it should navigate.
 *
 * Metadata shapes verified against `../comprobify/src/services/notification.service.js`:
 *   DOCUMENT_AUTHORIZED — `{ documents: [{ accessKey, ... }], count }`. A single
 *     authorization within the aggregation window goes straight to that
 *     document; once a second one lands in the same window the service
 *     aggregates in place (count > 1), so there's no single document to
 *     deep-link to — send the user to the documents hub instead.
 *   CERT_EXPIRING / CERT_EXPIRED — no document to link to; always the issuer
 *     list, where the certificate can be viewed/renewed.
 *   Any other/future type — no mapping yet, so no link (falls back to the
 *     existing "mark read" action only).
 */

interface DocumentAuthorizedMetadata {
  count?: number;
  documents?: Array<{ accessKey?: string }>;
}

export function getNotificationHref(type: string, metadata: unknown): string | null {
  switch (type) {
    case 'DOCUMENT_AUTHORIZED': {
      const meta = metadata as DocumentAuthorizedMetadata | null;
      const accessKey = meta?.count === 1 ? meta.documents?.[0]?.accessKey : undefined;
      return accessKey ? `/invoices/${accessKey}` : '/documents';
    }
    case 'CERT_EXPIRING':
    case 'CERT_EXPIRED':
      return '/issuers';
    default:
      return null;
  }
}
