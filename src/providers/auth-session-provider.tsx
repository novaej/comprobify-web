'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

// Exists solely so <IdleActivityTracker> can call useSession().update() to
// signal real activity to src/auth.ts's jwt callback (see the "Per-tenant
// session idle timeout" pattern in CLAUDE.md). No refetch-on-focus/interval —
// this app doesn't otherwise use client-side session state (BFF pattern,
// session data flows through Server Component props instead).
export function AuthSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
