import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { resolveIdleTimeoutMinutes, SESSION_TIMEOUT_CACHE_REFRESH_MS } from '@/lib/session-timeout';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      isSuperAdmin: boolean;
    };
  }
  interface User {
    isSuperAdmin?: boolean;
    tenantId?: string | null;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    isSuperAdmin: boolean;
    tenantId: string | null;
    // Idle-timeout tracking (see the jwt callback below). Absent on a token
    // minted before this was introduced — treated as "expired" so an
    // in-flight session at deploy time is cleanly forced to re-authenticate
    // rather than silently never expiring.
    lastActivityAt?: number;
    idleTimeoutMinutes?: number;
    idleTimeoutCheckedAt?: number;
  }
}

/** Tenant.sessionIdleTimeoutMinutes, resolved to the effective default when unset. */
async function fetchIdleTimeoutMinutes(tenantId: string | null): Promise<number> {
  if (!tenantId) return resolveIdleTimeoutMinutes(null);
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { sessionIdleTimeoutMinutes: true },
  });
  return resolveIdleTimeoutMinutes(tenant?.sessionIdleTimeoutMinutes);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user?.passwordHash) return null;
        if (!user.active) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );
        if (!valid) return null;

        return {
          id: String(user.id),
          email: user.email,
          isSuperAdmin: user.isSuperAdmin,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.isSuperAdmin = user.isSuperAdmin ?? false;
        token.tenantId = user.tenantId ?? null;
        token.lastActivityAt = Date.now();
        token.idleTimeoutMinutes = await fetchIdleTimeoutMinutes(token.tenantId);
        token.idleTimeoutCheckedAt = Date.now();
        return token;
      }

      // Subsequent request on an existing session. IMPORTANT: this callback
      // fires on every auth() call — including background polling that isn't
      // real user activity (the notification bell refetches every 60s, the
      // status-polling proxy route, etc.) — so it must NOT treat "the call
      // happened" as activity, or a walked-away tab with a poll still running
      // would never idle out. A token from before this field existed has no
      // lastActivityAt — treat that as expired rather than risking a NaN
      // comparison that would never expire.
      if (typeof token.lastActivityAt !== 'number') {
        return null;
      }

      const idleTimeoutMinutes = token.idleTimeoutMinutes ?? resolveIdleTimeoutMinutes(null);
      const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
      if (Date.now() - token.lastActivityAt > idleTimeoutMs) {
        // Returning null here is the documented way to invalidate a JWT
        // session (@auth/core's session action clears the cookie and auth()
        // resolves to null) — proxy.ts's existing unauthenticated branch
        // already redirects that to /login. A session that already timed out
        // stays timed out even if a heartbeat happens to race in right after —
        // trigger === 'update' below only extends a still-live session.
        return null;
      }

      if (Date.now() - (token.idleTimeoutCheckedAt ?? 0) > SESSION_TIMEOUT_CACHE_REFRESH_MS) {
        token.idleTimeoutMinutes = await fetchIdleTimeoutMinutes(token.tenantId);
        token.idleTimeoutCheckedAt = Date.now();
      }

      // Only an explicit `useSession().update()` call — fired by
      // <IdleActivityTracker> on real mouse/keyboard/touch/scroll input,
      // throttled client-side — resets the activity clock. Every other call
      // (page renders, Server Actions, background polling) leaves it
      // untouched, which is what makes this an *idle* timeout rather than a
      // flat session lifetime that any request happens to keep alive.
      if (trigger === 'update') {
        token.lastActivityAt = Date.now();
      }

      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.isSuperAdmin = token.isSuperAdmin;
      return session;
    },
  },
});
