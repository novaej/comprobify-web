'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toastApiError } from '@/lib/api-error-toast';
import { NotificationPanel } from './notification-panel';
import { listNotificationsAction, markNotificationReadAction } from '@/app/actions/notifications';

type Notification = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

interface NotificationBellProps {
  initialUnreadCount: number;
  initialNotifications: Notification[];
}

export function NotificationBell({ initialUnreadCount, initialNotifications }: NotificationBellProps) {
  const tError = useTranslations('apiError');
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Close on outside click (the panel is portaled to document.body, so it
  // sits outside `ref` — check it separately or it would close on every click inside it)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Adopt freshly server-rendered notifications/unread count whenever the parent
  // layout re-renders with new props (e.g. after a navigation following
  // `revalidatePath` from catchUpNotificationsAction/markNotificationReadAction).
  // `useState(initialUnreadCount)` above only seeds state on first mount — this
  // component stays mounted across client-side navigation (it lives in the
  // persistent Nav/TopBar shell), so without this effect a fresher server render
  // is silently ignored and the badge only ever updates via the 60s poll below
  // or a full page reload.
  useEffect(() => {
    setNotifications(initialNotifications);
    setUnreadCount(initialUnreadCount);
  }, [initialNotifications, initialUnreadCount]);

  function handleToggle() {
    if (!open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  }

  // Refresh notifications from server. Swallows failures silently (no toast) --
  // this also runs unattended every 60s for as long as the tab stays open, and a
  // transient network blip (laptop sleep/wake, wifi change) shouldn't crash the
  // whole page to the error boundary; the next scheduled poll just retries.
  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await listNotificationsAction();
        setNotifications(result.notifications);
        const unread = result.notifications.filter((n) => !n.readByMe).length;
        setUnreadCount(unread);
      } catch {
        // best-effort refresh; next interval tick or panel open retries
      }
    });
  }, []);

  // Refresh when panel opens
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Background poll — keep the unread badge current while the page is open.
  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  function handleMarkRead(id: string) {
    startTransition(async () => {
      try {
        await markNotificationReadAction(id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readByMe: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        toastApiError('UNKNOWN', tError);
      }
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-label="Notificaciones"
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
          'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          open && 'bg-sidebar-accent text-sidebar-accent-foreground'
        )}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <NotificationPanel
          notifications={notifications}
          isLoading={isPending}
          onMarkRead={handleMarkRead}
          onClose={() => setOpen(false)}
          panelRef={panelRef}
          style={{ top: pos.top, right: pos.right }}
        />,
        document.body,
      )}
    </div>
  );
}
