import { Link } from '@/i18n/navigation';
import { StatusBadge } from '@/components/status-badge';
import { DocumentRowAction } from '@/components/document-row-action';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Document, DocumentSortField } from '@/lib/api';

interface DocumentTableLabels {
  sequential: string;
  buyer: string;
  date: string;
  total: string;
  status: string;
  empty: string;
  emptyFiltered?: string;
  error: string;
}

interface DocumentTableSort {
  field: DocumentSortField | null;
  dir: 'asc' | 'desc';
  hrefFor: (field: DocumentSortField) => string;
}

interface DocumentTableProps {
  documents: Document[];
  fetchError?: boolean;
  hasActiveFilters?: boolean;
  labels: DocumentTableLabels;
  from?: string;
  sort?: DocumentTableSort;
}

function SortableHead({
  field,
  label,
  className,
  sort,
}: {
  field: DocumentSortField;
  label: string;
  className?: string;
  sort?: DocumentTableSort;
}) {
  if (!sort) {
    return (
      <TableHead className={cn('text-xs font-medium uppercase tracking-wide text-muted-foreground', className)}>
        {label}
      </TableHead>
    );
  }

  const isActive = sort.field === field;
  const Icon = isActive ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;

  return (
    <TableHead className={cn('text-xs font-medium uppercase tracking-wide text-muted-foreground', className)}>
      <Link
        href={sort.hrefFor(field)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          isActive && 'text-foreground'
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </Link>
    </TableHead>
  );
}

export function DocumentTable({
  documents,
  fetchError,
  hasActiveFilters,
  labels,
  from,
  sort,
}: DocumentTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <SortableHead field="sequential" label={labels.sequential} className="pl-4" sort={sort} />
            <SortableHead field="buyerName" label={labels.buyer} sort={sort} />
            <SortableHead field="issueDate" label={labels.date} sort={sort} />
            <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.total}
            </TableHead>
            <SortableHead field="status" label={labels.status} sort={sort} />
            <TableHead className="pr-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetchError ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="py-16 text-center text-sm text-destructive">
                {labels.error}
              </TableCell>
            </TableRow>
          ) : documents.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                {hasActiveFilters ? labels.emptyFiltered ?? labels.empty : labels.empty}
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <TableRow key={doc.accessKey}>
                <TableCell className="pl-4 font-mono text-sm">
                  <Link
                    href={from ? `/invoices/${doc.accessKey}?from=${from}` : `/invoices/${doc.accessKey}`}
                    className="hover:text-primary hover:underline underline-offset-4 transition-colors"
                  >
                    {doc.sequential}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{doc.buyer.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.issueDate}</TableCell>
                <TableCell className="text-right text-sm font-medium">${doc.total}</TableCell>
                <TableCell className="text-sm">
                  <StatusBadge status={doc.status} />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <DocumentRowAction accessKey={doc.accessKey} status={doc.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
