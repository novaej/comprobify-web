'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { inviteUserAction, updateUserRoleAction, removeUserAction } from '@/app/actions/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus } from 'lucide-react';
import type { Role } from '@/lib/rbac';

const ROLES: Role[] = ['Owner', 'Admin', 'BillingOperator', 'Viewer', 'Developer'];

interface UserRow {
  id: number;
  email: string;
  role: string;
  inviteStatus: string;
  issuerIds: number[];
}

interface IssuerRow {
  id: number;
  branchCode: string;
  issuePointCode: string;
  businessName: string;
  tradeName: string | null;
}

export function UserManager({
  users,
  issuers,
  currentUserId,
  canManage,
}: {
  users: UserRow[];
  issuers: IssuerRow[];
  currentUserId: number;
  canManage: boolean;
}) {
  const t = useTranslations('users');
  const [isPending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Viewer');
  const [error, setError] = useState<string | null>(null);

  function handleInvite() {
    setError(null);
    startTransition(async () => {
      const result = await inviteUserAction(inviteEmail, inviteRole);
      if (result?.error) {
        setError(result.error);
      } else {
        setInviteEmail('');
        setShowInvite(false);
      }
    });
  }

  function handleRoleChange(userId: number, role: Role) {
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, role);
      if (result?.error) setError(result.error);
    });
  }

  function handleRemove(userId: number) {
    if (!confirm(t('confirmRemove'))) return;
    startTransition(async () => {
      const result = await removeUserAction(userId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canManage && (
        showInvite ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">{t('invite')}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                placeholder={t('emailPlaceholder')}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={isPending}
                className="sm:max-w-xs"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                disabled={isPending}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{t(`role.${r}` as Parameters<typeof t>[0])}</option>
                ))}
              </select>
              <Button size="sm" onClick={handleInvite} disabled={isPending || !inviteEmail}>
                {isPending ? t('inviting') : t('sendInvite')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowInvite(false)} disabled={isPending}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            {t('invite')}
          </Button>
        )
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.email')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.role')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.status')}</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 font-medium">{user.email}</td>
                  <td className="px-4 py-3">
                    {canManage && user.id !== currentUserId ? (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                        disabled={isPending}
                        className="rounded border border-border bg-background px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{t(`role.${r}` as Parameters<typeof t>[0])}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-muted-foreground">{t(`role.${user.role}` as Parameters<typeof t>[0])}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.inviteStatus === 'ACTIVE'
                        ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                    }`}>
                      {t(`status.${user.inviteStatus}` as Parameters<typeof t>[0])}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {user.id !== currentUserId && (
                        <button
                          onClick={() => handleRemove(user.id)}
                          disabled={isPending}
                          className="text-xs text-destructive hover:underline disabled:opacity-50"
                        >
                          {t('remove')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
