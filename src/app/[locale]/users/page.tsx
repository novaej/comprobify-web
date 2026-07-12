import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/context';
import { db } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { UserManager } from '@/components/user-manager';

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('users');

  const ctx = await requirePermission('users.read', { skipIssuer: true });

  const [users, issuers] = await Promise.all([
    db.user.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: 'asc' },
      include: { issuerAccess: { select: { issuerId: true } } },
    }),
    db.issuer.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, branchCode: true, issuePointCode: true, businessName: true, tradeName: true },
    }),
  ]);

  const canManage = ctx.permissions.has('users.manage');

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      <UserManager
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role ?? 'Viewer',
          inviteStatus: u.inviteStatus,
          active: u.active,
          issuerIds: u.issuerAccess.map((a) => a.issuerId),
        }))}
        issuers={issuers}
        currentUserId={ctx.user.id}
        currentUserRole={ctx.user.role}
        canManage={canManage}
      />
    </div>
  );
}
