'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { Globe } from 'lucide-react';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { updateLanguageAction } from '@/app/actions/tenant';
import { cn } from '@/lib/utils';
import type { listNotificationsAction } from '@/app/actions/notifications';

type NotificationItem = Awaited<ReturnType<typeof listNotificationsAction>>['notifications'][number];

const locales = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
] as const;

interface TopBarProps {
  initialUnreadCount: number;
  initialNotifications: NotificationItem[];
}

export function TopBar({ initialUnreadCount, initialNotifications }: TopBarProps) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleLocaleChange(code: string) {
    if (code === locale) return;
    updateLanguageAction(code).catch(() => {});
    const query = searchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { locale: code as 'es' | 'en' });
  }

  return (
    <div className="hidden md:flex h-12 shrink-0 items-center justify-end gap-1 border-b border-border bg-background px-4">
      <NotificationBell
        initialUnreadCount={initialUnreadCount}
        initialNotifications={initialNotifications}
      />
      <div className="mx-1 h-4 w-px bg-border" />
      <div className="flex items-center gap-0.5" title={t('languageTooltip')}>
        <Globe className="h-3.5 w-3.5 text-muted-foreground/50 mr-0.5" aria-hidden />
        {locales.map(({ code, label }) => (
          <button
            key={code}
            onClick={() => handleLocaleChange(code)}
            className={cn(
              'rounded px-1.5 py-0.5 text-xs transition-colors',
              locale === code
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground/40 hover:text-muted-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ThemeToggle className="text-muted-foreground/60 hover:bg-accent hover:text-accent-foreground" />
    </div>
  );
}
