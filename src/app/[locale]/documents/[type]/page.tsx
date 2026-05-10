import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { buttonVariants } from '@/components/ui/button';
import { listDocuments } from '@/lib/api';
import { requireApiKey } from '@/lib/auth-token';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, Plus } from 'lucide-react';
import type { Document } from '@/lib/api';

const CREATE_HREFS: Record<string, string> = {
  '01': '/invoices/new',
};

export default async function DocumentListPage({
  params,
}: {
  params: Promise<{ locale: string; type: string }>;
}) {
  const { locale, type } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('documents');

  const apiKey = await requireApiKey();
  let documents: Document[] = [];
  let fetchError = false;
  try {
    ({ data: documents } = await listDocuments(apiKey, { documentType: type, limit: 50 }));
  } catch {
    fetchError = true;
  }

  const nameKey = `types.${type}.name` as Parameters<typeof t>[0];
  const typeName = t.has(nameKey) ? t(nameKey) : type;
  const createHref = CREATE_HREFS[type];

  return (
    <div>
      <Link
        href="/documents"
        className="mb-4 flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('title')}
      </Link>

      <PageHeader
        title={typeName}
        action={
          createHref ? (
            <Link href={createHref} className={buttonVariants({ size: 'sm' })}>
              <Plus className="h-4 w-4" />
              {t('createNew')}
            </Link>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="pl-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('list.table.sequential')}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('list.table.buyer')}
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('list.table.date')}
              </TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('list.table.total')}
              </TableHead>
              <TableHead className="pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('list.table.status')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fetchError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16 text-center text-sm text-destructive">
                  {t('list.error')}
                </TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                  {t('list.empty')}
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
