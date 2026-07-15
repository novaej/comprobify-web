import createMiddleware from 'next-intl/middleware';
import { auth } from './auth';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

const PUBLIC_ROUTES = /^\/(es|en)(\/(?:login|register|verify-email|onboarding|complete-registration|pricing|support)(?:\/.*)?)?$/;

// Routes that belong on the marketing domain (comprobify.com).
// Everything else belongs on the app domain (app.comprobify.com).
const MARKETING_ROUTES = /^\/(es|en)(\/pricing)?$/;

// Explicit domain pairs so the mapping is auditable.
const DOMAIN_PAIR: Record<string, string> = {
  'comprobify.com': 'app.comprobify.com',
  'staging.comprobify.com': 'app-staging.comprobify.com',
  'app.comprobify.com': 'comprobify.com',
  'app-staging.comprobify.com': 'staging.comprobify.com',
};

const MARKETING_HOSTS = new Set(Object.keys(DOMAIN_PAIR).filter((h) => !h.startsWith('app')));
const APP_HOSTS = new Set(Object.keys(DOMAIN_PAIR).filter((h) => h.startsWith('app')));

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';

  if (MARKETING_HOSTS.has(host)) {
    // Marketing host: only serve marketing routes; redirect everything else to the app host.
    const isMarketingPath = MARKETING_ROUTES.test(pathname) || pathname === '/';
    if (!isMarketingPath) {
      const sibling = DOMAIN_PAIR[host];
      return Response.redirect(
        new URL(pathname + req.nextUrl.search, `https://${sibling}`),
        301,
      );
    }
  } else if (APP_HOSTS.has(host)) {
    // App host: marketing routes belong on the marketing host; redirect them.
    const isMarketingPath = MARKETING_ROUTES.test(pathname) || pathname === '/';
    if (isMarketingPath) {
      const sibling = DOMAIN_PAIR[host];
      return Response.redirect(
        new URL(pathname + req.nextUrl.search, `https://${sibling}`),
        301,
      );
    }
  }
  // localhost / unknown hosts: no hostname routing — serve everything locally.

  const isPublic = PUBLIC_ROUTES.test(pathname) || pathname === '/';

  if (!req.auth && !isPublic) {
    const locale = pathname.split('/')[1] || 'es';
    return Response.redirect(new URL(`/${locale}/login`, req.url));
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
