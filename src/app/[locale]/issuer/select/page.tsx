import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireContext } from '@/lib/context';
import { db } from '@/lib/db';
import { IssuerSelectList } from '@/components/issuer-select-list';
import { LogoLockupStacked } from '@/components/logo';

export default async function IssuerSelectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireContext({ skipIssuer: true });
  const t = await getTranslations('issuerSelect');

  const isOwnerOrAdmin = ctx.user.role === 'Owner' || ctx.user.role === 'Admin';
  let issuerIds: string[] | null = null;
  if (!isOwnerOrAdmin) {
    const access = await db.userIssuerAccess.findMany({
      where: { tenantId: ctx.tenant.id, userId: ctx.user.id },
      select: { issuerId: true },
    });
    issuerIds = access.map((a) => a.issuerId);
  }

  const issuers = await db.issuer.findMany({
    where: {
      tenantId: ctx.tenant.id,
      active: true,
      ...(issuerIds !== null ? { id: { in: issuerIds } } : {}),
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return (
    <div className="min-h-screen bg-muted/40 flex items-start justify-center p-4 pt-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoLockupStacked variant="light" className="h-16 w-auto dark:hidden" />
          <LogoLockupStacked variant="dark" className="hidden h-16 w-auto dark:block" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          </div>
        </div>

        <IssuerSelectList issuers={issuers} />
      </div>
    </div>
  );
}
