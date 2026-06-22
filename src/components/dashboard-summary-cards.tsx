import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DocumentStats } from '@/lib/api';

const REVENUE_SIGN: Record<string, 1 | -1> = { FAC: 1, LIQ: 1, DEB: 1, CRE: -1 };
const TYPE_CODE_BY_LABEL: Record<string, string> = {
  FAC: '01',
  LIQ: '03',
  CRE: '04',
  DEB: '05',
  REM: '06',
  RET: '07',
};

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

interface DashboardSummaryCardsProps {
  stats: DocumentStats | null;
  fetchError: boolean;
  labels: {
    issuedThisMonth: string;
    netRevenue: string;
    needsAttention: string;
    noActivity: string;
    error: string;
  };
  typeName: (code: string) => string;
}

export function DashboardSummaryCards({ stats, fetchError, labels, typeName }: DashboardSummaryCardsProps) {
  const totalIssued = stats?.thisMonth.byType.reduce((sum, row) => sum + row.issued, 0) ?? 0;
  const netRevenue =
    stats?.thisMonth.byType.reduce((sum, row) => {
      const sign = REVENUE_SIGN[row.type];
      return sign ? sum + sign * Number(row.authorizedTotal) : sum;
    }, 0) ?? 0;
  const needsAttention = stats?.needsAttention ?? 0;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {labels.issuedThisMonth}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fetchError ? (
            <p className="text-sm text-destructive">{labels.error}</p>
          ) : (
            <>
              <p className="text-3xl font-bold tabular-nums text-foreground">{totalIssued}</p>
              {stats && stats.thisMonth.byType.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {stats.thisMonth.byType.map((row) => (
                    <span key={row.type}>
                      {typeName(TYPE_CODE_BY_LABEL[row.type] ?? row.type)}:{' '}
                      <span className="font-medium text-foreground">{row.issued}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">{labels.noActivity}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {labels.netRevenue}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fetchError ? (
            <p className="text-sm text-destructive">{labels.error}</p>
          ) : (
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {currencyFormatter.format(netRevenue)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {labels.needsAttention}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fetchError ? (
            <p className="text-sm text-destructive">{labels.error}</p>
          ) : (
            <p
              className={cn(
                'text-3xl font-bold tabular-nums',
                needsAttention > 0 ? 'text-destructive' : 'text-foreground'
              )}
            >
              {needsAttention}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
