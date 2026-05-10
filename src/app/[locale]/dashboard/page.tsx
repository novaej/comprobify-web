import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { StatusBadge } from '@/components/status-badge';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listDocuments } from '@/lib/api';
import { requireApiKey } from '@/lib/auth-token';
import { Plus } from 'lucide-react';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  const apiKey = await requireApiKey();
  const { data: documents } = await listDocuments(apiKey, { limit: 50 });

  return (
    <div>
      <PageHeader
        title={t('title')}
        action={
          <Link href="/invoices/new" className={buttonVariants({ size: 'sm' })}>
            <Plus className="h-4 w-4" />
            {t('newInvoice')}
          </Link>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('table.sequential')}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('table.buyer')}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('table.date')}
              </TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('table.total')}
              </TableHead>
              <TableHead className="pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('table.status')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                  {t('table.empty')}
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
    </div>
  );
}
