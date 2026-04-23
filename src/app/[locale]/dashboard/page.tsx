import { setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { SandboxBanner } from '@/components/sandbox-banner';
import { StatusBadge } from '@/components/status-badge';
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
import { Plus } from 'lucide-react';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard');

  const { data: documents } = await listDocuments({ limit: 50 });

  return (
    <div className="space-y-6">
      <SandboxBanner />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Link href="/invoices/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newInvoice')}
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('table.sequential')}</TableHead>
            <TableHead>{t('table.buyer')}</TableHead>
            <TableHead>{t('table.date')}</TableHead>
            <TableHead className="text-right">{t('table.total')}</TableHead>
            <TableHead>{t('table.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                {t('table.empty')}
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <TableRow key={doc.accessKey}>
                <TableCell className="font-mono">
                  <Link
                    href={`/invoices/${doc.accessKey}`}
                    className="hover:underline"
                  >
                    {doc.sequential}
                  </Link>
                </TableCell>
                <TableCell>{doc.buyer.name}</TableCell>
                <TableCell>{doc.issueDate}</TableCell>
                <TableCell className="text-right">${doc.total}</TableCell>
                <TableCell>
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
