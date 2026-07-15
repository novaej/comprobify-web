import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import type { DocumentStatus } from '@/lib/api';

const statusStyles: Record<DocumentStatus, string> = {
  SIGNED: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
  PENDING_SEND: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  RECEIVED: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  AUTHORIZED: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  RETURNED: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
  NOT_AUTHORIZED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
};

interface StatusBadgeProps {
  status: DocumentStatus;
}

// Client component — uses useTranslations for status label lookup.
export function StatusBadge({ status }: StatusBadgeProps) {
  const t = useTranslations('status');

  return (
    <Badge
      variant="outline"
      className={statusStyles[status] ?? 'bg-zinc-100 text-zinc-700 border-zinc-200'}
    >
      {t(status)}
    </Badge>
  );
}
