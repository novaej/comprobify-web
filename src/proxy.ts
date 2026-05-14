import createMiddleware from 'next-intl/middleware';
import { auth } from './auth';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PUBLIC_ROUTES = /^\/(es|en)\/(login|register|verify-email|onboarding)(\/.*)?$/;

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_ROUTES.test(pathname) || pathname === '/';

  if (!req.auth && !isPublic) {
    const locale = pathname.split('/')[1] || 'es';
    return Response.redirect(new URL(`/${locale}/login`, req.url));
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
