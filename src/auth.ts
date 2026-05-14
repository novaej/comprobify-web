import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      environment: string;
      hasIssuer: boolean;
      isEmailVerified: boolean;
    };
  }
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

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );
        if (!valid) return null;

        return { id: String(user.id), email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;

      // Phase 2 will replace this with requireContext() which reads from Tenant + TenantApiKey.
      const user = await db.user.findUnique({
        where: { id: Number(token.id) },
        select: { emailVerified: true },
      });
      session.user.environment = 'sandbox';   // Phase 2: derive from Tenant.environment
      session.user.hasIssuer = false;          // Phase 2: derive from context cookie / issuer count
      session.user.isEmailVerified = user?.emailVerified ?? false;

      return session;
    },
  },
});
