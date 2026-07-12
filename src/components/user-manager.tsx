'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  inviteUserAction,
  updateUserRoleAction,
  removeUserAction,
  resendInviteAction,
  setUserIssuerAccessAction,
} from '@/app/actions/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { UserPlus, Settings2, Info, Check, Minus, Mail, Trash2 } from 'lucide-react';
import type { Role, Permission } from '@/lib/rbac';
import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { toastApiError } from '@/lib/api-error-toast';

const ROLES: Role[] = ['Owner', 'Admin', 'BillingOperator', 'Viewer', 'Developer'];

const ROLE_CAPABILITY_ROWS: { key: string; permissions: Permission[] }[] = [
  { key: 'createDocuments',      permissions: ['documents.create'] },
  { key: 'viewDocuments',        permissions: ['documents.read'] },
  { key: 'manageDocuments',      permissions: ['documents.manage'] },
  { key: 'clientsCatalog',       permissions: ['clients.manage', 'catalog.manage'] },
  { key: 'viewIssuers',          permissions: ['issuers.read'] },
  { key: 'manageIssuers',        permissions: ['issuers.manage'] },
  { key: 'viewBilling',          permissions: ['billing.read'] },
  { key: 'manageBilling',        permissions: ['billing.manage'] },
  { key: 'viewApiKeys',          permissions: ['apikeys.read'] },
  { key: 'manageApiKeys',        permissions: ['apikeys.manage'] },
  { key: 'viewUsers',            permissions: ['users.read'] },
  { key: 'manageUsers',          permissions: ['users.manage'] },
  { key: 'webhooks',             permissions: ['webhooks.manage'] },
  { key: 'viewNotifications',    permissions: ['notifications.read'] },
  { key: 'manageNotifications',  permissions: ['notifications.manage'] },
  { key: 'accountSettings',      permissions: ['tenant.manage'] },
  { key: 'promoteToProduction',  permissions: ['tenant.promote'] },
];

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
  currentUserRole,
  canManage,
}: {
  users: UserRow[];
  issuers: IssuerRow[];
  currentUserId: number;
  currentUserRole: Role;
  canManage: boolean;
}) {
  const t = useTranslations('users');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Viewer');
  const [accessUserId, setAccessUserId] = useState<number | null>(null);
  const [accessSelection, setAccessSelection] = useState<number[]>([]);

  const assignableRoles = ROLES.filter((r) => r !== 'Owner' || currentUserRole === 'Owner');
  const [showRolesInfo, setShowRolesInfo] = useState(false);
  const [removeUserId, setRemoveUserId] = useState<number | null>(null);

  function handleInvite() {
    startTransition(async () => {
      const result = await inviteUserAction(inviteEmail, inviteRole);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('inviteSuccess', { email: inviteEmail }));
        setInviteEmail('');
        setShowInvite(false);
      }
    });
  }

  function handleResendInvite(userId: number) {
    startTransition(async () => {
      const result = await resendInviteAction(userId);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('resendInviteSuccess'));
      }
    });
  }

  function handleRoleChange(userId: number, role: Role) {
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, role);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('roleSuccess'));
      }
    });
  }

  function handleRemove(userId: number) {
    startTransition(async () => {
      const result = await removeUserAction(userId);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('removeSuccess'));
      }
      setRemoveUserId(null);
    });
  }

  function openAccessDialog(user: UserRow) {
    setAccessUserId(user.id);
    setAccessSelection(user.issuerIds);
  }

  function toggleAccess(issuerId: number) {
    setAccessSelection((prev) =>
      prev.includes(issuerId) ? prev.filter((id) => id !== issuerId) : [...prev, issuerId],
    );
  }

  function handleSaveAccess() {
    if (accessUserId === null) return;
    startTransition(async () => {
      const result = await setUserIssuerAccessAction(accessUserId, accessSelection);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('accessSuccess'));
        setAccessUserId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {canManage && (
        showInvite ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t('invite')}</p>
              <button
                type="button"
                onClick={() => setShowRolesInfo(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
                {t('rolesInfo.button')}
              </button>
            </div>
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
                {assignableRoles.map((r) => (
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
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <UserPlus className="h-4 w-4 mr-1" />
              {t('invite')}
            </Button>
            <button
              type="button"
              onClick={() => setShowRolesInfo(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Info className="h-3.5 w-3.5" />
              {t('rolesInfo.button')}
            </button>
          </div>
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
                {canManage && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('table.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const isOwnerOrAdmin = user.role === 'Owner' || user.role === 'Admin';
                return (
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
                          {(user.role === 'Owner' ? ROLES : assignableRoles).map((r) => (
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {user.inviteStatus === 'INVITED' && (
                            <button
                              onClick={() => handleResendInvite(user.id)}
                              disabled={isPending}
                              title={t('resendInvite')}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                          )}
                          {!isOwnerOrAdmin && (
                            <button
                              onClick={() => openAccessDialog(user)}
                              disabled={isPending}
                              title={t('manageAccess')}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                            >
                              <Settings2 className="h-4 w-4" />
                            </button>
                          )}
                          {user.id !== currentUserId && (
                            <button
                              onClick={() => setRemoveUserId(user.id)}
                              disabled={isPending}
                              title={t('remove')}
                              className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={removeUserId !== null} onOpenChange={(v) => { if (!v) setRemoveUserId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('removeDialog.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('removeDialog.description')}</p>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setRemoveUserId(null)} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => removeUserId !== null && handleRemove(removeUserId)}
              disabled={isPending}
            >
              {isPending ? t('removing') : t('removeDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accessUserId !== null} onOpenChange={(v) => { if (!v) setAccessUserId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('accessDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('accessDialog.description')}</p>
            {issuers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('accessDialog.empty')}</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {issuers.map((issuer) => (
                  <label key={issuer.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={accessSelection.includes(issuer.id)}
                      onChange={() => toggleAccess(issuer.id)}
                      disabled={isPending}
                    />
                    <span>
                      {issuer.tradeName || issuer.businessName} ({issuer.branchCode}-{issuer.issuePointCode})
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setAccessUserId(null)} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={handleSaveAccess} disabled={isPending}>
              {t('accessDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRolesInfo} onOpenChange={setShowRolesInfo}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('rolesInfo.title')}</DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 text-left font-medium text-muted-foreground w-48">{t('rolesInfo.capability')}</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-3 py-2 text-center font-medium">
                      {t(`role.${r}` as Parameters<typeof t>[0])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ROLE_CAPABILITY_ROWS.map(({ key, permissions }) => (
                  <tr key={key} className="hover:bg-muted/30">
                    <td className="py-2 pr-4 text-muted-foreground">
                      {t(`rolesInfo.capabilities.${key}` as Parameters<typeof t>[0])}
                    </td>
                    {ROLES.map((role) => {
                      const allowed = permissions.some((p) => ROLE_PERMISSIONS[role].has(p));
                      return (
                        <td key={role} className="px-3 py-2 text-center">
                          {allowed
                            ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mx-auto" />
                            : <Minus className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
