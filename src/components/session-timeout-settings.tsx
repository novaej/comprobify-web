'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateTenantAction } from '@/app/actions/tenant';
import {
  DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
  MIN_SESSION_IDLE_TIMEOUT_MINUTES,
  MAX_SESSION_IDLE_TIMEOUT_MINUTES,
} from '@/lib/session-timeout';
import { Check } from 'lucide-react';

interface SessionTimeoutSettingsProps {
  // Tenant.sessionIdleTimeoutMinutes as stored — null means "using the system default."
  currentValue: number | null;
}

export function SessionTimeoutSettings({ currentValue }: SessionTimeoutSettingsProps) {
  const t = useTranslations('settings.security');
  const tError = useTranslations('settingsError');
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(currentValue ?? DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isDefault = currentValue === null;

  function showError(code: string) {
    setError(tError.has(code as Parameters<typeof tError>[0]) ? tError(code as Parameters<typeof tError>[0]) : code);
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateTenantAction({ sessionIdleTimeoutMinutes: value });
      if (result?.error) {
        showError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  function handleReset() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateTenantAction({ sessionIdleTimeoutMinutes: null });
      if (result?.error) {
        showError(result.error);
        return;
      }
      setValue(DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES);
      setSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor="idle-timeout">{t('idleTimeoutLabel')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="idle-timeout"
              type="number"
              min={MIN_SESSION_IDLE_TIMEOUT_MINUTES}
              max={MAX_SESSION_IDLE_TIMEOUT_MINUTES}
              value={value}
              onChange={(e) => {
                setValue(Number(e.target.value));
                setSaved(false);
              }}
              disabled={isPending}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">{t('minutes')}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {!isDefault && (
            <Button size="sm" variant="outline" onClick={handleReset} disabled={isPending}>
              {t('useDefault')}
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {isDefault
          ? t('currentlyDefault', { minutes: DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES })
          : t('currentlyCustom')}
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && (
        <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
          {t('saved')}
        </p>
      )}
    </div>
  );
}
