'use client';

import type { CSSProperties, RefObject } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { AlertCircle, AlertTriangle, Info, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/navigation';
import { getNotificationHref } from '@/lib/notification-link';
import type { listNotificationsAction } from '@/app/actions/notifications';

type Notification = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

interface NotificationPanelProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkRead: (id: string) => void;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'ERROR') {
    return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />;
  }
  if (severity === 'WARNING') {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />;
  }
  return <Info className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />;
}

export function NotificationPanel({
  notifications,
  isLoading,
  onMarkRead,
  onClose,
  panelRef,
  style,
}: NotificationPanelProps) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const router = useRouter();

  const unread = notifications.filter((n) => !n.readByMe);

  function handleRowClick(n: Notification) {
    const href = getNotificationHref(n.type, n.metadata);
    if (!href) return;
    if (!n.readByMe) onMarkRead(n.id);
    onClose();
    router.push(href);
  }

  return (
    <div
      ref={panelRef}
      style={style}
      className={cn(
        // Rendered through a portal at document.body and positioned with
        // fixed coordinates from the bell's bounding rect — this escapes the
        // sidebar's stacking context so the panel always paints above the
        // page's main content instead of being overlapped by it.
        'fixed z-50',
        'w-80 rounded-lg border border-sidebar-border bg-sidebar shadow-xl',
        'flex flex-col overflow-hidden',
        // On mobile: full-width, anchored to the right edge of the screen.
        'max-sm:inset-x-2 max-sm:right-2 max-sm:left-2 max-sm:w-auto max-sm:!top-16'
      )}
      role="dialog"
      aria-label={t('panelTitle')}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <h2 className="text-sm font-semibold text-sidebar-foreground">
          {t('panelTitle')}
          {unread.length > 0 && (
            <span className="ml-2 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
              {unread.length}
            </span>
          )}
        </h2>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-sidebar-foreground/40" />}
      </div>

      {/* Notification list */}
      <ul className="max-h-96 overflow-y-auto divide-y divide-sidebar-border/50">
        {notifications.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-sidebar-foreground/50">
            {t('empty')}
          </li>
        ) : (
          notifications.map((n) => {
            const href = getNotificationHref(n.type, n.metadata);
            return (
              <li
                key={n.id}
                onClick={href ? () => handleRowClick(n) : undefined}
                onKeyDown={href ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowClick(n);
                  }
                } : undefined}
                role={href ? 'button' : undefined}
                tabIndex={href ? 0 : undefined}
                className={cn(
                  'flex gap-3 px-4 py-3 transition-colors',
                  !n.readByMe && 'bg-sidebar-accent/30',
                  href && 'cursor-pointer hover:bg-sidebar-accent/50',
                )}
              >
                <div className="mt-0.5">
                  <SeverityIcon severity={n.severity} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'text-xs leading-snug text-sidebar-foreground',
                    n.readByMe && 'text-sidebar-foreground/60',
                  )}>
                    <span className="font-medium">{n.title}</span>
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-sidebar-foreground/60 line-clamp-2">
                    {n.message}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-sidebar-foreground/40">
                      {format.relativeTime(n.apiCreatedAt, Date.now())}
                    </span>
                    {!n.readByMe && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead(n.id);
                        }}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      >
                        <CheckCheck className="h-3 w-3" aria-hidden />
                        {t('markRead')}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
