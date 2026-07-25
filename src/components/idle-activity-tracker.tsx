'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

// How often real interaction is allowed to ping the server — well under the
// minimum configurable idle timeout (5 min), so this doesn't meaningfully
// blur the actual cutoff, but far apart enough not to spam a request per
// mousemove.
const HEARTBEAT_THROTTLE_MS = 60_000;

// How often the client checks its own elapsed-idle clock against the
// configured timeout, to decide whether to force a redirect. Independent of
// the heartbeat throttle above — this is a local comparison, no request.
const IDLE_CHECK_INTERVAL_MS = 15_000;

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

interface IdleActivityTrackerProps {
  idleTimeoutMinutes: number;
  locale: string;
}

/**
 * Invisible. Does two things, both keyed off the same real-interaction
 * events (mousemove/keydown/click/scroll/touchstart):
 *
 * 1. Pings src/auth.ts's jwt callback (via useSession().update({})),
 *    throttled — this is the server-side enforcement signal. See
 *    CLAUDE.md's "Per-tenant session idle timeout" pattern for why ordinary
 *    page renders and background polling deliberately do NOT reset the
 *    clock on their own.
 * 2. Proactively forces a hard `window.location` redirect to /login once
 *    the configured idle window elapses, instead of waiting for the user to
 *    click something. This matters because a Nav link that's been sitting
 *    on screen through the whole idle window may have been prefetched by
 *    Next's Router Cache *while the session was still valid* — clicking it
 *    after expiry can serve that stale, pre-expiry cached page instead of
 *    hitting the server fresh, since a purely time-based expiry never told
 *    the client's cache anything changed. A hard navigation always talks to
 *    the server fresh and bypasses the Router Cache entirely.
 */
export function IdleActivityTracker({ idleTimeoutMinutes, locale }: IdleActivityTrackerProps) {
  const { update } = useSession();
  const lastHeartbeatSentRef = useRef(0);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    function handleActivity() {
      lastActivityRef.current = Date.now();

      const now = Date.now();
      if (now - lastHeartbeatSentRef.current < HEARTBEAT_THROTTLE_MS) return;
      lastHeartbeatSentRef.current = now;
      // update({}) — not update() — is deliberate: next-auth's client only
      // POSTs (the request shape that carries `trigger: 'update'` into the
      // jwt callback) when a truthy `data` argument is passed; a bare
      // update() call has no body and silently falls back to a plain GET,
      // which would never reach the trigger === 'update' branch at all.
      update({});
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [update]);

  useEffect(() => {
    const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > idleTimeoutMs) {
        window.location.href = `/${locale}/login?reason=idle`;
      }
    }, IDLE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [idleTimeoutMinutes, locale]);

  return null;
}
