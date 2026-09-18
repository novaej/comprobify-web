import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/auth';
import { RecoverAccountForm } from '@/components/recover-account-form';
import { Link } from '@/i18n/navigation';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { LogoLockupStacked } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { logoutAction } from '@/app/actions/auth';
import { ForceHardRedirect } from '@/components/force-hard-redirect';
import { ChevronLeft } from 'lucide-react';

export default async function RecoverAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Recovery matches by email+cert alone, never by session — it's entirely
  // session-independent now, including the auto-link branch (see
  // recoverAccountAction, which resolves the local login to attach by the
  // *submitted* email, not any currently-browsing session). So any session
  // found here is unrelated to what this page does (e.g. mid-onboarding
  // after a CONFLICT, or a fully onboarded user randomly landing here), and
  // *every* path off this page back toward /login (the header link, the
  // logo, direct navigation) would otherwise inherit that stale session and
  // get redirected based on its state instead of showing a real login form.
  // Bounce through a forced sign-out before rendering anything, so the whole
  // page — and everywhere it links — starts from a clean, logged-out slate.
  // signOut() can't be called here directly (Server Components can't write
  // response headers mid-render, Common Mistake #39), hence the Route
  // Handler round trip. That bounce has to be a real browser navigation
  // (<ForceHardRedirect>), not next/navigation's redirect() — this page is
  // commonly reached via a soft <Link> click elsewhere in the app, and
  // redirect()'s client-router-mediated navigation can't correctly follow a
  // target that's a Route Handler performing its own further HTTP redirect
  // (confirmed: the request showed up with Next's `_rsc` query param,
  // meaning it went through the client router instead of a real page load —
  // the page rendered blank because the router had nothing valid to display
  // for it).
  const session = await auth();
  if (session?.user?.id) {
    return <ForceHardRedirect href={`/api/auth/signout-recover?locale=${locale}`} />;
  }

  const t = await getTranslations('recoverAccount');
  const tAuth = await getTranslations('auth');

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        {/* logoutAction, not a plain link to /login — this page is reachable
            while already authenticated as an unrelated account (e.g. mid
            onboarding after a CONFLICT), and /login redirects an
            authenticated session away from itself based on whatever that
            session's own state is, not what the user actually wants. */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('backToLogin')}
          </button>
        </form>
        <div className="flex items-center gap-2">
          <ThemeToggle className="text-muted-foreground hover:bg-accent hover:text-accent-foreground" />
          <LocaleSwitcher />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-7 text-center">
            <a href={`/${locale}`} className="inline-block">
              <LogoLockupStacked variant="light" className="mx-auto w-48 mb-4 dark:hidden" />
              <LogoLockupStacked variant="dark" className="mx-auto w-48 mb-4 hidden dark:block" />
            </a>
            <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <RecoverAccountForm />
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            <Link
              href="/support"
              className="hover:text-foreground hover:underline underline-offset-4 transition-colors"
            >
              {tAuth('needHelp')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
