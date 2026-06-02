'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updatePreferencesAction } from '@/app/actions/notifications';
import { toastApiError } from '@/lib/api-error-toast';
import { cn } from '@/lib/utils';
import { Bell, BellOff, Clock } from 'lucide-react';

// Types currently produced by the API.
const LIVE_TYPES = ['DOCUMENT_AUTHORIZED', 'CERT_EXPIRING', 'CERT_EXPIRED'] as const;
// Types reserved for future implementation.
const RESERVED_TYPES = ['SRI_SUBMISSION_FAILED', 'EMAIL_DELIVERY_FAILED', 'QUOTA_WARNING'] as const;
const ALL_TYPES = [...LIVE_TYPES, ...RESERVED_TYPES] as const;
type NotificationType = (typeof ALL_TYPES)[number];

interface Preference {
  type: string;
  enabled: boolean;
}

interface NotificationPreferencesProps {
  initialPreferences: Preference[];
}

export function NotificationPreferences({ initialPreferences }: NotificationPreferencesProps) {
  const t = useTranslations('notificationPreferences');
  const tTypes = useTranslations('notifications.types');
  const tError = useTranslations('apiError');

  // Build a map from the initial preferences, defaulting missing types to enabled.
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const type of ALL_TYPES) {
      const pref = initialPreferences.find((p) => p.type === type);
      map[type] = pref ? pref.enabled : true;
    }
    return map;
  });

  const [isPending, startTransition] = useTransition();
  // Track which type is currently being saved so we can show its spinner.
  const [savingType, setSavingType] = useState<string | null>(null);

  function handleToggle(type: NotificationType) {
    const next = !enabled[type];
    setEnabled((prev) => ({ ...prev, [type]: next }));
    setSavingType(type);

    startTransition(async () => {
      const result = await updatePreferencesAction([{ type, enabled: next }]);
      setSavingType(null);
      if ('error' in result) {
        // Revert optimistic update on error.
        setEnabled((prev) => ({ ...prev, [type]: !next }));
        toastApiError(result.error, tError);
      } else {
        toast.success(
          next ? t('enabledToast', { type: tTypes(type) }) : t('disabledToast', { type: tTypes(type) })
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Live types */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sectionActive')}
          </h2>
        </div>
        <ul className="divide-y divide-border">
          {LIVE_TYPES.map((type) => (
            <PreferenceRow
              key={type}
              type={type}
              label={tTypes(type)}
              description={t(`descriptions.${type}`)}
              enabled={enabled[type] ?? true}
              isSaving={savingType === type}
              disabled={isPending}
              onToggle={() => handleToggle(type)}
            />
          ))}
        </ul>
      </div>

      {/* Reserved types */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-5 py-3 flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sectionComingSoon')}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t('comingSoonBadge')}
          </span>
        </div>
        <ul className="divide-y divide-border">
          {RESERVED_TYPES.map((type) => (
            <PreferenceRow
              key={type}
              type={type}
              label={tTypes(type)}
              description={t(`descriptions.${type}`)}
              enabled={enabled[type] ?? true}
              isSaving={savingType === type}
              // Disable reserved types — the API accepts the preference but won't
              // produce notifications of these types yet.
              disabled={isPending}
              comingSoon
              onToggle={() => handleToggle(type)}
            />
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground px-1">{t('hint')}</p>
    </div>
  );
}

// ── PreferenceRow ─────────────────────────────────────────────────────────────

function PreferenceRow({
  type,
  label,
  description,
  enabled,
  isSaving,
  disabled,
  comingSoon = false,
  onToggle,
}: {
  type: string;
  label: string;
  description: string;
  enabled: boolean;
  isSaving: boolean;
  disabled: boolean;
  comingSoon?: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('notificationPreferences');

  return (
    <li className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          enabled && !comingSoon
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
        )}>
          {comingSoon ? (
            <Clock className="h-4 w-4" />
          ) : enabled ? (
            <Bell className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className={cn(
            'text-sm font-medium leading-snug',
            (!enabled || comingSoon) && 'text-muted-foreground',
          )}>
            {label}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{description}</p>
          {comingSoon && (
            <span className="mt-1 inline-block text-[10px] text-muted-foreground/60 italic">
              {t('comingSoonNote')}
            </span>
          )}
        </div>
      </div>

      {/* Toggle */}
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? t('disableAriaLabel', { type }) : t('enableAriaLabel', { type })}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          enabled ? 'bg-primary' : 'bg-input',
        )}
      >
        <span className={cn(
          'block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          enabled ? 'translate-x-4' : 'translate-x-0.5',
        )} />
        {isSaving && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white border-t-transparent" />
          </span>
        )}
      </button>
    </li>
  );
}
