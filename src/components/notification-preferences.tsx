'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updatePreferencesAction } from '@/app/actions/notifications';
import { toastApiError } from '@/lib/api-error-toast';
import { cn } from '@/lib/utils';
import { Bell, BellOff, Clock, Lock } from 'lucide-react';
import type { NotificationChannel } from '@/lib/api';

// Which channels each type supports — mirrors comprobify's
// src/constants/notification-catalog.js. PRICE_CHANGE_ANNOUNCED is
// deliberately excluded: it's "mandatory" (no opt-out on any channel), never
// returned by GET, and rejected by PATCH — see its own locked row below.
const TYPE_CHANNELS: Record<string, NotificationChannel[]> = {
  DOCUMENT_AUTHORIZED: ['IN_APP'],
  CERT_EXPIRING: ['IN_APP'],
  CERT_EXPIRED: ['IN_APP'],
  SRI_SUBMISSION_FAILED: ['IN_APP'],
  EMAIL_DELIVERY_FAILED: ['IN_APP'],
  QUOTA_WARNING: ['IN_APP'],
  PAYMENT_VERIFIED: ['IN_APP', 'EMAIL'],
  PAYMENT_REJECTED: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_RENEWAL_DUE: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_PAST_DUE_WARNING: ['IN_APP', 'EMAIL'],
  SUBSCRIPTION_EXPIRED: ['IN_APP', 'EMAIL'],
};

// Types currently produced by the API.
const LIVE_TYPES = [
  'DOCUMENT_AUTHORIZED',
  'CERT_EXPIRING',
  'CERT_EXPIRED',
  'PAYMENT_VERIFIED',
  'PAYMENT_REJECTED',
  'SUBSCRIPTION_RENEWAL_DUE',
  'SUBSCRIPTION_PAST_DUE_WARNING',
  'SUBSCRIPTION_EXPIRED',
] as const;
// Types reserved for future implementation.
const RESERVED_TYPES = ['SRI_SUBMISSION_FAILED', 'EMAIL_DELIVERY_FAILED', 'QUOTA_WARNING'] as const;
const ALL_TYPES = [...LIVE_TYPES, ...RESERVED_TYPES] as const;
type NotificationType = (typeof ALL_TYPES)[number];

interface Preference {
  type: string;
  channel: NotificationChannel;
  enabled: boolean;
}

interface NotificationPreferencesProps {
  initialPreferences: Preference[];
}

// Nested map: type -> channel -> enabled.
type EnabledMap = Record<string, Partial<Record<NotificationChannel, boolean>>>;

export function NotificationPreferences({ initialPreferences }: NotificationPreferencesProps) {
  const t = useTranslations('notificationPreferences');
  const tTypes = useTranslations('notifications.types');
  const tError = useTranslations('apiError');

  // Build a map from the initial preferences, defaulting missing combinations to enabled.
  const [enabled, setEnabled] = useState<EnabledMap>(() => {
    const map: EnabledMap = {};
    for (const type of ALL_TYPES) {
      map[type] = {};
      for (const channel of TYPE_CHANNELS[type] ?? ['IN_APP']) {
        const pref = initialPreferences.find((p) => p.type === type && p.channel === channel);
        map[type][channel] = pref ? pref.enabled : true;
      }
    }
    return map;
  });

  const [isPending, startTransition] = useTransition();
  // Track which (type, channel) pair is currently being saved so we can show its spinner.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  function handleToggle(type: NotificationType, channel: NotificationChannel) {
    const next = !enabled[type]?.[channel];
    const key = `${type}:${channel}`;
    setEnabled((prev) => ({ ...prev, [type]: { ...prev[type], [channel]: next } }));
    setSavingKey(key);

    startTransition(async () => {
      const result = await updatePreferencesAction([{ type, channel, enabled: next }]);
      setSavingKey(null);
      if ('error' in result) {
        // Revert optimistic update on error.
        setEnabled((prev) => ({ ...prev, [type]: { ...prev[type], [channel]: !next } }));
        toastApiError(result.error, tError);
      } else {
        const label = t(`channels.${channel}`) + ' · ' + tTypes(type);
        toast.success(
          next ? t('enabledToast', { type: label }) : t('disabledToast', { type: label })
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Mandatory types — always on, cannot be disabled on any channel */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sectionMandatory')}
          </h2>
        </div>
        <ul className="divide-y divide-border">
          <li className="flex items-start gap-3 px-5 py-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{tTypes('PRICE_CHANGE_ANNOUNCED')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">
                {t('descriptions.PRICE_CHANGE_ANNOUNCED')}
              </p>
              <span className="mt-1 inline-block text-[10px] text-muted-foreground/60 italic">
                {t('mandatoryNote')}
              </span>
            </div>
          </li>
        </ul>
      </div>

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
              channels={TYPE_CHANNELS[type] ?? ['IN_APP']}
              enabled={enabled[type] ?? {}}
              savingKey={savingKey}
              disabled={isPending}
              onToggle={(channel) => handleToggle(type, channel)}
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
              channels={TYPE_CHANNELS[type] ?? ['IN_APP']}
              enabled={enabled[type] ?? {}}
              savingKey={savingKey}
              // Disable reserved types — the API accepts the preference but won't
              // produce notifications of these types yet.
              disabled={isPending}
              comingSoon
              onToggle={(channel) => handleToggle(type, channel)}
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
  channels,
  enabled,
  savingKey,
  disabled,
  comingSoon = false,
  onToggle,
}: {
  type: string;
  label: string;
  description: string;
  channels: NotificationChannel[];
  enabled: Partial<Record<NotificationChannel, boolean>>;
  savingKey: string | null;
  disabled: boolean;
  comingSoon?: boolean;
  onToggle: (channel: NotificationChannel) => void;
}) {
  const t = useTranslations('notificationPreferences');
  const anyEnabled = channels.some((channel) => enabled[channel]);

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          anyEnabled && !comingSoon
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground',
        )}>
          {comingSoon ? (
            <Clock className="h-4 w-4" />
          ) : anyEnabled ? (
            <Bell className="h-4 w-4" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className={cn(
            'text-sm font-medium leading-snug',
            (!anyEnabled || comingSoon) && 'text-muted-foreground',
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

      {/* One toggle per supported channel */}
      <div className="flex shrink-0 items-center gap-4 pl-11 sm:pl-0">
        {channels.map((channel) => {
          const channelEnabled = enabled[channel] ?? true;
          const isSaving = savingKey === `${type}:${channel}`;
          return (
            <div key={channel} className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(`channels.${channel}`)}
              </span>
              <button
                role="switch"
                aria-checked={channelEnabled}
                aria-label={
                  channelEnabled
                    ? t('disableAriaLabel', { type: `${type} (${channel})` })
                    : t('enableAriaLabel', { type: `${type} (${channel})` })
                }
                onClick={() => onToggle(channel)}
                disabled={disabled}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  channelEnabled ? 'bg-primary' : 'bg-input',
                )}
              >
                <span className={cn(
                  'block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  channelEnabled ? 'translate-x-4' : 'translate-x-0.5',
                )} />
                {isSaving && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-2.5 w-2.5 animate-spin rounded-full border border-white border-t-transparent" />
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </li>
  );
}
