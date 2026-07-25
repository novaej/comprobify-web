import createMiddleware from 'next-intl/middleware';
import { auth } from './auth';
import { routing } from './i18n/routing';

// Forwarded to Server Components as a request header (see [locale]/layout.tsx) so the
// authenticated Nav/TopBar shell never wraps a marketing page — a child layout like
// (marketing)/layout.tsx can't opt out of markup its parent already wrapped it in, so
// the parent needs to know which route it's rendering.
const MARKETING_ROUTE_HEADER = 'x-marketing-route';

// Same problem, different set of routes: recover-account/forgot-password/reset-password
// deliberately never read the session (an already-authenticated visitor is a normal,
// supported way to land on them — e.g. a stale reset-password email opened after the
// link's own auto-sign-in already happened), so unlike /login or /register they can't
// dodge the Nav wrap with an auth()-and-redirect check. Same fix as the marketing header.
const STANDALONE_ROUTE_HEADER = 'x-standalone-route';
const STANDALONE_ROUTES = /^\/(es|en)\/(recover-account|forgot-password|reset-password)(\/.*)?$/;

// Auth.js v5's default JWT session cookie name (see @auth/core's defaultCookies) —
// this app sets no custom `cookies` config in src/auth.ts, so these are the two
// names in play: the `__Secure-` prefix is added whenever the app runs over https.
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token'];

const intlMiddleware = createMiddleware(routing);

const PUBLIC_ROUTES = /^\/(es|en)(\/(?:login|register|recover-account|forgot-password|reset-password|verify-email|onboarding|complete-registration|pricing|support)(?:\/.*)?)?$/;

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
  const isMarketingPath = MARKETING_ROUTES.test(pathname) || pathname === '/';

  if (MARKETING_HOSTS.has(host)) {
    // Marketing host: only serve marketing routes; redirect everything else to the app host.
    if (!isMarketingPath) {
      const sibling = DOMAIN_PAIR[host];
      return Response.redirect(
        new URL(pathname + req.nextUrl.search, `https://${sibling}`),
        301,
      );
    }
  } else if (APP_HOSTS.has(host)) {
    // App host: marketing routes belong on the marketing host; redirect them.
    if (isMarketingPath) {
      const sibling = DOMAIN_PAIR[host];
      return Response.redirect(
        new URL(pathname + req.nextUrl.search, `https://${sibling}`),
        301,
      );
    }
  }
  // localhost / unknown hosts: no hostname routing — serve everything locally, so a
  // marketing path can reach this point even while authenticated (see header below).

  const isPublic = PUBLIC_ROUTES.test(pathname) || pathname === '/';

  if (!req.auth && !isPublic) {
    const locale = pathname.split('/')[1] || 'es';
    // A session cookie that was sent but didn't resolve to a session almost
    // always means src/auth.ts's jwt callback just invalidated it (idle
    // timeout expired) rather than "never logged in" — surface that distinction
    // on the login page instead of a silent bounce, mirroring the existing
    // ?reason=disabled pattern from /api/auth/signout-disabled.
    const hadSessionCookie = SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
    const reasonParam = hadSessionCookie ? '?reason=idle' : '';
    return Response.redirect(new URL(`/${locale}/login${reasonParam}`, req.url));
  }

  // next-intl's own middleware internally clones `req.headers` into a fresh Headers
  // instance (to forward the resolved locale via the same NextResponse.next({request:
  // {headers}}) mechanism) and returns ITS OWN response built that way. Building a
  // second, separate NextResponse here and copying next-intl's response headers onto
  // it would clobber this header — both responses set the special
  // x-middleware-override-headers/x-middleware-request-* headers, and .set()
  // overwrites rather than merges them. Mutating req.headers before intlMiddleware
  // runs means its own clone picks this header up for free, so there's only ever one
  // response constructed this way.
  req.headers.set(MARKETING_ROUTE_HEADER, isMarketingPath ? '1' : '0');
  req.headers.set(STANDALONE_ROUTE_HEADER, STANDALONE_ROUTES.test(pathname) ? '1' : '0');
  return intlMiddleware(req);
});

export const config = {
  // `.*\..*` excludes any path with a dot (static files, robots.txt, sitemap.xml, ...),
  // but Next's code-generated icon route is served at the bare, extension-less `/icon`
  // (Content-Type comes from a header, not the URL) — so it needs its own explicit
  // exclusion, same as favicon.ico, or this middleware auth-gates/locale-redirects it
  // instead of letting Next return the actual image.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon|.*\\..*).*)',
  ],
};
