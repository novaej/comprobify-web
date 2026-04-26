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
        if (!user) return null;

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

      // Always read mutable fields fresh from DB so UI reflects changes
      // immediately after issuer setup or production promotion.
      const user = await db.user.findUnique({
        where: { id: Number(token.id) },
        select: { environment: true, comprobifyIssuerId: true },
      });
      session.user.environment = user?.environment ?? 'sandbox';
      session.user.hasIssuer = user?.comprobifyIssuerId != null;

      return session;
    },
  },
});
