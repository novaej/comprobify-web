import type { ComponentProps, ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  backHref?: ComponentProps<typeof Link>['href'];
  backLabel?: string;
}

export function PageHeader({ title, description, action, className, backHref, backLabel }: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {backHref && backLabel && (
        <Link
          href={backHref}
          className="mb-3 flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && (
          <div className="flex shrink-0 items-center gap-2 mt-3 sm:mt-0">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
