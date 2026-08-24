import { getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { AdminRateLimitRetryButton } from '@/components/admin-rate-limit-retry-button';

// Shown in place of a page's data when the shared admin API secret hits
// COMPROBIFY_API_URL's IP-keyed adminLimiter (20 req/min across the whole
// admin panel, not per-admin — see ../comprobify/src/middleware/rate-limit.js).
// A friendly inline notice instead of letting the ApiError propagate to
// admin/error.tsx: that boundary can't read err.code reliably (Next.js strips
// custom Error properties crossing the server->client boundary, see CLAUDE.md
// Common Mistake #28), so this is caught inside the page's Server Component
// instead, before it becomes an unhandled throw.
export async function AdminRateLimitNotice() {
  const t = await getTranslations('admin.rateLimited');

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t('message')}</span>
      </div>
      <AdminRateLimitRetryButton label={t('retry')} />
    </div>
  );
}
