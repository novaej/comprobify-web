import { Link } from '@/i18n/navigation';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Document } from '@/lib/api';

interface DocumentTableLabels {
  sequential: string;
  buyer: string;
  date: string;
  total: string;
  status: string;
  empty: string;
  error: string;
}

interface DocumentTableProps {
  documents: Document[];
  fetchError?: boolean;
  labels: DocumentTableLabels;
}

export function DocumentTable({ documents, fetchError, labels }: DocumentTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.sequential}
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.buyer}
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.date}
            </TableHead>
            <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.total}
            </TableHead>
            <TableHead className="pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {labels.status}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fetchError ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-16 text-center text-sm text-destructive">
                {labels.error}
              </TableCell>
            </TableRow>
          ) : documents.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                {labels.empty}
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <TableRow key={doc.accessKey}>
                <TableCell className="pl-4 font-mono text-sm">
                  <Link
                    href={`/invoices/${doc.accessKey}`}
                    className="hover:text-primary hover:underline underline-offset-4 transition-colors"
                  >
                    {doc.sequential}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{doc.buyer.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.issueDate}</TableCell>
                <TableCell className="text-right text-sm font-medium">${doc.total}</TableCell>
                <TableCell className="pr-4">
                  <StatusBadge status={doc.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
