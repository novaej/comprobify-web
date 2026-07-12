'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateProfileAction, changePasswordAction } from '@/app/actions/account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toastApiError } from '@/lib/api-error-toast';

export function AccountSettings({
  email,
  firstName,
  lastName,
}: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}) {
  const t = useTranslations('accountSettings');
  const tError = useTranslations('apiError');

  // Profile form
  const [profileFirst, setProfileFirst] = useState(firstName ?? '');
  const [profileLast, setProfileLast] = useState(lastName ?? '');
  const [profilePending, startProfileTransition] = useTransition();

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordPending, startPasswordTransition] = useTransition();

  function handleSaveProfile() {
    startProfileTransition(async () => {
      const result = await updateProfileAction({
        firstName: profileFirst.trim() || null,
        lastName: profileLast.trim() || null,
      });
      if (result?.error) { toastApiError(result.error, tError); }
      else { toast.success(t('profile.saveSuccess')); }
    });
  }

  function handleChangePassword() {
    setPasswordError(null);
    if (newPassword.length < 8) { setPasswordError(t('password.tooShort')); return; }
    if (newPassword !== confirmPassword) { setPasswordError(t('password.mismatch')); return; }

    startPasswordTransition(async () => {
      const result = await changePasswordAction({ currentPassword, newPassword });
      if (result?.error) { toastApiError(result.error, tError); }
      else {
        toast.success(t('password.saveSuccess'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold">{t('profile.title')}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('profile.firstName')}</label>
            <Input
              placeholder={t('profile.firstNamePlaceholder')}
              value={profileFirst}
              onChange={(e) => setProfileFirst(e.target.value)}
              disabled={profilePending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('profile.lastName')}</label>
            <Input
              placeholder={t('profile.lastNamePlaceholder')}
              value={profileLast}
              onChange={(e) => setProfileLast(e.target.value)}
              disabled={profilePending}
            />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('profile.email')}</label>
          <Input value={email} disabled />
          <p className="text-xs text-muted-foreground">{t('profile.emailNote')}</p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSaveProfile} disabled={profilePending}>
            {profilePending ? t('profile.saving') : t('profile.save')}
          </Button>
        </div>
      </div>

      {/* Password card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold">{t('password.title')}</h2>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('password.current')}</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={passwordPending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('password.new')}</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={passwordPending}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('password.confirm')}</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={passwordPending}
            />
          </div>
          {passwordError && (
            <p className="text-xs text-destructive">{passwordError}</p>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            onClick={handleChangePassword}
            disabled={passwordPending || !currentPassword || !newPassword || !confirmPassword}
          >
            {passwordPending ? t('password.saving') : t('password.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
