import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationData } from '@/lib/api';

interface DocumentPaginationProps {
  pagination: PaginationData;
  hrefFor: (page: number) => string;
  labels: {
    previous: string;
    next: string;
    pageInfo: string;
  };
}

export function getTotalPages({ total, limit }: PaginationData): number {
  return Math.max(1, Math.ceil(total / limit));
}

export function DocumentPagination({ pagination, hrefFor, labels }: DocumentPaginationProps) {
  const { page } = pagination;
  const totalPages = getTotalPages(pagination);
  if (totalPages <= 1) return null;

  return (
    <Pagination className="mt-4">
      <PaginationContent className="w-full justify-between">
        <PaginationItem>
          {page > 1 ? (
            <Link
              href={hrefFor(page - 1)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{labels.previous}</span>
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'gap-1.5 pointer-events-none opacity-50'
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{labels.previous}</span>
            </span>
          )}
        </PaginationItem>

        <PaginationItem>
          <p className="text-sm text-muted-foreground">{labels.pageInfo}</p>
        </PaginationItem>

        <PaginationItem>
          {page < totalPages ? (
            <Link
              href={hrefFor(page + 1)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <span className="hidden sm:inline">{labels.next}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'gap-1.5 pointer-events-none opacity-50'
              )}
            >
              <span className="hidden sm:inline">{labels.next}</span>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
