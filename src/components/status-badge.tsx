import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import type { DocumentStatus } from '@/lib/api';

const statusStyles: Record<DocumentStatus, string> = {
  SIGNED: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  RECEIVED: 'bg-blue-50 text-blue-700 border-blue-200',
  AUTHORIZED: 'bg-green-50 text-green-700 border-green-200',
  RETURNED: 'bg-orange-50 text-orange-700 border-orange-200',
  NOT_AUTHORIZED: 'bg-red-50 text-red-700 border-red-200',
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
