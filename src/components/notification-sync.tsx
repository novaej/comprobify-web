'use client';

import { useEffect } from 'react';
import { catchUpNotificationsAction } from '@/app/actions/notifications';

/**
 * Invisible component mounted once in the authenticated layout.
 * Fires a catch-up poll on first client mount so the notification bell
 * is populated immediately after login even if some webhooks were missed.
 */
export function NotificationSync() {
  useEffect(() => {
    // Best-effort — a network blip here shouldn't leave an unhandled rejection;
    // the bell's own poll (notification-bell.tsx) will catch up shortly after anyway.
    catchUpNotificationsAction().catch(() => {});
  }, []); // empty deps — runs once per hard page load / login

  return null;
}
