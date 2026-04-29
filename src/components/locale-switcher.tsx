'use client';

import { useLocale } from 'next-intl';
import { usePathname, Link } from '@/i18n/navigation';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const locales = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
] as const;

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {locales.map(({ code, label }) => (
        <Link
          key={code}
          href={pathname}
          locale={code}
          className={cn(
            'rounded px-1.5 py-0.5 text-xs transition-colors',
            locale === code
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
