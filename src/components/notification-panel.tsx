'use client';

import { useTranslations, useFormatter } from 'next-intl';
import { AlertCircle, AlertTriangle, Info, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { listNotificationsAction } from '@/app/actions/notifications';

type Notification = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

interface NotificationPanelProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkRead: (id: number) => void;
  onClose: () => void;
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
}: NotificationPanelProps) {
  const t = useTranslations('notifications');
  const format = useFormatter();

  const unread = notifications.filter((n) => !n.readByMe);

  return (
    <div
      className={cn(
        'absolute right-0 top-full z-50 mt-2',
        'w-80 rounded-lg border border-sidebar-border bg-sidebar shadow-xl',
        'flex flex-col overflow-hidden',
        // On mobile: full-width, anchored to the right edge of the screen.
        'max-sm:fixed max-sm:inset-x-2 max-sm:right-2 max-sm:w-auto'
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
          notifications.map((n) => (
            <li
              key={n.id}
              className={cn(
                'flex gap-3 px-4 py-3 transition-colors',
                !n.readByMe && 'bg-sidebar-accent/30',
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
                    {format.relativeTime(n.apiCreatedAt)}
                  </span>
                  {!n.readByMe && (
                    <button
                      onClick={() => onMarkRead(n.id)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    >
                      <CheckCheck className="h-3 w-3" aria-hidden />
                      {t('markRead')}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
