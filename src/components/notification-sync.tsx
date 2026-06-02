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
    void catchUpNotificationsAction();
  }, []); // empty deps — runs once per hard page load / login

  return null;
}
