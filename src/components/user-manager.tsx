'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  inviteUserAction,
  removeUserAction,
  resendInviteAction,
  updateUserAction,
  toggleUserActiveAction,
  resetUserPasswordAction,
} from '@/app/actions/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  UserPlus, Info, Check, Minus, Mail, Trash2, Pencil, UserX, UserCheck, KeyRound,
} from 'lucide-react';
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
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  inviteStatus: string;
  active: boolean;
  issuerIds: string[];
}

interface IssuerRow {
  id: string;
  branchCode: string;
  issuePointCode: string;
  businessName: string;
  tradeName: string | null;
}

function fullName(user: UserRow): string | null {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

function effectiveStatus(user: UserRow, isActive: boolean): 'ACTIVE' | 'INVITED' | 'DISABLED' {
  if (!isActive) return 'DISABLED';
  if (user.inviteStatus === 'INVITED') return 'INVITED';
  return 'ACTIVE';
}

function statusBadgeClass(status: 'ACTIVE' | 'INVITED' | 'DISABLED'): string {
  if (status === 'ACTIVE')   return 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400';
  if (status === 'INVITED')  return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
}

function roleBadgeClass(role: string): string {
  if (role === 'Owner')  return 'bg-primary/10 text-primary';
  if (role === 'Admin')  return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400';
  return 'bg-muted text-muted-foreground';
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
  currentUserId: string;
  currentUserRole: Role;
  canManage: boolean;
}) {
  const t = useTranslations('users');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Viewer');

  // Roles info dialog
  const [showRolesInfo, setShowRolesInfo] = useState(false);

  // Remove confirm dialog
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);

  // Edit dialog
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editRole, setEditRole] = useState<Role>('Viewer');
  const [editIssuerIds, setEditIssuerIds] = useState<string[]>([]);

  // Reset password confirm
  const [resetUserId, setResetUserId] = useState<string | null>(null);

  // Optimistic active states
  const [activeStates, setActiveStates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(users.map((u) => [u.id, u.active])),
  );

  const assignableRoles = ROLES.filter((r) => r !== 'Owner' || currentUserRole === 'Owner');

  // ---- Handlers ----

  function handleInvite() {
    startTransition(async () => {
      const result = await inviteUserAction(inviteEmail, inviteRole);
      if (result?.error) { toastApiError(result.error, tError); }
      else { toast.success(t('inviteSuccess', { email: inviteEmail })); setInviteEmail(''); setShowInvite(false); }
    });
  }

  function handleResendInvite(userId: string) {
    startTransition(async () => {
      const result = await resendInviteAction(userId);
      if (result?.error) { toastApiError(result.error, tError); }
      else { toast.success(t('resendInviteSuccess')); }
    });
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      const result = await removeUserAction(userId);
      if (result?.error) { toastApiError(result.error, tError); }
      else { toast.success(t('removeSuccess')); }
      setRemoveUserId(null);
    });
  }

  function openEditDialog(user: UserRow) {
    setEditUser(user);
    setEditFirst(user.firstName ?? '');
    setEditLast(user.lastName ?? '');
    setEditRole(user.role as Role);
    setEditIssuerIds(user.issuerIds);
  }

  function handleSaveEdit() {
    if (!editUser) return;
    const isSelf = editUser.id === currentUserId;
    const needsIssuers = !isSelf && editUser.role !== 'Owner' && editUser.role !== 'Admin';

    startTransition(async () => {
      const result = await updateUserAction(editUser.id, {
        firstName: editFirst.trim() || null,
        lastName: editLast.trim() || null,
        role: !isSelf ? editRole : undefined,
        issuerIds: needsIssuers ? editIssuerIds : undefined,
      });
      if (result?.error) { toastApiError(result.error, tError); }
      else { toast.success(t('editSuccess')); setEditUser(null); }
    });
  }

  function handleToggleActive(user: UserRow) {
    const next = !activeStates[user.id];
    setActiveStates((prev) => ({ ...prev, [user.id]: next }));
    startTransition(async () => {
      const result = await toggleUserActiveAction(user.id, next);
      if (result?.error) {
        setActiveStates((prev) => ({ ...prev, [user.id]: !next }));
        toastApiError(result.error, tError);
      } else {
        toast.success(next ? t('enableSuccess') : t('disableSuccess'));
      }
    });
  }

  function handleResetPassword() {
    if (!resetUserId) return;
    startTransition(async () => {
      const result = await resetUserPasswordAction(resetUserId);
      if (result?.error) { toastApiError(result.error, tError); }
      else { toast.success(t('resetPasswordSuccess')); }
      setResetUserId(null);
    });
  }

  // When role changes in the edit dialog, reset issuer selection if switching to/from Owner/Admin
  function handleEditRoleChange(role: Role) {
    setEditRole(role);
    if (role === 'Owner' || role === 'Admin') setEditIssuerIds([]);
  }

  return (
    <div className="space-y-4">
      {/* Invite row */}
      {canManage && (
        showInvite ? (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t('invite')}</p>
              <button type="button" onClick={() => setShowRolesInfo(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Info className="h-3.5 w-3.5" />{t('rolesInfo.button')}
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input type="email" placeholder={t('emailPlaceholder')} value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)} disabled={isPending} className="sm:max-w-xs" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}
                disabled={isPending} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
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
              <UserPlus className="h-4 w-4 mr-1" />{t('invite')}
            </Button>
            <button type="button" onClick={() => setShowRolesInfo(true)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Info className="h-3.5 w-3.5" />{t('rolesInfo.button')}
            </button>
          </div>
        )
      )}

      {/* Users table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.name')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.email')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.issuers')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.role')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.status')}</th>
                {canManage && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.actions')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const isActive = activeStates[user.id] ?? user.active;
                const status = effectiveStatus(user, isActive);
                const name = fullName(user);
                const isOwnerOrAdmin = user.role === 'Owner' || user.role === 'Admin';
                const userIssuers = isOwnerOrAdmin
                  ? null
                  : issuers.filter((i) => user.issuerIds.includes(i.id));

                return (
                  <tr key={user.id} className={!isActive ? 'opacity-60' : undefined}>
                    {/* Name */}
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    {/* Email */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{user.email}</td>
                    {/* Issuers */}
                    <td className="px-4 py-3">
                      {isOwnerOrAdmin ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                          {t('allIssuers')}
                        </span>
                      ) : userIssuers && userIssuers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {userIssuers.map((i) => (
                            <span key={i.id} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" title={i.tradeName || i.businessName}>
                              {i.branchCode}-{i.issuePointCode}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t('noIssuers')}</span>
                      )}
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClass(user.role)}`}>
                        {t(`role.${user.role}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}>
                        {t(`status.${status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    {/* Actions */}
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Resend invite */}
                          {user.inviteStatus === 'INVITED' && (
                            <button onClick={() => handleResendInvite(user.id)} disabled={isPending}
                              title={t('resendInvite')}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
                              <Mail className="h-4 w-4" />
                            </button>
                          )}
                          {/* Edit */}
                          <button onClick={() => openEditDialog(user)} disabled={isPending}
                            title={t('editDialog.title')}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40">
                            <Pencil className="h-4 w-4" />
                          </button>
                          {/* Enable / Disable */}
                          {user.id !== currentUserId && (
                            <button onClick={() => handleToggleActive(user)} disabled={isPending}
                              title={isActive ? t('disable') : t('enable')}
                              className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${
                                isActive
                                  ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                  : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10'
                              }`}>
                              {isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                            </button>
                          )}
                          {/* Remove */}
                          {user.id !== currentUserId && (
                            <button onClick={() => setRemoveUserId(user.id)} disabled={isPending}
                              title={t('remove')}
                              className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40">
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

      {/* ── Edit dialog ── */}
      <Dialog open={editUser !== null} onOpenChange={(v) => { if (!v) setEditUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editDialog.title')}</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{editUser.email}</p>

              {/* Name fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t('editDialog.firstName')}</label>
                  <Input placeholder={t('editDialog.firstNamePlaceholder')} value={editFirst}
                    onChange={(e) => setEditFirst(e.target.value)} disabled={isPending} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t('editDialog.lastName')}</label>
                  <Input placeholder={t('editDialog.lastNamePlaceholder')} value={editLast}
                    onChange={(e) => setEditLast(e.target.value)} disabled={isPending} />
                </div>
              </div>

              {/* Role — only for other users */}
              {editUser.id !== currentUserId && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t('editDialog.role')}</label>
                  <select value={editRole} onChange={(e) => handleEditRoleChange(e.target.value as Role)}
                    disabled={isPending}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                    {(editUser.role === 'Owner' ? ROLES : assignableRoles).map((r) => (
                      <option key={r} value={r}>{t(`role.${r}` as Parameters<typeof t>[0])}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Issuer access — only for non-Owner/Admin, non-self */}
              {editUser.id !== currentUserId && editRole !== 'Owner' && editRole !== 'Admin' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('editDialog.issuers')}</label>
                  <p className="text-xs text-muted-foreground">{t('editDialog.issuersDescription')}</p>
                  {issuers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('editDialog.issuersEmpty')}</p>
                  ) : (
                    <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-border p-2">
                      {issuers.map((issuer) => (
                        <label key={issuer.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer">
                          <input type="checkbox" className="h-3.5 w-3.5 accent-primary"
                            checked={editIssuerIds.includes(issuer.id)}
                            onChange={() => setEditIssuerIds((prev) =>
                              prev.includes(issuer.id) ? prev.filter((id) => id !== issuer.id) : [...prev, issuer.id]
                            )}
                            disabled={isPending} />
                          <span>
                            {issuer.tradeName || issuer.businessName}
                            <span className="ml-1.5 text-xs text-muted-foreground">({issuer.branchCode}-{issuer.issuePointCode})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Reset password — only for active, non-self users */}
              {editUser.id !== currentUserId && editUser.inviteStatus === 'ACTIVE' && (activeStates[editUser.id] ?? editUser.active) && (
                <div className="pt-1 border-t border-border">
                  <button type="button" onClick={() => { setEditUser(null); setResetUserId(editUser.id); }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <KeyRound className="h-3.5 w-3.5" />
                    {t('editDialog.resetPassword')}
                  </button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setEditUser(null)} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
              {isPending ? t('inviting') : t('editDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove confirm ── */}
      <Dialog open={removeUserId !== null} onOpenChange={(v) => { if (!v) setRemoveUserId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('removeDialog.title')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t('removeDialog.description')}</p>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setRemoveUserId(null)} disabled={isPending}>{t('cancel')}</Button>
            <Button size="sm" variant="destructive"
              onClick={() => removeUserId !== null && handleRemove(removeUserId)} disabled={isPending}>
              {isPending ? t('removing') : t('removeDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset password confirm ── */}
      <Dialog open={resetUserId !== null} onOpenChange={(v) => { if (!v) setResetUserId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t('resetPasswordDialog.title')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t('resetPasswordDialog.description')}</p>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setResetUserId(null)} disabled={isPending}>{t('cancel')}</Button>
            <Button size="sm" onClick={handleResetPassword} disabled={isPending}>
              {isPending ? t('inviting') : t('resetPasswordDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Roles info ── */}
      <Dialog open={showRolesInfo} onOpenChange={setShowRolesInfo}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader><DialogTitle>{t('rolesInfo.title')}</DialogTitle></DialogHeader>
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
