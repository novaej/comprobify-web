import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// In Next.js 16 this file is named proxy.ts (renamed from middleware.ts).
// next-intl still exports createMiddleware which returns the handler function.
export const proxy = createMiddleware(routing);

export const config = {
  matcher: [
    // Match all pathnames except Next.js internals and static files
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
