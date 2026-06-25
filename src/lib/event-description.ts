import type { DocumentEvent, DocumentStatus } from '@/lib/api';

type TFunc = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

export interface EventDescription {
  title: string;
  detail?: string;
  transition?: { from: DocumentStatus | null; to: DocumentStatus | null };
}

const VALID_STATUSES = new Set<string>(['SIGNED', 'RECEIVED', 'AUTHORIZED', 'RETURNED', 'NOT_AUTHORIZED']);

function asStatus(value: string | null): DocumentStatus | null {
  return value && VALID_STATUSES.has(value) ? (value as DocumentStatus) : null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// Verified against ../comprobify/src/services/document-creation.service.js,
// document-rebuild.service.js, document-transmission.service.js,
// document-email.service.js, and mailgun-webhook.service.js for the exact
// eventType/detail shape each call site logs — see CLAUDE.md's event timeline note.
export function describeDocumentEvent(event: DocumentEvent, t: TFunc): EventDescription {
  const detail = event.detail ?? {};
  const from = asStatus(event.fromStatus);
  const to = asStatus(event.toStatus);

  switch (event.eventType) {
    case 'CREATED':
      return { title: t('events.created'), transition: { from: null, to } };

    case 'REBUILT':
      return { title: t('events.rebuilt'), transition: { from, to } };

    case 'SENT':
      return {
        title: t('events.sent'),
        detail: detail.processingRetry ? t('events.processing') : undefined,
        transition: { from, to },
      };

    case 'STATUS_CHANGED':
      return to === 'AUTHORIZED'
        ? { title: t('events.statusChangedAuthorized'), detail: str(detail.authorizationNumber), transition: { from, to } }
        : { title: t('events.statusChangedNotAuthorized'), detail: str(detail.sriStatus), transition: { from, to } };

    case 'ERROR':
      return {
        title: detail.operation === 'AUTHORIZE' ? t('events.errorAuthorize') : t('events.errorSend'),
        detail: str(detail.message),
      };

    case 'EMAIL_SENT':
      return { title: detail.retried ? t('events.emailResent') : t('events.emailSent'), detail: str(detail.to) };

    case 'EMAIL_FAILED':
      return { title: t('events.emailFailed'), detail: str(detail.error) ?? str(detail.to) };

    case 'EMAIL_DELIVERED':
      return { title: t('events.emailDelivered'), detail: str(detail.to) };

    case 'EMAIL_TEMP_FAILED':
      return { title: t('events.emailTempFailed'), detail: str(detail.to) };

    case 'EMAIL_COMPLAINED':
      return { title: t('events.emailComplained'), detail: str(detail.to) };

    default: {
      const key = `eventTypes.${event.eventType}`;
      return { title: t.has(key) ? t(key) : event.eventType };
    }
  }
}
