'use client';

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationPanel } from './notification-panel';
import { listNotificationsAction, markNotificationReadAction } from '@/app/actions/notifications';

type Notification = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

interface NotificationBellProps {
  initialUnreadCount: number;
  initialNotifications: Notification[];
}

export function NotificationBell({ initialUnreadCount, initialNotifications }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Refresh notifications from server
  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await listNotificationsAction();
      setNotifications(result.notifications);
      const unread = result.notifications.filter((n) => !n.readByMe).length;
      setUnreadCount(unread);
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

  function handleMarkRead(id: number) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readByMe: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
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

      {open && (
        <NotificationPanel
          notifications={notifications}
          isLoading={isPending}
          onMarkRead={handleMarkRead}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
