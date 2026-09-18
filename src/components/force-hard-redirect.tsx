'use client';

import { useEffect } from 'react';

/**
 * Forces a real top-level browser navigation on mount, bypassing the
 * client router entirely. `next/navigation`'s redirect() from a Server
 * Component isn't safe here: if the page was reached via a soft <Link>
 * navigation, that redirect is followed as another client-side RSC fetch
 * — fine when the target is a normal page, but broken when it's a Route
 * Handler that performs its own further HTTP redirect (as
 * /api/auth/signout-recover does), since the client router has no way to
 * render whatever comes back through that chain. window.location.href
 * always talks to the server fresh, the same way <IdleActivityTracker>'s
 * forced logout does.
 */
export function ForceHardRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.href = href;
  }, [href]);

  return null;
}
